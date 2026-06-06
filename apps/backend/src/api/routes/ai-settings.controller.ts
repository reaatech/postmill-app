import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { SaveGovernanceDto } from '@gitroom/nestjs-libraries/dtos/ai-settings/governance.dto';
import { AIProviderRegistry } from '@gitroom/nestjs-libraries/ai/ai-provider.registry';
import { ProviderHealthService } from '@gitroom/nestjs-libraries/ai/governance/provider-health.service';
import { GuardrailService } from '@gitroom/nestjs-libraries/ai/governance/guardrail.service';
import { BudgetService } from '@gitroom/nestjs-libraries/ai/governance/budget.service';
import { RagService } from '@gitroom/nestjs-libraries/ai/governance/rag.service';
import { AIScope } from '@gitroom/nestjs-libraries/ai/ai-provider.interface';

@ApiTags('AI Settings')
@Controller('/admin/ai-settings')
export class AiSettingsController {
  private readonly VALID_SCOPES: AIScope[] = ['utility', 'generator', 'agent', 'mcp'];
  private readonly SENSITIVE_KEY_PATTERNS = [
    'apikey',
    'api_key',
    'secret',
    'password',
    'token',
    'credential',
    'authorization',
    'bearer',
    'privatekey',
    'private_key',
  ];

  constructor(
    private _aiSettingsService: AiSettingsService,
    private _aiSettingsManager: AiSettingsManager,
    private _registry: AIProviderRegistry,
    private _providerHealth: ProviderHealthService,
    private _guardrails: GuardrailService,
    private _budgetService: BudgetService,
    private _ragService: RagService,
  ) {}

  private assertSuperAdmin(user: User) {
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private _isSensitiveKey(key: string) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return this.SENSITIVE_KEY_PATTERNS.some((pattern) =>
      normalized.includes(pattern.replace(/[^a-z0-9]/g, '')),
    );
  }

  private _redactSensitive(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this._redactSensitive(item));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }

    return Object.entries(value).reduce((acc, [key, item]) => {
      acc[key] = this._isSensitiveKey(key)
        ? '[REDACTED]'
        : this._redactSensitive(item);
      return acc;
    }, {} as Record<string, any>);
  }

  private _safeJson(raw: any) {
    if (!raw) return null;
    if (typeof raw !== 'string') return this._redactSensitive(raw);
    try {
      return this._redactSensitive(JSON.parse(raw));
    } catch {
      return '[REDACTED_UNPARSEABLE_CONFIG]';
    }
  }

  private _isProviderConfigured(
    adapter: ReturnType<AIProviderRegistry['getAdapter']>,
    config: Awaited<ReturnType<AiSettingsService['getProviderConfigByIdentifier']>>,
  ) {
    if (!adapter || !config) return false;

    try {
      const decrypted = this._aiSettingsService.decryptProviderConfig(config);
      const credentials = decrypted.credentials || {};
      return adapter.credentialFields
        .filter((field) => field.required)
        .every((field) => {
          const value = credentials[field.key];
          return typeof value === 'string' && value.trim().length > 0;
        });
    } catch {
      return false;
    }
  }

  @Get('/providers')
  async listProviders(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const adapters = this._registry.list();
    const dbConfigs = await this._aiSettingsService.getProviderConfigs();
    const dbConfigMap = new Map(dbConfigs.map((c) => [c.identifier, c]));

    return adapters.map((adapter) => {
      const dbConfig = dbConfigMap.get(adapter.identifier);
      const isConfigured = this._isProviderConfigured(adapter, dbConfig);

      return {
        identifier: adapter.identifier,
        name: adapter.name,
        type: adapter.type,
        capabilities: adapter.capabilities,
        privacy: adapter.privacy,
        enabled: dbConfig?.enabled || false,
        isConfigured,
        credentialFields: adapter.credentialFields,
      };
    });
  }

  @Get('/providers/:identifier')
  async getProvider(
    @GetUserFromRequest() user: User,
    @Param('identifier') identifier: string,
  ) {
    this.assertSuperAdmin(user);
    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) throw new BadRequestException('Unknown provider');

    const config = await this._aiSettingsService.getProviderConfigByIdentifier(identifier);
    const isConfigured = this._isProviderConfigured(adapter, config);

    let creds: Record<string, string> = {};
    if (config) {
      try {
        const d = this._aiSettingsService.decryptProviderConfig(config);
        creds = d?.credentials || {};
      } catch { /* use empty creds */ }
    }
    const models = await adapter.listModels(creds);

    return {
      identifier: adapter.identifier,
      name: adapter.name,
      type: adapter.type,
      capabilities: adapter.capabilities,
      privacy: adapter.privacy,
      credentialFields: adapter.credentialFields,
      enabled: config?.enabled || false,
      isConfigured,
      defaultModel: config?.defaultModel || '',
      imageModel: config?.imageModel || '',
      extraConfig: this._safeJson(config?.extraConfig),
      models,
    };
  }

  @Put('/providers/:identifier')
  async saveProvider(
    @GetUserFromRequest() user: User,
    @Param('identifier') identifier: string,
    @Body()
    body: {
      enabled?: boolean;
      credentials?: Record<string, string>;
      defaultModel?: string;
      imageModel?: string;
      extraConfig?: Record<string, any>;
    },
  ) {
    this.assertSuperAdmin(user);
    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) throw new BadRequestException('Unknown provider');

    const before = await this._aiSettingsService.getProviderConfigByIdentifier(identifier);
    const result = await this._aiSettingsService.upsertProviderConfig(identifier, {
      enabled: body.enabled,
      credentials: body.credentials,
      defaultModel: body.defaultModel,
      imageModel: body.imageModel,
      extraConfig: body.extraConfig,
    });

    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'update-provider',
      detail: JSON.stringify({
        identifier,
        before: before
          ? {
              enabled: before.enabled,
              defaultModel: before.defaultModel,
              imageModel: before.imageModel,
              hasCredentials: !!before.credentials,
            }
          : null,
        after: {
          enabled: result.enabled,
          defaultModel: result.defaultModel,
          imageModel: result.imageModel,
          hasCredentials: !!result.credentials,
        },
        credentialsUpdated: body.credentials !== undefined,
      }),
    });

    await this._aiSettingsManager.refreshCache();

    return { identifier, enabled: result.enabled, updatedAt: result.updatedAt };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('/providers/:identifier/test')
  async testProvider(
    @GetUserFromRequest() user: User,
    @Param('identifier') identifier: string,
    @Body() body: { credentials?: Record<string, string> },
  ) {
    this.assertSuperAdmin(user);
    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) throw new BadRequestException('Unknown provider');

    let creds = body.credentials || {};
    if (!creds || Object.keys(creds).length === 0) {
      try {
        const config = await this._aiSettingsService.getProviderConfigByIdentifier(identifier);
        const decrypted = config ? this._aiSettingsService.decryptProviderConfig(config) : undefined;
        creds = decrypted?.credentials || {};
      } catch (err) {
        throw new HttpException('Failed to decrypt provider credentials — JWT_SECRET may have changed', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    return adapter.validateCredentials(creds);
  }

  @Put('/active')
  async setActive(
    @GetUserFromRequest() user: User,
    @Body() body: { provider?: string | null; model?: string | null },
  ) {
    this.assertSuperAdmin(user);
    if (!body.provider) {
      await this._aiSettingsService.upsertSystemSettings({
        activeProvider: null,
        activeModel: null,
      });

      await this._aiSettingsService.createAuditLog({
        userId: user.id,
        action: 'set-active',
        detail: JSON.stringify({ provider: null, model: null }),
      });

      await this._aiSettingsManager.refreshCache();

      return { activeProvider: null, activeModel: null };
    }

    const adapter = this._registry.getAdapter(body.provider);
    if (!adapter) throw new BadRequestException('Unknown provider');
    if (!body.model) throw new BadRequestException('model is required');

    const config = await this._aiSettingsService.getProviderConfigByIdentifier(body.provider);
    if (!config?.enabled || !this._isProviderConfigured(adapter, config)) {
      throw new BadRequestException(
        'Provider must be enabled and configured before it can be activated',
      );
    }

    await this._aiSettingsService.upsertSystemSettings({
      activeProvider: body.provider,
      activeModel: body.model,
    });

    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'set-active',
      detail: JSON.stringify({ provider: body.provider, model: body.model }),
    });

    await this._aiSettingsManager.refreshCache();

    return { activeProvider: body.provider, activeModel: body.model };
  }

  @Get('/governance')
  async getGovernance(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const settings = await this._aiSettingsService.getSystemSettings();
    if (!settings) return {};

    const safeParse = (val: string | null | undefined) => {
      if (!val) return null;
      if (typeof val !== 'string') return val;
      const trimmed = val.trim();
      if (!trimmed) return null;
      try { return JSON.parse(trimmed); } catch { return null; }
    };

    return {
      guardrailSettings: safeParse(settings.guardrailSettings),
      budgetSettings: safeParse(settings.budgetSettings),
      rateLimitSettings: safeParse(settings.rateLimitSettings),
      observability: safeParse(settings.observability),
      mcpSettings: safeParse(settings.mcpSettings),
      ragSettings: safeParse(settings.ragSettings),
      scopeModels: safeParse(settings.scopeModels),
      fallbackProvider: settings.fallbackProvider,
      fallbackImageProvider: settings.fallbackImageProvider,
    };
  }

  @Put('/governance')
  async saveGovernance(
    @GetUserFromRequest() user: User,
    @Body() body: SaveGovernanceDto,
  ) {
    this.assertSuperAdmin(user);

    if (body.ragSettings !== undefined) {
      const settings = await this._aiSettingsService.getSystemSettings();
      if (settings?.ragSettings) {
        try {
          const existing = JSON.parse(settings.ragSettings);
          if (existing.mediaProviders && !body.ragSettings.mediaProviders) {
            body.ragSettings = { ...body.ragSettings, mediaProviders: existing.mediaProviders };
          }
        } catch { /* ignore */ }
      }
    }

    await this._aiSettingsService.upsertSystemSettings({
      guardrailSettings: body.guardrailSettings,
      budgetSettings: body.budgetSettings,
      rateLimitSettings: body.rateLimitSettings,
      observability: body.observability,
      mcpSettings: body.mcpSettings,
      ragSettings: body.ragSettings,
      scopeModels: body.scopeModels,
      fallbackProvider: body.fallbackProvider,
      fallbackImageProvider: body.fallbackImageProvider,
    });

    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'update-governance',
      detail: JSON.stringify({ updated: Object.keys(body).join(',') }),
    });

    await this._aiSettingsManager.refreshCache();

    return { success: true };
  }

  @Get('/spend')
  async getSpend(
    @GetUserFromRequest() user: User,
    @Query('scope') scope?: string,
    @Query('provider') provider?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertSuperAdmin(user);
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this._aiSettingsService.getSpendLogs({
      scope,
      provider,
      offset: parsedOffset !== undefined && parsedOffset < 0 ? 0 : parsedOffset,
      limit: parsedLimit < 1 ? 1 : parsedLimit > 1000 ? 1000 : parsedLimit,
    });
  }

  @Get('/spend/summary')
  async getSpendSummary(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._aiSettingsService.getSpendSummary();
  }

  @Get('/audit')
  async getAudit(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    return this._aiSettingsService.getAuditLogs();
  }

  @Get('/health')
  async getHealth(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const settings = await this._aiSettingsManager.getSettings();
    return {
      hasActiveConfig: !!settings?.activeProvider,
      activeProvider: settings?.activeProvider || null,
      activeModel: settings?.activeModel || null,
      envFallback: !!process.env.OPENAI_API_KEY,
      providerHealth: this._providerHealth.getAllHealth(),
    };
  }

  @Post('/providers/:id/preview')
  async previewProvider(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: { prompt?: string },
  ) {
    this.assertSuperAdmin(user);
    const adapter = this._registry.getAdapter(id);
    if (!adapter) throw new BadRequestException('Unknown provider');

    const budgetCheck = await this._budgetService.checkBudget('preview', undefined);
    if (!budgetCheck.allowed) {
      throw new HttpException(
        budgetCheck.reason || 'Budget exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const config = await this._aiSettingsService.getProviderConfigByIdentifier(id);
    let creds: Record<string, string> = {};
    try {
      const decrypted = config ? this._aiSettingsService.decryptProviderConfig(config) : undefined;
      creds = decrypted?.credentials || {};
    } catch (err) {
      throw new HttpException('Failed to decrypt provider credentials — JWT_SECRET may have changed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const modelId = config?.defaultModel || 'gpt-4o-mini';
    const rawPrompt = body.prompt || 'Generate a short one-sentence response: Hello, how can I help you?';

    const checkedPrompt = await this._guardrails.checkInput(rawPrompt);
    const model = adapter.createLanguageModel(creds, modelId);
    const result = await (model as any).doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: checkedPrompt }] }],
    });

    const extractText = (r: any): string =>
      typeof r?.text === 'string'
        ? r.text
        : (Array.isArray(r?.content) ? r.content : [])
            .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
            .map((p: any) => p.text)
            .join('');
    const outputText = extractText(result);
    const checked = await this._guardrails.checkOutput(outputText);

    await this._aiSettingsService.createSpendLog({
      provider: id,
      model: modelId,
      scope: 'preview',
      inputTokens: result.usage?.inputTokens ?? result.usage?.promptTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? result.usage?.completionTokens ?? 0,
      costUsd: 0,
    });

    return { text: checked };
  }

  @Put('/scope-models')
  async setScopeModels(
    @GetUserFromRequest() user: User,
    @Body() body: { scopeModels: Record<string, { provider?: string; model?: string }> },
  ) {
    this.assertSuperAdmin(user);
    const scopes = Object.keys(body.scopeModels);
    for (const scope of scopes) {
      if (!(this.VALID_SCOPES as string[]).includes(scope)) {
        throw new BadRequestException(`Invalid scope: ${scope}. Valid scopes: ${this.VALID_SCOPES.join(', ')}`);
      }
    }

    await this._aiSettingsService.upsertSystemSettings({ scopeModels: body.scopeModels });
    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'set-scope-models',
      detail: JSON.stringify({ scopeModels: body.scopeModels }),
    });
    await this._aiSettingsManager.refreshCache();

    return { success: true };
  }

  @Get('/scope-models')
  async getScopeModels(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const settings = await this._aiSettingsService.getSystemSettings();
    if (!settings?.scopeModels) return {};
    if (typeof settings.scopeModels === 'string') {
      try { return JSON.parse(settings.scopeModels); } catch { return {}; }
    }
    return settings.scopeModels;
  }

  @Get('/rag')
  async getRagSettings(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const settings = await this._aiSettingsService.getSystemSettings();
    return settings?.ragSettings ? JSON.parse(settings.ragSettings) : {};
  }

  @Put('/rag')
  async saveRagSettings(
    @GetUserFromRequest() user: User,
    @Body() body: { ragSettings: Record<string, any> },
  ) {
    this.assertSuperAdmin(user);
    const rag = body.ragSettings;
    if (rag.vectorStore && !['pgvector', 'qdrant'].includes(rag.vectorStore)) {
      throw new BadRequestException('vectorStore must be "pgvector" or "qdrant"');
    }

    const settings = await this._aiSettingsService.getSystemSettings();
    if (settings?.ragSettings) {
      try {
        const existing = JSON.parse(settings.ragSettings);
        if (existing.mediaProviders && !rag.mediaProviders) {
          rag.mediaProviders = existing.mediaProviders;
        }
      } catch { /* ignore */ }
    }

    await this._aiSettingsService.upsertSystemSettings({ ragSettings: rag });
    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'update-rag',
      detail: JSON.stringify(this._redactSensitive(rag)),
    });
    await this._aiSettingsManager.refreshCache();

    return { success: true };
  }

  @Get('/media-providers')
  async listMediaProviders(@GetUserFromRequest() user: User) {
    this.assertSuperAdmin(user);
    const adapters = this._registry.list().filter(
      (a) =>
        typeof a.createImageModel === 'function' ||
        typeof a.createSpeechModel === 'function' ||
        (a.capabilities?.image || a.capabilities?.speech),
    );
    const dbConfigs = await this._aiSettingsService.getProviderConfigs();
    const dbConfigMap = new Map(dbConfigs.map((c) => [c.identifier, c]));

    const settings = await this._aiSettingsService.getSystemSettings();
    let mediaProviderSettings: Record<string, any> = {};
    if (settings?.ragSettings) {
      try {
        const rag = JSON.parse(settings.ragSettings);
        mediaProviderSettings = rag.mediaProviders || {};
      } catch {
        /* ignore parse error */
      }
    }

    return adapters.map((adapter) => {
      const dbConfig = dbConfigMap.get(adapter.identifier);
      const isConfigured = this._isProviderConfigured(adapter, dbConfig);

      const providerSettings =
        mediaProviderSettings[adapter.identifier] || {};

      const hasImage =
        typeof adapter.createImageModel === 'function' ||
        adapter.capabilities?.image;
      const hasSpeech =
        typeof adapter.createSpeechModel === 'function' ||
        adapter.capabilities?.speech;
      const hasEmbedding =
        typeof adapter.createEmbeddingModel === 'function' ||
        adapter.capabilities?.embeddings;

      const supportedOperations: string[] = [];
      if (hasImage) supportedOperations.push('image');
      if (hasSpeech) supportedOperations.push('tts', 'stt');
      if (hasEmbedding) supportedOperations.push('embedding');

      return {
        identifier: adapter.identifier,
        name: adapter.name,
        capabilities: adapter.capabilities,
        isConfigured,
        enabled: providerSettings.enabled ?? false,
        operations: providerSettings.operations ?? [],
        supportedOperations,
        c2paAvailable: providerSettings.c2paAvailable ?? false,
      };
    });
  }

  @Put('/media-providers/:id')
  async saveMediaProvider(
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: { enabled?: boolean; operations?: string[]; c2paAvailable?: boolean },
  ) {
    this.assertSuperAdmin(user);
    const adapter = this._registry.getAdapter(id);
    if (!adapter) throw new BadRequestException('Unknown provider');

    const settings = await this._aiSettingsService.getSystemSettings();
    let rag: Record<string, any> = {};
    if (settings?.ragSettings) {
      try {
        rag = JSON.parse(settings.ragSettings);
      } catch {
        /* ignore parse error */
      }
    }

    const mediaProviders: Record<string, any> = rag.mediaProviders || {};
    const existing = mediaProviders[id] || {};
    if (body.enabled !== undefined) existing.enabled = body.enabled;
    if (body.operations !== undefined) existing.operations = body.operations;
    if (body.c2paAvailable !== undefined) existing.c2paAvailable = body.c2paAvailable;
    mediaProviders[id] = existing;

    rag.mediaProviders = mediaProviders;

    await this._aiSettingsService.upsertSystemSettings({ ragSettings: rag });
    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'update-media-provider',
      detail: JSON.stringify({ identifier: id, ...existing }),
    });
    await this._aiSettingsManager.refreshCache();

    return { identifier: id, ...existing };
  }

  @Post('/rag/backfill')
  async triggerRagBackfill(
    @GetUserFromRequest() user: User,
    @Body() body: { organizationId?: string },
  ) {
    this.assertSuperAdmin(user);
    const orgId = body.organizationId;
    if (!orgId) {
      throw new BadRequestException('organizationId is required for RAG backfill');
    }

    try {
      const result = await this._ragService.backfill(orgId);

      await this._aiSettingsService.createSpendLog({
        organizationId: orgId,
        provider: 'rag',
        model: 'backfill',
        scope: 'backfill',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      });

      return {
        status: 'completed',
        organizationId: orgId,
        ...result,
      };
    } catch (err) {
      return {
        status: 'failed',
        organizationId: orgId,
        error: (err as Error).message,
      };
    }
  }

  @Put('/secret-settings')
  async updateSecretSettings(
    @GetUserFromRequest() user: User,
    @Body() body: { secretSettings: Record<string, string> },
  ) {
    this.assertSuperAdmin(user);
    const settings = await this._aiSettingsService.getDecryptedSystemSettings();
    const existing = settings?.secretSettings || {};
    const merged = { ...existing, ...body.secretSettings };

    await this._aiSettingsService.upsertSystemSettings({ secretSettings: merged });
    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'update-secret-settings',
      detail: JSON.stringify({ updated: Object.keys(body.secretSettings) }),
    });
    await this._aiSettingsManager.refreshCache();

    return { success: true };
  }

  @Get('/org-providers/:orgId')
  async listOrgProviderConfigs(
    @GetUserFromRequest() user: User,
    @Param('orgId') orgId: string,
  ) {
    this.assertSuperAdmin(user);
    const configs = await this._aiSettingsService.getOrgProviderConfigs(orgId);
    return configs.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      identifier: c.identifier,
      enabled: c.enabled,
      defaultModel: c.defaultModel,
      imageModel: c.imageModel,
      extraConfig: this._safeJson(c.extraConfig),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  @Put('/org-providers/:orgId/:identifier')
  async upsertOrgProviderConfig(
    @GetUserFromRequest() user: User,
    @Param('orgId') orgId: string,
    @Param('identifier') identifier: string,
    @Body()
    body: {
      enabled?: boolean;
      credentials?: Record<string, string>;
      defaultModel?: string;
      imageModel?: string;
      extraConfig?: Record<string, any>;
    },
  ) {
    this.assertSuperAdmin(user);
    const before = await this._aiSettingsService.getOrgProviderConfig(orgId, identifier);
    const result = await this._aiSettingsService.upsertOrgProviderConfig(
      orgId,
      identifier,
      body,
    );

    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'upsert-org-provider',
      detail: JSON.stringify({
        organizationId: orgId,
        identifier,
        before: before
          ? {
              enabled: before.enabled,
              defaultModel: before.defaultModel,
              imageModel: before.imageModel,
              hasCredentials: !!before.credentials,
            }
          : null,
        after: {
          enabled: result.enabled,
          defaultModel: result.defaultModel,
          imageModel: result.imageModel,
          hasCredentials: !!result.credentials,
        },
        credentialsUpdated: body.credentials !== undefined,
      }),
    });

    return { identifier: result.identifier, enabled: result.enabled, updatedAt: result.updatedAt };
  }

  @Delete('/org-providers/:orgId/:identifier')
  async deleteOrgProviderConfig(
    @GetUserFromRequest() user: User,
    @Param('orgId') orgId: string,
    @Param('identifier') identifier: string,
  ) {
    this.assertSuperAdmin(user);
    await this._aiSettingsService.deleteOrgProviderConfig(orgId, identifier);

    await this._aiSettingsService.createAuditLog({
      userId: user.id,
      action: 'delete-org-provider',
      detail: JSON.stringify({ organizationId: orgId, identifier }),
    });

    return { success: true };
  }
}

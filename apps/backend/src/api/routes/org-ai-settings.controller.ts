import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OrgAiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service';
import { DefaultsSeedService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-seed.service';
import { DefaultsResolutionService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-resolution.service';
import { DefaultsSettingsValidator } from '@gitroom/nestjs-libraries/ai/defaults/defaults-settings.validator';
import { OrgDefaultModelRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-default-model.repository';
import { AI_MODEL_CATEGORIES } from '@gitroom/nestjs-libraries/ai/defaults/default-categories';
import { SetDefaultModelDto } from '@gitroom/nestjs-libraries/dtos/ai-settings/default-model.dto';
import { AIProviderAdapter } from '@gitroom/nestjs-libraries/ai/ai-provider.interface';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ProviderConfigDto } from '@gitroom/nestjs-libraries/types/provider-config.types';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { ProviderKernel, DEFAULT_VERSION } from '@gitroom/provider-kernel';

export type ProviderConfigSummary = Pick<
  ProviderConfigDto,
  'identifier' | 'name' | 'enabled' | 'isActive' | 'version'
>;

@ApiTags('Org AI Settings')
@Controller('/settings/ai')
export class OrgAiSettingsController {
  constructor(
    private _orgAiSettings: OrgAiSettingsService,
    private _defaultsSeed: DefaultsSeedService,
    private _defaultsResolution: DefaultsResolutionService,
    private _defaultsRepository: OrgDefaultModelRepository,
    private _resolution: ProviderResolutionService,
    private _settingsValidator: DefaultsSettingsValidator,
    @Optional()
    @Inject(PROVIDER_KERNEL)
    private _kernel?: ProviderKernel,
  ) {}

  private _bustDefaultsCatalogCache(orgId: string): void {
    // Best-effort cache invalidation; never fail the request if Redis is down.
    // AI provider changes affect both AI and media candidates (media union includes
    // AI providers), so both catalog keyspaces must be cleared.
    try {
      const prefixes = [
        `settings:ai:defaults:catalog:${orgId}:`,
        `settings:content:media-defaults:catalog:${orgId}:`,
      ];
      for (const prefix of prefixes) {
        ioRedis
          .keys(`${prefix}*`)
          .then((keys) => {
            if (keys.length) ioRedis.del(...keys);
          })
          .catch(() => undefined);
      }
    } catch {}
  }

  // Resolve a single AI adapter through the ProviderKernel; undefined for an
  // unknown/unregistered provider (mirrors the old registry.getAdapter).
  private _resolveAdapter(identifier: string, version?: string): AIProviderAdapter | undefined {
    try {
      return this._resolution.resolveAI(identifier, version ? { version } : {});
    } catch {
      return undefined;
    }
  }

  // Enumerate the registered AI adapters (one per provider id) — replaces the
  // legacy in-memory registry enumeration.
  private _listAdapters(): AIProviderAdapter[] {
    const seen = new Set<string>();
    const out: AIProviderAdapter[] = [];
    for (const manifest of this._kernel?.listManifests('ai') ?? []) {
      if (seen.has(manifest.providerId)) continue;
      seen.add(manifest.providerId);
      const adapter = this._resolveAdapter(manifest.providerId, manifest.version);
      if (adapter) out.push(adapter);
    }
    return out;
  }

  private _providerLabel(candidate: { providerId: string; metadata: { uiName?: string } }): string {
    return candidate.metadata.uiName
      ? `${candidate.providerId}-${candidate.metadata.uiName}`
      : candidate.providerId;
  }

  private _aiVersionMeta(identifier: string) {
    const manifests = this._kernel?.versions('ai', identifier) ?? [];
    const latestActive = this._kernel?.latestActive('ai', identifier)?.manifest;
    const version = latestActive?.version ?? manifests[0]?.version ?? DEFAULT_VERSION;
    const status = latestActive?.status ?? manifests[0]?.status ?? 'active';
    const availableVersions = manifests.map((m) => ({
      version: m.version,
      status: m.status,
      credentialFields: m.credentialFields,
    }));
    return { version, status, availableVersions, credentialFields: latestActive?.credentialFields ?? manifests[0]?.credentialFields };
  }

  @Get('/providers')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listProviders() {
    const adapters = this._listAdapters();
    return adapters.map((adapter) => {
      const meta = this._aiVersionMeta(adapter.identifier);
      return {
        identifier: adapter.identifier,
        name: adapter.name,
        type: adapter.type,
        capabilities: adapter.capabilities,
        privacy: adapter.privacy,
        credentialFields: meta.credentialFields ?? adapter.credentialFields,
        ...meta,
      };
    });
  }

  @Get('/config')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getConfig(@GetOrgFromRequest() org: Organization): Promise<{
    active: ProviderConfigSummary | null;
    providers: ProviderConfigSummary[];
  }> {
    const active = await this._orgAiSettings.getActiveProvider(org.id);
    const allConfigs = await this._orgAiSettings.getProviders(org.id);
    // Never ship decrypted provider credentials to the client (#53). The active
    // provider's credentials stay server-side for model resolution only.
    const safeActive = active
      ? (({ credentials, ...rest }) => ({ ...rest, ...this._aiVersionMeta(rest.identifier) }))(active as any)
      : null;
    return {
      active: safeActive,
      providers: allConfigs.map((p: any) => ({ ...p, ...this._aiVersionMeta(p.identifier) })),
    };
  }

  @Put('/config/:identifier')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async upsertConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body()
    body: {
      credentials?: Record<string, string>;
      defaultModel?: string;
      reasoningModel?: string;
      version?: string;
    },
  ) {
    const adapter = this._resolveAdapter(identifier, body.version);
    if (!adapter) throw new BadRequestException('Unknown provider');

    await this._orgAiSettings.upsert(org.id, identifier, {
      enabled: true,
      credentials: body.credentials,
      defaultModel: body.defaultModel,
      reasoningModel: body.reasoningModel,
      version: body.version,
    });

    // Eagerly seed any unset model/media defaults now that a provider is available.
    // Intentionally detached + non-fatal: seeding must never delay or fail the provider
    // config response (the .catch swallows errors, which the seed service also logs).
    this._defaultsSeed.seedUnset(org.id).catch(() => undefined);
    this._bustDefaultsCatalogCache(org.id);

    return { identifier, success: true };
  }

  @Post('/config/:identifier/set-active')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async setActive(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: { version?: string } = {},
  ) {
    try {
      const result = await this._orgAiSettings.setActive(org.id, identifier, body.version);

      // Eagerly seed any unset model/media defaults now that the active provider changed.
      this._defaultsSeed.seedUnset(org.id).catch(() => undefined);
      this._bustDefaultsCatalogCache(org.id);

      return { identifier, isActive: result.isActive };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('/config/:identifier/test')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async testConnection(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: { credentials?: Record<string, string> },
  ) {
    const adapter = this._resolveAdapter(identifier);
    if (!adapter) throw new BadRequestException('Unknown provider');

    if (body.credentials) {
      return adapter.validateCredentials(body.credentials);
    }

    try {
      return await this._orgAiSettings.testConnection(org.id, identifier);
    } catch (err) {
      throw new HttpException(
        (err as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('/config/:identifier')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
  ) {
    await this._orgAiSettings.delete(org.id, identifier);
    this._bustDefaultsCatalogCache(org.id);
    return { success: true };
  }

  @Get('/budget')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getBudget(@GetOrgFromRequest() org: Organization) {
    const budget = await this._orgAiSettings.getBudget(org.id);
    return budget || {};
  }

  @Put('/budget')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateBudget(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body: {
      monthlyCap?: number;
      dailyCap?: number;
      alertThresholdPct?: number;
      enabled?: boolean;
    },
  ) {
    await this._orgAiSettings.updateBudget(org.id, body);
    return { success: true };
  }

  // ── Model Defaults (per-org AI model defaults) ─────────────────────────────

  @Get('/defaults')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getModelDefaults(@GetOrgFromRequest() org: Organization) {
    const resolved = await this._defaultsResolution.resolveAll('ai', org.id);
    const stored = await this._defaultsRepository.getAll(org.id, 'ai');
    return {
      categories: AI_MODEL_CATEGORIES.map((category) => {
        const r = resolved[category];
        const s = stored.find((row) => row.category === category);
        return {
          category,
          ...(r || {}),
          source: s ? 'stored' : (r ? 'auto' : null),
        };
      }),
    };
  }

  @Put('/defaults/:category')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async setModelDefault(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
    @Body() body: SetDefaultModelDto,
  ) {
    if (!AI_MODEL_CATEGORIES.includes(category as any)) {
      throw new BadRequestException(`Invalid model category: ${category}`);
    }
    const cleaned = this._sanitizeSettings('ai', category, body);
    await this._defaultsRepository.upsert(org.id, 'ai', category, cleaned);
    this._bustDefaultsCatalogCache(org.id);
    return { category, success: true };
  }

  private _sanitizeSettings(
    domain: 'ai' | 'media',
    category: string,
    body: SetDefaultModelDto,
  ): SetDefaultModelDto {
    if (!body.settings || typeof body.settings !== 'object') return body;
    const cleaned = this._settingsValidator.validate(domain, category, body.settings, {
      providerId: body.providerId,
      model: body.model,
    });
    return { ...body, settings: cleaned };
  }

  @Delete('/defaults/:category')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async clearModelDefault(
    @GetOrgFromRequest() org: Organization,
    @Param('category') category: string,
  ) {
    if (!AI_MODEL_CATEGORIES.includes(category as any)) {
      throw new BadRequestException(`Invalid model category: ${category}`);
    }
    await this._defaultsRepository.remove(org.id, 'ai', category);
    return { category, success: true };
  }

  @Get('/defaults/catalog')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getModelDefaultsCatalog(
    @GetOrgFromRequest() org: Organization,
    @Query('category') category: string,
  ) {
    if (!AI_MODEL_CATEGORIES.includes(category as any)) {
      throw new BadRequestException(`Invalid model category: ${category}`);
    }
    const cacheKey = `settings:ai:defaults:catalog:${org.id}:${category}`;
    const cached = await ioRedis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const candidates = await this._defaultsResolution.candidates('ai', category, org.id);
    const options: { providerId: string; version: string; model?: string; label: string }[] = [];
    for (const c of candidates) {
      const providerLabel = this._providerLabel(c);
      if (!c.metadata.hasModelList || c.metadata.kind === 'action') {
        options.push({
          providerId: c.providerId,
          version: c.version,
          label: providerLabel,
        });
      } else {
        const models = await this._listModelsForCandidate(c, category, org.id);
        for (const m of models) {
          options.push({
            providerId: c.providerId,
            version: c.version,
            model: m.id,
            label: `${providerLabel}: ${m.label || m.id}`,
          });
        }
      }
    }
    const result = { category, options };
    await ioRedis.set(cacheKey, JSON.stringify(result), 'EX', 60);
    return result;
  }

  private async _listModelsForCandidate(
    candidate: { providerId: string; version: string; metadata: any },
    category: string,
    orgId: string,
  ) {
    try {
      const config = await this._orgAiSettings.getByIdentifier(orgId, candidate.providerId, candidate.version);
      const credentials = config?.credentials ?? {};
      const mod = this._kernel?.get('ai', candidate.providerId, candidate.version);
      const capability: any = mod?.create({
        credentials,
        encryption: {} as any,
        fetch: {} as any,
        logger: {} as any,
        telemetry: {} as any,
      });
      if (!capability?.listModels) return [];
      const models = await capability.listModels(credentials);
      return this._filterModelsByCategory(models || [], category);
    } catch {
      return [];
    }
  }

  private _filterModelsByCategory(models: any[], category: string): any[] {
    switch (category) {
      case 'vision':
        return models.filter((m) => m.capabilities?.vision);
      case 'high-reasoning':
        return models.filter((m) => m.reasoning || m.capabilities?.text);
      case 'workflow':
      case 'low-reasoning':
      default:
        return models.filter((m) => m.capabilities?.text);
    }
  }
}

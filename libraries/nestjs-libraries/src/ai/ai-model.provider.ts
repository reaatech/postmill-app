import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIProviderRegistry } from './ai-provider.registry';
import {
  type AICapabilities,
  type AIScope,
} from './ai-provider.interface';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsManager } from './ai-settings.manager';
import type { LanguageModel } from './ai-provider.interface';
import { CapabilityNotAvailable, BudgetExceeded, GuardrailViolation } from './governance/errors';
import { TelemetryService } from './governance/telemetry.service';
import { ProviderHealthService } from './governance/provider-health.service';
import { CircuitBreakerService } from './governance/circuit-breaker.service';
import { BudgetService } from './governance/budget.service';
import { GuardrailService } from './governance/guardrail.service';
import { SemanticCacheService } from './governance/semantic-cache.service';
import { ModelRouterService } from './governance/model-router.service';
import { PROMPT_CONSTANTS } from './prompt-constants.const';
import { truncateContent } from '@reaatech/context-window-planner';

interface SurfaceDefaults {
  textModel: string;
  imageModel?: string;
  temperature?: number;
}

const PROVIDER_PRICING: Record<string, { inputPer1K: number; outputPer1K: number }> = {
  openai: { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  anthropic: { inputPer1K: 0.00025, outputPer1K: 0.00125 },
  google: { inputPer1K: 0.0001, outputPer1K: 0.0004 },
  groq: { inputPer1K: 0.00024, outputPer1K: 0.00072 },
  mistral: { inputPer1K: 0.0001, outputPer1K: 0.0003 },
  cohere: { inputPer1K: 0.00025, outputPer1K: 0.001 },
  deepseek: { inputPer1K: 0.00014, outputPer1K: 0.00028 },
  togetherai: { inputPer1K: 0.0002, outputPer1K: 0.0004 },
  fireworks: { inputPer1K: 0.0002, outputPer1K: 0.0006 },
};

const SURFACE_DEFAULTS: Record<AIScope, SurfaceDefaults> = {
  // gpt-image-1 (not the non-existent 'chatgpt-image-latest', which the OpenAI
  // images endpoint rejected with "Unknown parameter: 'response_format'"). The
  // SDK special-cases gpt-image-1 to omit response_format and it supports the
  // 1024x1536 vertical size used below.
  utility: { textModel: 'gpt-4.1', imageModel: 'gpt-image-1' },
  generator: { textModel: 'gpt-4.1', imageModel: 'gpt-image-1', temperature: 0.7 },
  agent: { textModel: 'gpt-5.2' },
  mcp: { textModel: 'gpt-4.1' },
};

export interface ResolvedConfig {
  adapter: any;
  modelId: string;
  creds: Record<string, string>;
  providerId: string;
  defaultSurface?: SurfaceDefaults;
  providerImageModel?: string;
  orgImageModel?: string;
  settings?: any;
}

const MAX_RETRIES = 3;

const CONTEXT_WINDOW_LIMITS: Record<string, number> = {
  'gpt-4.1': 32000,
  'gpt-5.2': 32000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 4096,
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  'gemini-2.0-flash': 32000,
  'gemini-1.5-pro': 128000,
  'gemini-1.5-flash': 128000,
  'grok-2': 32000,
  'grok-2-vision': 32000,
  'deepseek-chat': 32000,
  'deepseek-r1': 32000,
  'mixtral-8x7b': 32000,
  'mistral-large': 32000,
  'command-r': 128000,
  'command-r-plus': 128000,
};

@Injectable()
export class AIModelProvider {
  private readonly _logger = new Logger(AIModelProvider.name);
  private _warnedMissingOrgId = false;

  constructor(
    private readonly _registry: AIProviderRegistry,
    private readonly _aiSettings: AiSettingsService,
    private readonly _aiSettingsManager: AiSettingsManager,
    private readonly _telemetry: TelemetryService,
    private readonly _health: ProviderHealthService,
    private readonly _budget: BudgetService,
    private readonly _guardrails: GuardrailService,
    private readonly _semanticCache?: SemanticCacheService,
    private readonly _modelRouter?: ModelRouterService,
    private readonly _circuitBreaker: CircuitBreakerService = new CircuitBreakerService(),
  ) {
    // Wire the embedding tier of the semantic cache without creating a Nest circular dep.
    this._semanticCache?.setModelProvider(this);
  }

  /**
   * Quality-based routing (opt-in, off by default). Returns the configured model id unchanged
   * unless routing is enabled and selects a different candidate. Never throws.
   */
  private async _routeModel(scope: AIScope, orgId: string | undefined, configuredModel: string): Promise<string> {
    if (!this._modelRouter) return configuredModel;
    try {
      const result = await this._modelRouter.resolveModel(scope, orgId, configuredModel);
      return result.modelId || configuredModel;
    } catch {
      return configuredModel;
    }
  }

  private _ensureTelemetryConfigured(settings: any): void {
    if (settings?.observability) {
      this._telemetry.configure(settings.observability, settings.secretSettings);
    }
  }

  private _isValidScopedModels(value: unknown): value is Record<string, { provider?: string; model?: string }> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    for (const entry of Object.values(value as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return false;
      }
      if ('provider' in entry && typeof (entry as any).provider !== 'string') return false;
      if ('model' in entry && typeof (entry as any).model !== 'string') return false;
    }
    return true;
  }

  private _hasRequiredCredentials(config: ResolvedConfig): boolean {
    const requiredFields = config.adapter.credentialFields.filter((field: any) => field.required);
    return requiredFields.every((field: any) => {
      const value = config.creds[field.key];
      return typeof value === 'string' && value.trim().length > 0;
    });
  }

  private async _resolveConfig(scope: AIScope, _orgId?: string): Promise<ResolvedConfig> {
    if (!_orgId && !this._warnedMissingOrgId) {
      this._warnedMissingOrgId = true;
      this._logger.warn('No orgId provided — org-level spend tracking will be lost');
    }
    const settings = await this._aiSettingsManager.getSettings();

    this._ensureTelemetryConfigured(settings);

    if (!settings || !settings.activeProvider) {
      return this._envFallback(scope);
    }

    let adapter = this._registry.getAdapter(settings.activeProvider);
    if (!adapter) {
      return this._envFallback(scope);
    }

    const rawScopedModels = settings.scopeModels;
    const scopedModels = this._isValidScopedModels(rawScopedModels) ? rawScopedModels : undefined;

    const scopeConfig = scopedModels?.[scope];
    const selectedProviderId = scopeConfig?.provider || settings.activeProvider;

    const providerConfig = await this._aiSettings.getProviderConfigByIdentifier(selectedProviderId);

    let orgOverrideCredentials: Record<string, string> | undefined;
    let orgOverrideModel: string | undefined;
    let orgImageModel: string | undefined;
    if (_orgId) {
      try {
        const orgConfigs = await this._aiSettings.getOrgProviderConfigs(_orgId);
        const matchedOrgConfig = orgConfigs?.find(
          (o: any) => o.identifier === selectedProviderId && o.enabled !== false,
        );
        if (matchedOrgConfig?.enabled) {
          const decryptedOrg = this._aiSettings.decryptProviderConfig(matchedOrgConfig);
          if (decryptedOrg?.credentials) {
            orgOverrideCredentials = decryptedOrg.credentials;
          }
          if ((matchedOrgConfig as any).defaultModel) {
            orgOverrideModel = (matchedOrgConfig as any).defaultModel;
          }
          if ((matchedOrgConfig as any).imageModel) {
            orgImageModel = (matchedOrgConfig as any).imageModel;
          }
        }
      } catch (err) {
        this._logger.warn(`Failed to resolve org provider config for org ${_orgId}: ${(err as Error).message}`);
      }
    }

    const baseModel = orgOverrideModel || scopeConfig?.model || settings.activeModel || providerConfig?.defaultModel || SURFACE_DEFAULTS[scope].textModel;
    // Quality-based routing (opt-in, off by default) may select a cheaper candidate first.
    const selectedModel = await this._routeModel(scope, _orgId, baseModel);

    const resolvedAdapter = this._registry.getAdapter(selectedProviderId);
    if (!resolvedAdapter) {
      return this._envFallback(scope);
    }

    if (!providerConfig || providerConfig.enabled === false) {
      return this._envFallback(scope);
    }

    adapter = resolvedAdapter;
    const providerImageModel = providerConfig.imageModel || undefined;
    const decrypted = this._aiSettings.decryptProviderConfig(providerConfig);

    const creds: Record<string, string> = {
      ...(decrypted?.credentials || {}),
      ...(orgOverrideCredentials || {}),
    };

    const resolvedConfig = {
      adapter,
      modelId: selectedModel,
      creds,
      providerId: selectedProviderId,
      defaultSurface: SURFACE_DEFAULTS[scope],
      providerImageModel,
      orgImageModel,
      settings,
    };

    const hasEnabledProvider = !!providerConfig?.enabled || !!orgOverrideCredentials;
    if (!hasEnabledProvider || !this._hasRequiredCredentials(resolvedConfig)) {
      return this._envFallback(scope);
    }

    return resolvedConfig;
  }

  private async _resolveWithRetry(scope: AIScope, orgId?: string): Promise<ResolvedConfig> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const config = await this._resolveConfig(scope, orgId);
        return config;
      } catch (err) {
        if (err instanceof BudgetExceeded || err instanceof GuardrailViolation) {
          throw err;
        }
        lastError = err as Error;
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError || new Error('Failed to resolve AI config');
  }

  private async _withFallback<T>(
    fn: (config: ResolvedConfig) => Promise<T>,
    scope: AIScope,
    orgId?: string,
  ): Promise<T> {
    let attemptedFallbackProvider: string | null = null;
    try {
      const config = await this._resolveWithRetry(scope, orgId);
      // Governance rejections (budget/guardrail) are not provider faults — they must
      // never trip the circuit breaker nor be "retried" against a fallback provider.
      const isGovernanceError = (e: unknown) =>
        e instanceof BudgetExceeded || e instanceof GuardrailViolation;

      let primaryErr: unknown;
      if (this._circuitBreaker.canAttempt(config.providerId)) {
        try {
          const result = await fn(config);
          this._circuitBreaker.recordSuccess(config.providerId);
          return result;
        } catch (err) {
          primaryErr = err;
          this._health.recordError(config.providerId);
          if (!isGovernanceError(err)) {
            this._circuitBreaker.recordFailure(config.providerId);
          }
        }
      } else {
        // Breaker OPEN for the primary provider — skip the call and route to fallback.
        primaryErr = new Error(
          `Circuit breaker open for provider "${config.providerId}" — routing to fallback`,
        );
      }

      const settings = config.settings || await this._aiSettingsManager.getSettings();
      if (settings?.fallbackProvider && settings.fallbackProvider !== config.providerId) {
        const fallbackAdapter = this._registry.getAdapter(settings.fallbackProvider);
        if (fallbackAdapter) {
          const fallbackProviderConfig = await this._aiSettings.getProviderConfigByIdentifier(settings.fallbackProvider);
          if (fallbackProviderConfig?.enabled === false) {
            throw primaryErr;
          }
          // Don't pile onto a fallback whose own breaker is already open.
          if (!this._circuitBreaker.canAttempt(settings.fallbackProvider)) {
            throw primaryErr;
          }
          attemptedFallbackProvider = settings.fallbackProvider;
          const fallbackDecrypted = fallbackProviderConfig
            ? this._aiSettings.decryptProviderConfig(fallbackProviderConfig)
            : undefined;
          const fallbackCreds = fallbackDecrypted?.credentials || await this._resolveFallbackCreds(settings.fallbackProvider);
          const fallbackRawModels = settings.scopeModels;
          const fallbackScopedModels = this._isValidScopedModels(fallbackRawModels) ? fallbackRawModels : undefined;
          const fallbackScopeConfig = fallbackScopedModels?.[scope];
          const fallbackScopedModel =
            fallbackScopeConfig?.provider === settings.fallbackProvider
              ? fallbackScopeConfig.model
              : undefined;
          const fallbackModel = fallbackScopedModel || fallbackProviderConfig?.defaultModel || SURFACE_DEFAULTS[scope].textModel;
          const fallbackConfig: ResolvedConfig = {
            adapter: fallbackAdapter,
            modelId: fallbackModel,
            creds: fallbackCreds,
            providerId: settings.fallbackProvider,
            defaultSurface: SURFACE_DEFAULTS[scope],
          };
          try {
            const result = await fn(fallbackConfig);
            this._circuitBreaker.recordSuccess(settings.fallbackProvider);
            return result;
          } catch (fallbackErr) {
            if (!isGovernanceError(fallbackErr)) {
              this._circuitBreaker.recordFailure(settings.fallbackProvider);
            }
            if (isGovernanceError(primaryErr)) {
              throw primaryErr;
            }
            throw new Error(
              `AI provider call failed for scope "${scope}" ` +
              `(primary: ${(primaryErr as Error).message}; ` +
              `fallback: ${(fallbackErr as Error).message})`,
            );
          }
        }
      }
      throw primaryErr;
    } catch (err) {
      if (attemptedFallbackProvider) {
        this._health.recordError(attemptedFallbackProvider);
      }
      throw err;
    }
  }

  private async _resolveFallbackCreds(providerId: string): Promise<Record<string, string>> {
    const providerConfig = await this._aiSettings.getProviderConfigByIdentifier(providerId);
    const decrypted = providerConfig
      ? this._aiSettings.decryptProviderConfig(providerConfig)
      : undefined;
    if (decrypted?.credentials) {
      return decrypted.credentials;
    }
    if (providerId === 'openai' && process.env.OPENAI_API_KEY) {
      return { apiKey: process.env.OPENAI_API_KEY };
    }
    return {};
  }

  private _envFallback(scope: AIScope): ResolvedConfig {
    const defaults = SURFACE_DEFAULTS[scope];
    const adapter = this._registry.getAdapter('openai');
    const envKey = process.env.OPENAI_API_KEY;

    if (!adapter) {
      throw new Error(`OpenAI adapter not registered — cannot fall back for ${scope}`);
    }

    if (!envKey) {
      throw new Error(
        `No AI provider configured in admin settings and no OPENAI_API_KEY environment variable set. ` +
        `Configure an AI provider or set the OPENAI_API_KEY environment variable to use the fallback.`,
      );
    }

    // `defaultSurface` is the full SURFACE_DEFAULTS[scope] which includes `imageModel`,
    // so imageModel() resolves correctly via config.defaultSurface?.imageModel at the call site.
    return {
      adapter,
      modelId: defaults.textModel,
      creds: { apiKey: envKey },
      providerId: 'openai',
      defaultSurface: defaults,
    };
  }

  private _resolveImageModelId(config: ResolvedConfig): string {
    if (config.orgImageModel) {
      return config.orgImageModel;
    }
    if (config.providerImageModel) {
      return config.providerImageModel;
    }
    if (config.defaultSurface?.imageModel) {
      return config.defaultSurface.imageModel;
    }
    return config.modelId;
  }

  async languageModel(scope: AIScope, orgId?: string): Promise<LanguageModel> {
    return this._withFallback(
      async (config) => {
        return this._telemetry.startSpan(
          'ai.languageModel',
          async (span) => {
            span.setAttribute(TelemetryService.ATTR_GEN_AI_SYSTEM, config.providerId);
            span.setAttribute(TelemetryService.ATTR_GEN_AI_REQUEST_MODEL, config.modelId);
            if (orgId) span.setAttribute('ai.organizationId', orgId);
            const model = config.adapter.createLanguageModel(config.creds, config.modelId, {
              temperature: config.defaultSurface?.temperature,
            });
            return model;
          },
          { 'ai.scope': scope },
        );
      },
      scope,
      orgId,
    );
  }

  async langchainModel(scope: AIScope, orgId?: string): Promise<BaseChatModel> {
    return this._withFallback(
      async (config) => {
        return this._telemetry.startSpan(
          'ai.langchainModel',
          async (span) => {
            span.setAttribute(TelemetryService.ATTR_GEN_AI_SYSTEM, config.providerId);
            span.setAttribute(TelemetryService.ATTR_GEN_AI_REQUEST_MODEL, config.modelId);
            if (orgId) span.setAttribute('ai.organizationId', orgId);
            const model = config.adapter.createLangchainModel(config.creds, config.modelId, {
              temperature: config.defaultSurface?.temperature,
            });
            return model;
          },
          { 'ai.scope': scope },
        );
      },
      scope,
      orgId,
    );
  }

  async imageModel(scope: AIScope, orgId?: string): Promise<{ generate(prompt: string, opts?: { size?: string; isVertical?: boolean }): Promise<string> }> {
    return this._withFallback(async (config) => {
      return this._telemetry.startSpan('ai.imageModel', async (span) => {
        span.setAttribute(TelemetryService.ATTR_GEN_AI_SYSTEM, config.providerId);
        span.setAttribute(TelemetryService.ATTR_GEN_AI_REQUEST_MODEL, config.modelId);
        if (orgId) span.setAttribute('ai.organizationId', orgId);
        const imageModelId = this._resolveImageModelId(config);
        let imageModel: any;
        if (config.adapter.createImageModel) {
          imageModel = config.adapter.createImageModel(config.creds, imageModelId);
        }
        if (!imageModel) {
          const settings = config.settings || await this._aiSettingsManager.getSettings();
          const fallbackImageProvider = settings?.fallbackImageProvider;
          if (fallbackImageProvider && fallbackImageProvider !== config.providerId) {
            const fallbackAdapter = this._registry.getAdapter(fallbackImageProvider);
            if (fallbackAdapter?.createImageModel) {
              const fallbackProviderConfig = await this._aiSettings.getProviderConfigByIdentifier(fallbackImageProvider);
              if (fallbackProviderConfig?.enabled === false) {
                throw new CapabilityNotAvailable('Image generation is not available on the current AI provider', 'image');
              }
              const fallbackCreds = fallbackProviderConfig
                ? this._aiSettings.decryptProviderConfig(fallbackProviderConfig).credentials || await this._resolveFallbackCreds(fallbackImageProvider)
                : await this._resolveFallbackCreds(fallbackImageProvider);
              const fallbackModelId =
                fallbackProviderConfig?.imageModel ||
                fallbackProviderConfig?.defaultModel ||
                SURFACE_DEFAULTS[scope].imageModel ||
                imageModelId;
              imageModel = fallbackAdapter.createImageModel(fallbackCreds, fallbackModelId);
              if (imageModel) {
                this._logger.log(`Falling back to provider "${fallbackImageProvider}" for image generation`);
                return {
                  generate: async (prompt: string, _opts?: { size?: string; isVertical?: boolean }) => {
                    const result = await (imageModel as any).doGenerate({
                      prompt,
                      n: 1,
                      size: _opts?.size || (_opts?.isVertical ? '1024x1536' : '1024x1024'),
                      aspectRatio: undefined,
                      providerOptions: {},
                      headers: {},
                    });
                    const images = result.images as Array<string>;
                    return images?.[0] || '';
                  },
                };
              }
            }
          }
          throw new CapabilityNotAvailable('Image generation is not available on the current AI provider', 'image');
        }
        this._health.recordSuccess(config.providerId);
        return {
          generate: async (prompt: string, _opts?: { size?: string; isVertical?: boolean }) => {
            const result = await (imageModel as any).doGenerate({
              prompt,
              n: 1,
              size: _opts?.size || (_opts?.isVertical ? '1024x1536' : '1024x1024'),
              aspectRatio: undefined,
              // The @ai-sdk/openai image model dereferences providerOptions.openai
              // in doGenerate; omitting it throws "Cannot read properties of
              // undefined (reading 'openai')". Always pass an object.
              providerOptions: {},
              headers: {},
            });
            const images = result.images as Array<string>;
            return images?.[0] || '';
          },
        };
      }, { 'ai.scope': scope });
    }, scope, orgId);
  }

  async embeddingModel(scope: AIScope, orgId?: string): Promise<any> {
    return this._withFallback(async (config) => {
      return this._telemetry.startSpan('ai.embeddingModel', async (span) => {
        span.setAttribute(TelemetryService.ATTR_GEN_AI_SYSTEM, config.providerId);
        span.setAttribute(TelemetryService.ATTR_GEN_AI_REQUEST_MODEL, config.modelId);
        if (orgId) span.setAttribute('ai.organizationId', orgId);
        if (!config.adapter.createEmbeddingModel) {
          throw new CapabilityNotAvailable('Embedding model is not available on the current AI provider', 'embedding');
        }
        const model = config.adapter.createEmbeddingModel(config.creds, config.modelId);
        this._health.recordSuccess(config.providerId);
        return model;
      }, { 'ai.scope': scope });
    }, scope, orgId);
  }

  private async _loadBrandVoice(
    orgId?: string,
    platform?: string,
  ): Promise<{ instructions: string; language: string }> {
    if (!orgId) return { instructions: '', language: '' };
    const brand = await this._aiSettings.getBrandProfile(orgId);
    if (!brand?.enabled) return { instructions: '', language: '' };

    let instructions = brand.instructions || '';

    if (platform && brand.platformInstructions) {
      const platformInstructions = brand.platformInstructions as Record<string, string>;
      if (platformInstructions[platform]) {
        instructions = platformInstructions[platform];
      }
    }

    return {
      instructions,
      language: brand.language || '',
    };
  }

  private async _resolvePromptTemplate(key?: string, orgId?: string): Promise<string | undefined> {
    if (!key) return undefined;

    if (orgId) {
      const orgTemplates = await this._aiSettings.getPromptTemplates(orgId);
      const matched = orgTemplates.find((t: any) => t.key === key);
      if (matched?.content) return matched.content;
    }

    const globalTemplates = await this._aiSettings.getPromptTemplates(null);
    const matched = globalTemplates.find((t: any) => t.key === key);
    if (matched?.content) return matched.content;

    const constantVal = (PROMPT_CONSTANTS as any)[key];
    if (typeof constantVal === 'string') return constantVal;

    return undefined;
  }

  private _enforceContextWindow(prompt: string, modelId: string): string {
    const maxTokens = CONTEXT_WINDOW_LIMITS[modelId] || 8000;
    try {
      const estimatedTokens = Math.ceil(prompt.length / 4);
      if (estimatedTokens <= maxTokens) return prompt;
      const targetTokens = Math.floor(maxTokens * 0.9);
      return truncateContent(prompt, estimatedTokens, targetTokens);
    } catch {
      if (prompt.length > maxTokens * 4) {
        return prompt.slice(0, Math.floor(maxTokens * 4 * 0.9));
      }
      return prompt;
    }
  }

  private _estimateCost(inputTokens: number, outputTokens: number, providerId?: string): number {
    const pricing = PROVIDER_PRICING[providerId || ''] || PROVIDER_PRICING.openai;
    return (inputTokens * pricing.inputPer1K + outputTokens * pricing.outputPer1K) / 1000;
  }

  /**
   * Extracts the generated text from an AI SDK doGenerate() result. V2 models return a
   * `content` array of parts ({ type: 'text', text } | reasoning | tool-call | ...); there is
   * no top-level `result.text`. We concatenate the text parts. The `typeof result.text` guard
   * tolerates V1-shaped adapters and test stubs that still return a top-level `text`.
   */
  private _extractText(result: any): string {
    if (typeof result?.text === 'string') return result.text; // tolerate V1-shaped mocks
    const parts = Array.isArray(result?.content) ? result.content : [];
    return parts
      .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('');
  }

  private async _recordUsage(args: {
    usage?: {
      // AI SDK V2 usage fields
      inputTokens?: number;
      outputTokens?: number;
      // AI SDK V1 usage fields (tolerated for back-compat / test stubs)
      promptTokens?: number;
      completionTokens?: number;
    };
    span: { setAttribute: (key: string, value: any) => void };
    orgId?: string;
    userId?: string;
    providerId: string;
    modelId: string;
    scope: AIScope;
  }) {
    if (!args.usage) return;

    // Read V2 fields first; fall back to V1 names for older adapters / mocks.
    const promptTokens = args.usage.inputTokens ?? args.usage.promptTokens ?? 0;
    const completionTokens = args.usage.outputTokens ?? args.usage.completionTokens ?? 0;
    args.span.setAttribute(TelemetryService.ATTR_GEN_AI_USAGE_INPUT_TOKENS, promptTokens);
    args.span.setAttribute(TelemetryService.ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, completionTokens);

    await this._budget.recordSpend({
      organizationId: args.orgId,
      userId: args.userId,
      provider: args.providerId,
      model: args.modelId,
      scope: args.scope,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: this._estimateCost(promptTokens, completionTokens, args.providerId),
    });
  }

  private async _prepareGeneration(
    scope: AIScope,
    prompt: string,
    options?: { system?: string; promptKey?: string; orgId?: string; userId?: string; platform?: string },
  ): Promise<{
    checkedPrompt: string;
    brand: { instructions: string; language: string };
    effectiveSystem: string | undefined;
  }> {
    const budgetCheck = await this._budget.checkBudget(scope, options?.orgId);
    if (!budgetCheck.allowed) {
      throw new BudgetExceeded(budgetCheck.reason || 'Budget exceeded', scope, options?.orgId);
    }

    const brand = await this._loadBrandVoice(options?.orgId, options?.platform);
    const resolvedSystem = options?.promptKey
      ? await this._resolvePromptTemplate(options.promptKey, options?.orgId)
      : undefined;
    const effectiveSystem = resolvedSystem || options?.system;

    const checkedPrompt = await this._guardrails.checkInput(prompt, { orgId: options?.orgId });

    return { checkedPrompt, brand, effectiveSystem };
  }

  private _buildSystemPrompt(
    effectiveSystem: string | undefined,
    brand: { instructions: string; language: string },
  ): string {
    const parts: string[] = [];
    if (effectiveSystem) parts.push(effectiveSystem);
    if (brand.instructions) parts.push(brand.instructions);
    if (brand.language) parts.push(`Respond in ${brand.language}.`);
    return parts.join('\n\n');
  }

  private async _buildMessages(
    config: ResolvedConfig,
    checkedPrompt: string,
    systemPrompt: string,
  ): Promise<{ messages: any[]; truncatedPrompt: string; truncatedSystem: string }> {
    const truncatedPrompt = this._enforceContextWindow(checkedPrompt, config.modelId);
    const truncatedSystem = systemPrompt
      ? this._enforceContextWindow(systemPrompt, config.modelId)
      : '';

    const messages: any[] = [];
    if (truncatedSystem) {
      messages.push({ role: 'system', content: [{ type: 'text', text: truncatedSystem }] });
    }
    messages.push({ role: 'user', content: [{ type: 'text', text: truncatedPrompt }] });

    return { messages, truncatedPrompt, truncatedSystem };
  }

  async generateText(
    scope: AIScope,
    prompt: string,
    options?: { system?: string; promptKey?: string; orgId?: string; userId?: string; platform?: string },
  ): Promise<string> {
    const { checkedPrompt, brand, effectiveSystem } = await this._prepareGeneration(scope, prompt, options);

    // Semantic response cache (opt-in, off by default). Keyed per org + scope; the system
    // prompt and brand voice are folded into the cache key so different framing never collides.
    const cacheKeyPrompt = this._buildCacheKeyPrompt(prompt, effectiveSystem, brand);
    if (this._semanticCache) {
      const cached = await this._semanticCache.get(options?.orgId, scope, cacheKeyPrompt);
      if (cached !== null) {
        return cached;
      }
    }

    const systemPrompt = this._buildSystemPrompt(effectiveSystem, brand);

    const generated = await this._withFallback(
      async (config) => {
        return this._telemetry.startSpan(
          'ai.generateText',
          async (span) => {
            span.setAttribute(TelemetryService.ATTR_GEN_AI_SYSTEM, config.providerId);
            span.setAttribute(TelemetryService.ATTR_GEN_AI_REQUEST_MODEL, config.modelId);

            const { messages } = await this._buildMessages(config, checkedPrompt, systemPrompt);

            Sentry.addBreadcrumb({
              category: 'ai',
              message: `AI generateText (${config.providerId}/${config.modelId})`,
              level: 'info',
              data: { scope, providerId: config.providerId, modelId: config.modelId },
            });

            const model = config.adapter.createLanguageModel(config.creds, config.modelId, {
              temperature: config.defaultSurface?.temperature,
            });

            const result = await (model as any).doGenerate({ prompt: messages });

            const outputText = this._extractText(result);
            const checkedOutput = await this._guardrails.checkOutput(outputText, { orgId: options?.orgId });
            this._health.recordSuccess(config.providerId);

            await this._recordUsage({
              usage: result.usage,
              span,
              orgId: options?.orgId,
              userId: options?.userId,
              providerId: config.providerId,
              modelId: config.modelId,
              scope,
            });

            return checkedOutput;
          },
          { 'ai.scope': scope },
        );
      },
      scope,
      options?.orgId,
    );

    // Populate the cache after a successful generation (no-op when disabled).
    if (this._semanticCache && typeof generated === 'string' && generated.length > 0) {
      await this._semanticCache.set(options?.orgId, scope, cacheKeyPrompt, generated);
    }

    return generated;
  }

  /**
   * Builds the prompt string used as the semantic-cache key input. Folds in the effective
   * system prompt and brand voice so different framing of the same user prompt never collides.
   */
  private _buildCacheKeyPrompt(
    prompt: string,
    effectiveSystem: string | undefined,
    brand: { instructions: string; language: string },
  ): string {
    return [effectiveSystem || '', brand.instructions || '', brand.language || '', prompt]
      .join(' ');
  }

  async generateObject<T>(
    scope: AIScope,
    prompt: string,
    _schema: any,
    options?: { system?: string; promptKey?: string; orgId?: string; userId?: string; platform?: string },
  ): Promise<T> {
    const { checkedPrompt, brand, effectiveSystem } = await this._prepareGeneration(scope, prompt, options);
    const systemPrompt = this._buildSystemPrompt(effectiveSystem, brand);

    return this._withFallback(
      async (config) => {
        return this._telemetry.startSpan(
          'ai.generateObject',
          async (span) => {
            span.setAttribute(TelemetryService.ATTR_GEN_AI_SYSTEM, config.providerId);
            span.setAttribute(TelemetryService.ATTR_GEN_AI_REQUEST_MODEL, config.modelId);

            const { messages } = await this._buildMessages(config, checkedPrompt, systemPrompt);

            // Include the ACTUAL JSON schema in the instruction — previously it
            // said "matches the requested schema" without ever providing the
            // schema, so the model guessed the shape (e.g. repurpose returned
            // {"x":"..."} instead of {platforms:[{platform,content}]}) and
            // _schema.parse threw.
            let schemaText = '';
            try {
              if (_schema && typeof _schema.parse === 'function') {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { zodToJsonSchema } = require('zod-to-json-schema');
                schemaText = JSON.stringify(zodToJsonSchema(_schema));
              }
            } catch {
              // fall through to the generic instruction
            }

            const structuredSystem = [
              messages.find((m: any) => m.role === 'system')?.content?.[0]?.text || '',
              schemaText
                ? `Return only valid JSON that conforms to this JSON Schema. Do not include markdown, prose, or code fences.\nJSON Schema:\n${schemaText}`
                : 'Return only valid JSON that matches the requested schema. Do not include markdown, prose, or code fences.',
            ].filter(Boolean).join('\n\n');

            const finalMessages: any[] = [
              { role: 'system', content: [{ type: 'text', text: structuredSystem }] },
              { role: 'user', content: messages.find((m: any) => m.role === 'user')?.content || [] },
            ];

            Sentry.addBreadcrumb({
              category: 'ai',
              message: `AI generateObject (${config.providerId}/${config.modelId})`,
              level: 'info',
              data: { scope, providerId: config.providerId, modelId: config.modelId },
            });

            const model = config.adapter.createLanguageModel(config.creds, config.modelId, {
              temperature: config.defaultSurface?.temperature,
            });

            const result = await (model as any).doGenerate({
              prompt: finalMessages,
              responseFormat: { type: 'json' },
            });

            const outputText = this._extractText(result);
            const checkedOutput = await this._guardrails.checkOutput(outputText, { orgId: options?.orgId });
            this._health.recordSuccess(config.providerId);

            await this._recordUsage({
              usage: result.usage,
              span,
              orgId: options?.orgId,
              userId: options?.userId,
              providerId: config.providerId,
              modelId: config.modelId,
              scope,
            });

            if (checkedOutput) {
              try {
                // Models sometimes wrap JSON in ```json fences or surrounding
                // prose despite responseFormat:json. Strip fences and fall back
                // to the first {...}/[...] block before parsing.
                let jsonText = checkedOutput.trim();
                const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
                if (fence) jsonText = fence[1].trim();
                if (jsonText[0] !== '{' && jsonText[0] !== '[') {
                  const objStart = jsonText.indexOf('{');
                  const arrStart = jsonText.indexOf('[');
                  const start =
                    objStart === -1
                      ? arrStart
                      : arrStart === -1
                      ? objStart
                      : Math.min(objStart, arrStart);
                  const end = Math.max(
                    jsonText.lastIndexOf('}'),
                    jsonText.lastIndexOf(']')
                  );
                  if (start >= 0 && end > start) {
                    jsonText = jsonText.slice(start, end + 1);
                  }
                }
                const parsed = JSON.parse(jsonText);
                if (_schema && typeof _schema.parse === 'function') {
                  return _schema.parse(parsed) as T;
                }
                if (typeof parsed === 'object' && parsed !== null) {
                  return parsed as T;
                }
                this._logger.warn(`generateObject parsed non-object output: ${typeof parsed}`);
                return parsed as T;
              } catch (parseErr) {
                this._logger.error(`generateObject: failed to parse output as JSON: ${checkedOutput.substring(0, 200)}`);
                throw new Error(`AI returned invalid JSON for structured output for scope "${scope}"`);
              }
            }

            throw new Error('AI returned empty response for structured output');
          },
          { 'ai.scope': scope },
        );
      },
      scope,
      options?.orgId,
    );
  }

  /**
   * Resolves the active provider ID for a given scope and org.
   * Returns the adapter identifier (e.g. 'openai', 'anthropic').
   * Falls back to 'openai' when no config is available (env-based fallback).
   */
  async resolveProviderId(scope: AIScope, orgId?: string): Promise<string> {
    try {
      const config = await this._resolveConfig(scope, orgId);
      return config.providerId;
    } catch {
      return 'openai';
    }
  }

  /**
   * Resolves the full AI config for a scope and org without creating a model instance.
   * Returns null when no configuration is available (no admin config AND no OPENAI_API_KEY).
   * This delegates to the private `_resolveConfig` which is the single source of truth
   * for model/provider resolution, including per-org BYOK overrides.
   */
  async resolveConfigForScope(scope: AIScope, orgId?: string): Promise<ResolvedConfig | null> {
    try {
      return await this._resolveConfig(scope, orgId);
    } catch (err) {
      this._logger.warn(`Failed to resolve config for scope "${scope}": ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Checks whether the adapter registered under `adapterId` declares the given capability.
   * This is adapter-level only — a specific model may support features (e.g. image generation)
   * even if the adapter's static capability flags don't reflect it, or vice versa.
   */
  hasCapability(adapterId: string, capability: keyof AICapabilities): boolean {
    const caps = this._registry.capabilitiesFor(adapterId);
    return caps?.[capability] === true;
  }

  /**
   * Checks whether a specific model on the given adapter declares the given capability.
   * Returns `null` when the model is not found in the adapter's model list (caller
   * should fall back to adapter-level capabilities if desired).
   */
  async modelHasCapability(
    adapterId: string,
    modelId: string,
    capability: keyof AICapabilities,
    creds?: Record<string, string>,
  ): Promise<boolean | null> {
    const caps = await this._registry.modelCapabilitiesFor(adapterId, modelId, creds);
    return caps?.[capability] ?? null;
  }

  getSurfaceDefaults(scope: AIScope): SurfaceDefaults {
    return SURFACE_DEFAULTS[scope];
  }

  getProviderHealth() {
    return this._health.getAllHealth();
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import {
  parseQualified,
  qualify,
  DEFAULT_VERSION,
} from '@gitroom/provider-kernel';

export function normalizeProviderId(
  value: string | null | undefined,
): string | null {
  if (!value) return value ?? null;
  const { providerId } = parseQualified(value);
  return providerId || value;
}

export function qualifyProviderId(
  value: string | null | undefined,
): string | null {
  if (!value) return value ?? null;
  const { providerId } = parseQualified(value);
  if (!providerId) return value;
  return qualify(providerId);
}

export function ensureScopeModelsVersion(scopeModels: any): any {
  if (
    !scopeModels ||
    typeof scopeModels !== 'object' ||
    Array.isArray(scopeModels)
  ) {
    return scopeModels;
  }

  const out: Record<string, any> = {};
  for (const [key, entry] of Object.entries(scopeModels)) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      out[key] = { version: DEFAULT_VERSION, ...(entry as Record<string, any>) };
    } else {
      out[key] = entry;
    }
  }
  return out;
}

interface CachedSettings {
  id: string;
  activeProvider: string | null;
  activeModel: string | null;
  scopeModels: string | null;
  fallbackProvider: string | null;
  fallbackImageProvider: string | null;
  guardrailSettings: string | null;
  budgetSettings: string | null;
  rateLimitSettings: string | null;
  observability: string | null;
  mcpSettings: string | null;
  ragSettings: string | null;
  cacheSettings: string | null;
  routingSettings: string | null;
  secretSettings: string | null;
  updatedAt: Date;
}

export interface AiSettingsResult {
  id: string;
  activeProvider: string | null;
  activeModel: string | null;
  scopeModels: any;
  fallbackProvider: string | null;
  fallbackImageProvider: string | null;
  guardrailSettings: any;
  budgetSettings: any;
  rateLimitSettings: any;
  observability: any;
  mcpSettings: any;
  ragSettings: any;
  cacheSettings: any;
  routingSettings: any;
  secretSettings: Record<string, string> | undefined;
  updatedAt: Date;
}

@Injectable()
export class AiSettingsManager implements OnModuleInit {
  private readonly _logger = new Logger(AiSettingsManager.name);
  private cache: CachedSettings | null = null;
  private lastRefresh = 0;
  private readonly refreshIntervalMs = 60_000;
  private refreshPromise: Promise<void> | null = null;

  constructor(private _aiSettingsService: AiSettingsService) {}

  async onModuleInit() {
    try {
      await this.refreshCache();
    } catch (err: any) {
      this._logger.error('Failed to load AI settings on startup, will retry on first access:', err?.message);
    }
  }

  async refreshCache() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.#doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async #doRefresh() {
    const settings = await this._aiSettingsService.getSystemSettings();
    this.cache = settings;
    this.lastRefresh = Date.now();
  }

  async ensureFresh() {
    if (Date.now() - this.lastRefresh > this.refreshIntervalMs) {
      try {
        await this.refreshCache();
      } catch (err) {
        this._logger.error('AiSettingsManager: Cache refresh failed, will retry on next request', err);
      }
    }
  }

  async getSettings(): Promise<AiSettingsResult | null> {
    await this.ensureFresh();
    if (!this.cache) return null;

    const settings = this.cache;
    let secretSettings: Record<string, string> | undefined;
    if (settings.secretSettings) {
      try {
        secretSettings = JSON.parse(
          AuthService.fixedDecryption(settings.secretSettings),
        );
      } catch {
        secretSettings = undefined;
      }
    }

    const parsed: any = { ...settings, secretSettings };
    for (const field of ['scopeModels', 'guardrailSettings', 'budgetSettings', 'rateLimitSettings', 'observability', 'mcpSettings', 'ragSettings', 'cacheSettings', 'routingSettings']) {
      if (typeof parsed[field] === 'string') {
        try {
          parsed[field] = JSON.parse(parsed[field]);
        } catch {
          // leave as-is
        }
      }
    }

    parsed.activeProvider = normalizeProviderId(parsed.activeProvider);
    parsed.fallbackProvider = normalizeProviderId(parsed.fallbackProvider);
    parsed.fallbackImageProvider = normalizeProviderId(
      parsed.fallbackImageProvider,
    );
    parsed.scopeModels = ensureScopeModelsVersion(parsed.scopeModels);

    return parsed;
  }

  /**
   * Checks whether at least one org has configured an active AI provider
   * (or if global settings still have an activeProvider from a previous admin setup).
   */
  hasActiveConfig(): boolean {
    this.ensureFresh().catch(() => {});
    return !!(this.cache?.activeProvider);
  }

  async hasActiveConfigAsync(): Promise<boolean> {
    await this.ensureFresh();
    return !!(this.cache?.activeProvider);
  }
}

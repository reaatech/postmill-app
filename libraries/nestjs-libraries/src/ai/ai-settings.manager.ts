import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

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
  // Cache stores the RAW (encrypted) settings from the repository.
  // Decryption happens at access time in getSettings().
  private cache: CachedSettings | null = null;
  private lastRefresh = 0;
  private refreshIntervalMs = 60_000;
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
    // Store the raw encrypted settings from the repository — do NOT decrypt here.
    // Decryption is deferred to getSettings() at access time (review11 #5).
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

    // Decrypt cached raw (encrypted) settings in-memory — no DB call.
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

    // Parse all JSON blob fields
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

    return parsed;
  }

  /**
   * Sync check — fires ensureFresh() in the background to trigger a cache refresh,
   * but returns the current (possibly stale) result immediately without awaiting it.
   * Use hasActiveConfigAsync() for a guaranteed up-to-date answer.
   */
  hasActiveConfig(): boolean {
    // Fire-and-forget: triggers background refresh but returns current (possibly stale) state
    this.ensureFresh().catch(() => {});
    return !!(this.cache?.activeProvider || process.env.OPENAI_API_KEY);
  }

  async hasActiveConfigAsync(): Promise<boolean> {
    await this.ensureFresh();
    return !!(this.cache?.activeProvider || process.env.OPENAI_API_KEY);
  }
}

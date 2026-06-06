import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerBehindProxyGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';

/**
 * AI rate-limit guard.
 *
 * Reads dynamic rate limits from the cached AI settings (`rateLimitSettings`)
 * and overrides the static decorator-configured throttler options at runtime.
 * Per-org tracking is inherited from `ThrottlerBehindProxyGuard.getTracker()`.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerBehindProxyGuard {
  @Inject(AiSettingsManager)
  private readonly _aiSettingsManager!: AiSettingsManager;

  private _baseThrottlers: typeof this.throttlers | null = null;

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const settings = await this._aiSettingsManager.getSettings();
    const rateLimitSettings = settings?.rateLimitSettings;

    if (!rateLimitSettings?.enabled) return true;

    if (!this._baseThrottlers) {
      this._baseThrottlers = this.throttlers.map((t) => ({ ...t }));
    }

    const previous = this.throttlers;
    this.throttlers = this._baseThrottlers.map(t => ({
      ...t,
      limit: rateLimitSettings.requestsPerMinute ?? t.limit,
      ttl: 60000,
    }));

    try {
      return await super.canActivate(context);
    } finally {
      this.throttlers = previous;
    }
  }
}

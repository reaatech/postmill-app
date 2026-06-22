import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InngestService } from '@gitroom/nestjs-libraries/inngest/inngest.service';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

const EVENT_API_TIMEOUT_MS = 5_000;
const INNGEST_CLOUD_EVENT_API = 'https://inn.gs/';
const INNGEST_DEV_BASE_URL = 'http://localhost:8288';

@ApiTags('Health')
@Controller('/health')
export class HealthController {
  constructor(private readonly inngestService: InngestService) {}

  @Get('/')
  @SkipThrottle()
  async getHealth() {
    const inngestHealth = await this.checkInngest();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      inngest: inngestHealth,
    };
  }

  private async checkInngest() {
    const useInngest = process.env.USE_INNGEST === 'true' || process.env.USE_INNGEST === '1';
    const devMode = process.env.INNGEST_DEV === '1';
    const eventKey = process.env.INNGEST_EVENT_KEY;
    const signingKey = process.env.INNGEST_SIGNING_KEY;
    const fallbackKey = process.env.INNGEST_SIGNING_KEY_FALLBACK;

    const eventKeyPresent = !!eventKey && eventKey.length > 0;
    const signingKeyPresent = !!signingKey && signingKey.length > 0;
    const fallbackKeyPresent = !!fallbackKey && fallbackKey.length > 0;

    // Lightweight local reachability: ensure the serve handler has functions registered.
    // This avoids an external network call that could fail spuriously.
    let functionsRegistered = 0;
    try {
      functionsRegistered = this.inngestService.getFunctions().length;
    } catch {
      functionsRegistered = 0;
    }
    const serveHandlerRegistered = functionsRegistered > 0;

    const signingKeyRequired = !devMode;
    const signingKeyValid = signingKeyRequired ? signingKeyPresent : true;

    const eventApiReachable = await this.checkEventApiReachability(devMode);

    const healthy =
      serveHandlerRegistered &&
      (!useInngest || devMode || (eventKeyPresent && signingKeyValid));

    return {
      useInngest,
      devMode,
      eventKeyPresent,
      signingKeyPresent,
      signingKeyRequired,
      fallbackKeyPresent,
      serveHandlerRegistered,
      functionsRegistered,
      eventApiReachable,
      healthy,
    };
  }

  private async checkEventApiReachability(devMode: boolean): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EVENT_API_TIMEOUT_MS);

    try {
      if (devMode) {
        const baseUrl = process.env.INNGEST_BASE_URL || INNGEST_DEV_BASE_URL;
        const response = await fetch(baseUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });
        return response.ok;
      }

      const response = await safeFetch(INNGEST_CLOUD_EVENT_API, {
        method: 'HEAD',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}

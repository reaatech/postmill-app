import { Injectable } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { ShortLinkAdapter, ShortLinkCredentialField, ShortLinkCapabilities, ShortLinkContext } from '../short-link.interface';

@Injectable()
export class CleanuriAdapter implements ShortLinkAdapter {
  readonly identifier = 'cleanuri';
  readonly name = 'CleanURI';
  readonly authType = 'none' as const;
  readonly defaultDomain = 'cleanuri.com';
  readonly credentialFields: ShortLinkCredentialField[] = [];
  readonly capabilities: ShortLinkCapabilities = {
    create: true,
    expand: false,
    statistics: false,
    bulkStatistics: false,
    customDomain: false,
  };

  resolveDomain(ctx: ShortLinkContext): string {
    return ctx.customDomain || this.defaultDomain;
  }

  async validateCredentials(_ctx: ShortLinkContext): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  async createShortLink(_ctx: ShortLinkContext, originalUrl: string): Promise<{ shortUrl: string; providerLinkId?: string }> {
    const params = new URLSearchParams({ url: originalUrl });
    const response = await safeFetch('https://cleanuri.com/api/v1/shorten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CleanURI create failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    if (data.error) {
      throw new Error(`CleanURI create failed: ${data.error}`);
    }
    return { shortUrl: data.result_url || data.short_url || data.link };
  }
}

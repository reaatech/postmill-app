import { Injectable } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { ShortLinkAdapter, ShortLinkCredentialField, ShortLinkCapabilities, ShortLinkContext } from '../short-link.interface';

@Injectable()
export class VgdAdapter implements ShortLinkAdapter {
  readonly identifier = 'vgd';
  readonly name = 'v.gd';
  readonly authType = 'none' as const;
  readonly defaultDomain = 'v.gd';
  readonly credentialFields: ShortLinkCredentialField[] = [];
  readonly capabilities: ShortLinkCapabilities = {
    create: true,
    expand: true,
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
    const params = new URLSearchParams({ format: 'json', url: originalUrl });
    const response = await safeFetch(`https://v.gd/create.php?${params.toString()}`, { method: 'GET' });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`v.gd create failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    if (data.errorcode) {
      throw new Error(`v.gd create failed: ${data.errormessage || data.error}`);
    }
    return { shortUrl: data.shorturl || data.url };
  }

  async expandShortLink(_ctx: ShortLinkContext, shortUrl: string): Promise<string> {
    const params = new URLSearchParams({ format: 'json', shorturl: shortUrl });
    const response = await safeFetch(`https://v.gd/forward.php?${params.toString()}`, { method: 'GET' });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`v.gd expand failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    if (data.errorcode) {
      throw new Error(`v.gd expand failed: ${data.errormessage || data.error}`);
    }
    return data.url || '';
  }
}

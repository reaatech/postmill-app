import { Injectable } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { ShortLinkAdapter, ShortLinkCredentialField, ShortLinkCapabilities, ShortLinkContext, ShortLinkStat } from '../short-link.interface';

@Injectable()
export class TinyurlAdapter implements ShortLinkAdapter {
  readonly identifier = 'tinyurl';
  readonly name = 'TinyURL';
  readonly authType = 'apiKey' as const;
  readonly defaultDomain = 'tinyurl.com';
  readonly credentialFields: ShortLinkCredentialField[] = [
    { key: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'Enter your TinyURL API token' },
  ];
  readonly capabilities: ShortLinkCapabilities = {
    create: true,
    expand: true,
    statistics: false,
    bulkStatistics: false,
    customDomain: true,
  };

  resolveDomain(ctx: ShortLinkContext): string {
    return ctx.customDomain || this.defaultDomain;
  }

  async validateCredentials(ctx: ShortLinkContext): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await safeFetch('https://api.tinyurl.com/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ctx.credentials.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: 'https://example.com/validate' }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { ok: false, error: 'Invalid API token' };
        }
        const body = await response.text();
        return { ok: false, error: `TinyURL API error (${response.status}): ${body}` };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to validate TinyURL credentials' };
    }
  }

  async createShortLink(ctx: ShortLinkContext, originalUrl: string): Promise<{ shortUrl: string; providerLinkId?: string }> {
    const body: Record<string, any> = { url: originalUrl };
    if (ctx.customDomain) {
      body.domain = ctx.customDomain;
    }
    const response = await safeFetch('https://api.tinyurl.com/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TinyURL create failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return { shortUrl: data.data?.tiny_url || data.data?.url, providerLinkId: data.data?.id || data.data?.alias };
  }

  async expandShortLink(ctx: ShortLinkContext, shortUrl: string): Promise<string> {
    const response = await safeFetch('https://api.tinyurl.com/expand', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: shortUrl }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TinyURL expand failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return data.data?.long_url || data.data?.url;
  }
}

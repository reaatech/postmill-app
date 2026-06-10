import { Injectable } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { ShortLinkAdapter, ShortLinkCredentialField, ShortLinkCapabilities, ShortLinkContext, ShortLinkStat } from '../short-link.interface';

@Injectable()
export class ShortioAdapter implements ShortLinkAdapter {
  readonly identifier = 'shortio';
  readonly name = 'Short.io';
  readonly authType = 'apiKey' as const;
  readonly defaultDomain = 'short.io';
  readonly credentialFields: ShortLinkCredentialField[] = [
    { key: 'secretKey', label: 'Secret Key', type: 'password', required: true, placeholder: 'Enter your Short.io secret key' },
    { key: 'domain', label: 'Short Domain', type: 'string', required: true, placeholder: 'e.g. short.io' },
  ];
  readonly capabilities: ShortLinkCapabilities = {
    create: true,
    expand: true,
    statistics: true,
    bulkStatistics: true,
    customDomain: true,
  };

  private readonly apiBase = 'https://api.short.io';

  resolveDomain(ctx: ShortLinkContext): string {
    return ctx.customDomain || ctx.credentials.domain || this.defaultDomain;
  }

  async validateCredentials(ctx: ShortLinkContext): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await safeFetch(`${this.apiBase}/api/links`, {
        method: 'GET',
        headers: {
          'Authorization': ctx.credentials.secretKey,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: `Short.io API error (${response.status}): ${body}` };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to validate Short.io credentials' };
    }
  }

  async createShortLink(ctx: ShortLinkContext, originalUrl: string): Promise<{ shortUrl: string; providerLinkId?: string }> {
    const domain = ctx.credentials.domain || this.defaultDomain;
    const body: Record<string, any> = {
      originalURL: originalUrl,
      domain,
    };
    const response = await safeFetch(`${this.apiBase}/api/links`, {
      method: 'POST',
      headers: {
        'Authorization': ctx.credentials.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Short.io create failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return { shortUrl: `https://${domain}/${data.idString || data.shortURL || data.path}`, providerLinkId: data.idString || data.id };
  }

  async expandShortLink(ctx: ShortLinkContext, shortUrl: string): Promise<string> {
    const path = shortUrl.replace(/https?:\/\//, '');
    const response = await safeFetch(`${this.apiBase}/api/links/expand`, {
      method: 'POST',
      headers: {
        'Authorization': ctx.credentials.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ shortURL: path }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Short.io expand failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return data.originalURL || data.long_url || '';
  }

  async linkStatistics(ctx: ShortLinkContext, links: string[]): Promise<ShortLinkStat[]> {
    const results: ShortLinkStat[] = [];
    for (const link of links) {
      try {
        const path = link.replace(/https?:\/\//, '');
        const response = await safeFetch(`${this.apiBase}/api/links/${encodeURIComponent(path)}`, {
          method: 'GET',
          headers: {
            'Authorization': ctx.credentials.secretKey,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          results.push({
            short: `https://${data.domain || this.defaultDomain}/${data.idString || data.path}`,
            original: data.originalURL || '',
            clicks: String(data.clicks || '0'),
          });
        }
      } catch {
        results.push({ short: link, original: '', clicks: '0' });
      }
    }
    return results;
  }

  async listLinks(ctx: ShortLinkContext, page: number): Promise<ShortLinkStat[]> {
    const response = await safeFetch(`${this.apiBase}/api/links?page=${page}&limit=50`, {
      method: 'GET',
      headers: {
        'Authorization': ctx.credentials.secretKey,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Short.io list failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    const links = Array.isArray(data) ? data : data.links || [];
    return links.map((link: any) => ({
      short: `https://${link.domain || this.defaultDomain}/${link.idString || link.path}`,
      original: link.originalURL || '',
      clicks: String(link.clicks || '0'),
    }));
  }
}

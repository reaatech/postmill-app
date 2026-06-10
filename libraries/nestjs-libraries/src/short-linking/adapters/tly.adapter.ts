import { Injectable } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { ShortLinkAdapter, ShortLinkCredentialField, ShortLinkCapabilities, ShortLinkContext, ShortLinkStat } from '../short-link.interface';

@Injectable()
export class TlyAdapter implements ShortLinkAdapter {
  readonly identifier = 'tly';
  readonly name = 'T.LY';
  readonly authType = 'apiKey' as const;
  readonly defaultDomain = 't.ly';
  readonly credentialFields: ShortLinkCredentialField[] = [
    { key: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'Enter your T.LY API token' },
  ];
  readonly capabilities: ShortLinkCapabilities = {
    create: true,
    expand: true,
    statistics: true,
    bulkStatistics: true,
    customDomain: true,
  };

  private readonly apiBase = 'https://t.ly/api/v1';

  resolveDomain(ctx: ShortLinkContext): string {
    return ctx.customDomain || this.defaultDomain;
  }

  async validateCredentials(ctx: ShortLinkContext): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await safeFetch(`${this.apiBase}/link/shorten`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ctx.credentials.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ long_url: 'https://example.com/validate' }),
      });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: `T.LY API error (${response.status}): ${body}` };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to validate T.LY credentials' };
    }
  }

  async createShortLink(ctx: ShortLinkContext, originalUrl: string): Promise<{ shortUrl: string; providerLinkId?: string }> {
    const body: Record<string, any> = { long_url: originalUrl };
    if (ctx.customDomain) {
      body.domain = ctx.customDomain;
    }
    const response = await safeFetch(`${this.apiBase}/link/shorten`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`T.LY create failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return { shortUrl: data.short_url || data.link, providerLinkId: data.id || String(data.hash) };
  }

  async expandShortLink(ctx: ShortLinkContext, shortUrl: string): Promise<string> {
    const response = await safeFetch(`${this.apiBase}/link/expand`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ short_url: shortUrl }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`T.LY expand failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return data.long_url || data.original_url || '';
  }

  async linkStatistics(ctx: ShortLinkContext, links: string[]): Promise<ShortLinkStat[]> {
    const results: ShortLinkStat[] = [];
    for (const link of links) {
      try {
        const response = await safeFetch(`${this.apiBase}/link/stats`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ctx.credentials.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ short_url: link }),
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          results.push({ short: link, original: data.long_url || '', clicks: String(data.total_clicks || data.clicks || '0') });
        }
      } catch {
        results.push({ short: link, original: '', clicks: '0' });
      }
    }
    return results;
  }

  async listLinks(ctx: ShortLinkContext, page: number): Promise<ShortLinkStat[]> {
    const response = await safeFetch(`${this.apiBase}/link/list?page=${page}&limit=50`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ctx.credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`T.LY list failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return (data.links || data.data || []).map((link: any) => ({
      short: link.short_url || link.link,
      original: link.long_url || link.original_url || '',
      clicks: String(link.clicks || link.total_clicks || '0'),
    }));
  }
}

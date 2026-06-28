import { ShortLinkCapability, ShortLinkCredentialField, ShortLinkCapabilities, ShortLinkContext, ShortLinkStat, ProviderModule, SafeFetchPort } from '@gitroom/provider-kernel';

export class BlinkAdapter implements ShortLinkCapability {
  constructor(private readonly _fetch: SafeFetchPort) {}

  readonly identifier = 'blink';
  readonly name = 'BL.INK';
  readonly authType = 'apiKey' as const;
  readonly defaultDomain = 'bl.ink';
  readonly credentialFields: ShortLinkCredentialField[] = [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Enter your BL.INK API key' },
  ];
  readonly capabilities: ShortLinkCapabilities = {
    create: true,
    expand: true,
    statistics: true,
    bulkStatistics: true,
    customDomain: true,
  };

  private readonly apiBase = 'https://api.bl.ink';

  resolveDomain(ctx: ShortLinkContext): string {
    return ctx.customDomain || this.defaultDomain;
  }

  private headers(ctx: ShortLinkContext): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': ctx.credentials.apiKey,
    };
  }

  async validateCredentials(ctx: ShortLinkContext): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this._fetch(`${this.apiBase}/api/v1/links?limit=1`, {
        method: 'GET',
        headers: this.headers(ctx),
      });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: `BL.INK API error (${response.status}): ${body}` };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to validate BL.INK credentials' };
    }
  }

  async createShortLink(ctx: ShortLinkContext, originalUrl: string): Promise<{ shortUrl: string; providerLinkId?: string }> {
    const domain = this.resolveDomain(ctx);
    const body: Record<string, any> = { url: originalUrl, domain };
    if (ctx.customDomain) {
      body.domain = ctx.customDomain;
    }
    const response = await this._fetch(`${this.apiBase}/api/v1/links`, {
      method: 'POST',
      headers: this.headers(ctx),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BL.INK create failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return { shortUrl: `https://${domain}/${data.slug || data.id}`, providerLinkId: data.id || data.slug };
  }

  async expandShortLink(ctx: ShortLinkContext, shortUrl: string): Promise<string> {
    const slug = shortUrl.replace(/https?:\/\//, '').split('/').pop() || '';
    const response = await this._fetch(`${this.apiBase}/api/v1/link/${encodeURIComponent(slug)}`, {
      method: 'GET',
      headers: this.headers(ctx),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BL.INK expand failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    return data.url || data.destination || '';
  }

  async linkStatistics(ctx: ShortLinkContext, links: string[]): Promise<ShortLinkStat[]> {
    const results: ShortLinkStat[] = [];
    for (const link of links) {
      try {
        const slug = link.replace(/https?:\/\//, '').split('/').pop() || '';
        const response = await this._fetch(`${this.apiBase}/api/v1/link/${encodeURIComponent(slug)}/analytics`, {
          method: 'GET',
          headers: this.headers(ctx),
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          results.push({ short: link, original: data.url || data.destination || '', clicks: String(data.clicks || data.total_clicks || '0') });
        }
      } catch {
        results.push({ short: link, original: '', clicks: '0' });
      }
    }
    return results;
  }

  async listLinks(ctx: ShortLinkContext, page: number): Promise<ShortLinkStat[]> {
    const response = await this._fetch(`${this.apiBase}/api/v1/links?limit=50&offset=${(page - 1) * 50}`, {
      method: 'GET',
      headers: this.headers(ctx),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BL.INK list failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as any;
    const links = Array.isArray(data) ? data : data.links || data.data || [];
    return links.map((link: any) => ({
      short: `${link.domain ? `https://${link.domain}` : this.defaultDomain}/${link.slug || link.id}`,
      original: link.url || link.destination || '',
      clicks: String(link.clicks || link.total_clicks || '0'),
    }));
  }
}

const _meta: ShortLinkCapability = new BlinkAdapter(undefined as unknown as SafeFetchPort);

export const blinkShortlinkModule: ProviderModule<any, any> = {
  manifest: {
    domain: 'shortlink',
    providerId: _meta.identifier,
    version: 'v1',
    displayName: _meta.name,
    status: 'active',
    credentialFields: _meta.credentialFields as any,
    capabilities: _meta.capabilities,
    authType: _meta.authType,
    defaultDomain: _meta.defaultDomain,
    setupNotes: _meta.setupNotes,
  },
  create: (rt) => new BlinkAdapter(rt.fetch),
};

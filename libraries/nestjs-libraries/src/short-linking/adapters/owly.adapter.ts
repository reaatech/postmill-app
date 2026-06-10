import { Injectable } from '@nestjs/common';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { ShortLinkAdapter, ShortLinkCredentialField, ShortLinkCapabilities, ShortLinkContext } from '../short-link.interface';

@Injectable()
export class OwlyAdapter implements ShortLinkAdapter {
  readonly identifier = 'owly';
  readonly name = 'Ow.ly';
  readonly authType = 'apiKey' as const;
  readonly defaultDomain = 'ow.ly';
  readonly setupNotes = 'Ow.ly creation and stats are not supported via public API. Short links must be created via the Hootsuite dashboard. This adapter validates Hootsuite credentials only.';
  readonly credentialFields: ShortLinkCredentialField[] = [
    { key: 'hootsuiteToken', label: 'Hootsuite Token', type: 'password', required: true, placeholder: 'Enter your Hootsuite API token for Ow.ly' },
  ];
  readonly capabilities: ShortLinkCapabilities = {
    create: false,
    expand: false,
    statistics: false,
    bulkStatistics: false,
    customDomain: false,
  };

  resolveDomain(_ctx: ShortLinkContext): string {
    return this.defaultDomain;
  }

  async validateCredentials(ctx: ShortLinkContext): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await safeFetch('https://api.hootsuite.com/1/auth/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: ctx.credentials.hootsuiteToken,
        }).toString(),
      });
      if (response.ok) {
        return { ok: true };
      }
      return { ok: false, error: `Ow.ly token validation failed (${response.status})` };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to validate Ow.ly/Hootsuite credentials' };
    }
  }

  async createShortLink(_ctx: ShortLinkContext, _originalUrl: string): Promise<{ shortUrl: string; providerLinkId?: string }> {
    throw new Error('Ow.ly short link creation is not supported via public API');
  }
}

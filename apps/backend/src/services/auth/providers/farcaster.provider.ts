import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { getEnvOr } from '@gitroom/nestjs-libraries/integrations/credentials';

@AuthProvider({ provider: 'FARCASTER' })
export class FarcasterProvider extends AuthProviderAbstract {
  private _client: NeynarAPIClient | undefined;
  private get client(): NeynarAPIClient {
    if (!this._client) {
      const apiKey = getEnvOr('NEYNAR_SECRET_KEY', 'wrapcast', 'clientSecret');
      if (!apiKey) throw new Error('Authentication provider not configured.');
      this._client = new NeynarAPIClient({ apiKey });
    }
    return this._client;
  }
  generateLink() {
    return '';
  }

  async getToken(code: string, _redirectUri?: string) {
    const data = JSON.parse(Buffer.from(code, 'base64').toString());
    const status = await this.client.lookupSigner({ signerUuid: data.signer_uuid });
    if (status.status === 'approved') {
      return data.signer_uuid;
    }

    return '';
  }

  async getUser(providerToken: string) {
    if (!providerToken) {
      return {
        id: '',
        email: '',
      };
    }

    const status = await this.client.lookupSigner({ signerUuid: providerToken });
    if (status.status !== 'approved') {
      return {
        id: '',
        email: '',
      };
    }

    return {
      id: String('farcaster_' + status.fid),
      email: String('farcaster_' + status.fid),
    };
  }
}

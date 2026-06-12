import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { getLoginEnv } from './get-login-env';
import { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import { Injectable, Optional } from '@nestjs/common';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { Provider } from '@prisma/client';

@AuthProvider({ provider: 'FARCASTER' })
export class FarcasterProvider extends AuthProviderAbstract {
  constructor(
    @Optional() private _authProviderRepo?: AuthProviderRepository,
    @Optional() private _encryptionService?: EncryptionService
  ) {
    super();
  }

  private async resolveApiKey() {
    if (this._authProviderRepo) {
      try {
        const dbConfig = await this._authProviderRepo.findByProvider(Provider.FARCASTER);
        if (dbConfig?.enabled && dbConfig.clientId) {
          const apiKey = this._encryptionService
            ? this._encryptionService.decrypt(dbConfig.clientId)
            : dbConfig.clientId;
          if (apiKey) return apiKey;
        }
      } catch {}
    }

    const apiKey = getLoginEnv('NEYNAR_SECRET_KEY');
    if (!apiKey) throw new Error('Farcaster auth provider is not configured');
    return apiKey;
  }

  private _client: NeynarAPIClient | undefined;
  private async getClient(): Promise<NeynarAPIClient> {
    if (!this._client) {
      const apiKey = await this.resolveApiKey();
      this._client = new NeynarAPIClient({ apiKey });
    }
    return this._client;
  }

  generateLink() {
    return '';
  }

  async getToken(code: string, _redirectUri?: string) {
    const client = await this.getClient();
    const data = JSON.parse(Buffer.from(code, 'base64').toString());
    const status = await client.lookupSigner({ signerUuid: data.signer_uuid });
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

    const client = await this.getClient();
    const status = await client.lookupSigner({ signerUuid: providerToken });
    if (status.status !== 'approved') {
      return {
        id: '',
        email: '',
      };
    }

    const { display_name, displayName } = status as typeof status & {
      display_name?: string;
      displayName?: string;
    };

    return {
      id: String('farcaster_' + status.fid),
      email: String('farcaster_' + status.fid),
      name: display_name || displayName || null,
    };
  }
}

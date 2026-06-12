import { google } from 'googleapis';
import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { getLoginEnv } from './get-login-env';
import { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import { Injectable, Optional } from '@nestjs/common';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { Provider } from '@prisma/client';

const defaultRedirect = () =>
  `${process.env.FRONTEND_URL}/integrations/social/youtube`;

@AuthProvider({ provider: 'GOOGLE' })
export class GoogleProvider extends AuthProviderAbstract {
  constructor(
    @Optional() private _authProviderRepo?: AuthProviderRepository,
    @Optional() private _encryptionService?: EncryptionService
  ) {
    super();
  }

  private async resolveConfig() {
    if (this._authProviderRepo) {
      try {
        const dbConfig = await this._authProviderRepo.findByProvider(Provider.GOOGLE);
        if (dbConfig?.enabled && dbConfig.clientId && dbConfig.clientSecret) {
          const clientId = this._encryptionService
            ? this._encryptionService.decrypt(dbConfig.clientId)
            : dbConfig.clientId;
          const clientSecret = this._encryptionService
            ? this._encryptionService.decrypt(dbConfig.clientSecret)
            : dbConfig.clientSecret;
          return { clientId, clientSecret };
        }
      } catch {}
    }

    const clientId = getLoginEnv('YOUTUBE_CLIENT_ID');
    const clientSecret = getLoginEnv('YOUTUBE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new Error('Google auth provider is not configured');
    }
    return { clientId, clientSecret };
  }

  private async makeClient(redirectUri: string) {
    const { clientId, clientSecret } = await this.resolveConfig();
    return new google.auth.OAuth2({
      clientId,
      clientSecret,
      redirectUri,
    });
  }

  async generateLink(query?: { redirect_uri?: string }) {
    const redirectUri = query?.redirect_uri || defaultRedirect();
    const client = await this.makeClient(redirectUri);
    return client.generateAuthUrl({
      access_type: 'online',
      prompt: 'consent',
      state: 'login',
      redirect_uri: redirectUri,
      scope: [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
  }

  async getToken(code: string, redirectUri?: string) {
    const client = await this.makeClient(redirectUri || defaultRedirect());
    const { tokens } = await client.getToken(code);
    return tokens.access_token!;
  }

  async getUser(providerToken: string) {
    const client = await this.makeClient(defaultRedirect());
    client.setCredentials({ access_token: providerToken });
    const { data } = await google
      .oauth2({ version: 'v2', auth: client })
      .userinfo.get();

    return {
      id: data.id!,
      email: data.email!,
      picture: data.picture || null,
      name: data.name || null,
    };
  }
}

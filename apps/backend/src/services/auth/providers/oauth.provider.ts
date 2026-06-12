import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { getLoginEnv } from './get-login-env';
import { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import { Injectable, Optional } from '@nestjs/common';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { Provider } from '@prisma/client';

@AuthProvider({ provider: 'GENERIC' })
export class OauthProvider extends AuthProviderAbstract {
  constructor(
    @Optional() private _authProviderRepo?: AuthProviderRepository,
    @Optional() private _encryptionService?: EncryptionService
  ) {
    super();
  }

  private async getDbConfig() {
    if (!this._authProviderRepo) return null;
    try {
      return await this._authProviderRepo.findByProvider(Provider.GENERIC);
    } catch {
      return null;
    }
  }

  private getEnvConfig() {
    const clientId = getLoginEnv('POSTMILL_OAUTH_CLIENT_ID');
    const clientSecret = getLoginEnv('POSTMILL_OAUTH_CLIENT_SECRET');
    const {
      POSTMILL_OAUTH_AUTH_URL: authUrl,
      POSTMILL_OAUTH_TOKEN_URL: tokenUrl,
      POSTMILL_OAUTH_USERINFO_URL: userInfoUrl,
      FRONTEND_URL: frontendUrl,
    } = process.env;

    if (
      !userInfoUrl ||
      !tokenUrl ||
      !clientId ||
      !clientSecret ||
      !authUrl ||
      !frontendUrl
    ) {
      return null;
    }

    return {
      authUrl,
      clientId,
      clientSecret,
      tokenUrl,
      userInfoUrl,
      scopes: 'openid profile email',
      displayName: 'OIDC',
      frontendUrl,
    };
  }

  private async resolveConfig() {
    const dbConfig = await this.getDbConfig();
    if (dbConfig?.enabled && dbConfig.authUrl && dbConfig.tokenUrl && dbConfig.userInfoUrl) {
      const clientSecret = dbConfig.clientSecret && this._encryptionService
        ? this._encryptionService.decrypt(dbConfig.clientSecret)
        : dbConfig.clientSecret;
      const clientId = dbConfig.clientId && this._encryptionService
        ? this._encryptionService.decrypt(dbConfig.clientId)
        : dbConfig.clientId;

      return {
        authUrl: dbConfig.authUrl,
        clientId: clientId || '',
        clientSecret: clientSecret || '',
        tokenUrl: dbConfig.tokenUrl,
        userInfoUrl: dbConfig.userInfoUrl,
        scopes: dbConfig.scopes || 'openid profile email',
        displayName: dbConfig.displayName || 'OIDC',
        frontendUrl: process.env.FRONTEND_URL!,
      };
    }

    const envConfig = this.getEnvConfig();
    if (envConfig) return envConfig;

    // Try reading env vars individually if DB had no enabled config but env may have partial
    const clientId = getLoginEnv('POSTMILL_OAUTH_CLIENT_ID');
    const clientSecret = getLoginEnv('POSTMILL_OAUTH_CLIENT_SECRET');
    const authUrl = process.env.POSTMILL_OAUTH_AUTH_URL;
    const tokenUrl = process.env.POSTMILL_OAUTH_TOKEN_URL;
    const userInfoUrl = process.env.POSTMILL_OAUTH_USERINFO_URL;
    const frontendUrl = process.env.FRONTEND_URL;

    if (!userInfoUrl || !tokenUrl || !clientId || !clientSecret || !authUrl || !frontendUrl) {
      throw new Error('GENERIC/OIDC auth provider is not configured');
    }

    return {
      authUrl,
      clientId,
      clientSecret,
      tokenUrl,
      userInfoUrl,
      scopes: 'openid profile email',
      displayName: 'OIDC',
      frontendUrl,
    };
  }

  async generateLink(): Promise<string> {
    const config = await this.resolveConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      scope: config.scopes,
      response_type: 'code',
      redirect_uri: `${config.frontendUrl}/settings`,
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const config = await this.resolveConfig();
    const response = await fetch(`${config.tokenUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: `${config.frontendUrl}/settings`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token request failed: ${error}`);
    }

    const { access_token } = await response.json();
    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string; picture?: string | null; name?: string | null }> {
    const config = await this.resolveConfig();
    const response = await fetch(`${config.userInfoUrl}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`User info request failed: ${error}`);
    }

    const data = (await response.json()) as {
      email: string;
      sub?: string;
      id?: string;
      picture?: string | null;
      name?: string | null;
    };
    return {
      email: data.email,
      id: data.sub || data.id,
      picture: data.picture || null,
      name: data.name || null,
    };
  }
}

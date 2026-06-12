import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { getLoginEnv } from './get-login-env';
import { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import { Injectable, Optional } from '@nestjs/common';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { Provider } from '@prisma/client';

@AuthProvider({ provider: 'GITHUB' })
export class GithubProvider extends AuthProviderAbstract {
  constructor(
    @Optional() private _authProviderRepo?: AuthProviderRepository,
    @Optional() private _encryptionService?: EncryptionService
  ) {
    super();
  }

  private async resolveConfig() {
    if (this._authProviderRepo) {
      try {
        const dbConfig = await this._authProviderRepo.findByProvider(Provider.GITHUB);
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

    const clientId = getLoginEnv('GITHUB_CLIENT_ID');
    const clientSecret = getLoginEnv('GITHUB_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new Error('GitHub auth provider is not configured');
    }
    return { clientId, clientSecret };
  }

  async generateLink(): Promise<string> {
    const { clientId } = await this.resolveConfig();
    return `https://github.com/login/oauth/authorize?client_id=${
      clientId
    }&scope=user:email&redirect_uri=${encodeURIComponent(
      `${process.env.FRONTEND_URL}/settings`
    )}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const { clientId, clientSecret } = await this.resolveConfig();
    const { access_token } = await (
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${process.env.FRONTEND_URL}/settings`,
        }),
      })
    ).json();

    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string; picture?: string | null; name?: string | null }> {
    const [userData, emailsData] = await Promise.all([
      (
        await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `token ${access_token}`,
          },
        })
      ).json(),
      (
        await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `token ${access_token}`,
          },
        })
      ).json(),
    ]);

    const { email } = emailsData[0];

    return {
      email: email,
      id: String(userData.id),
      picture: userData.avatar_url || null,
      name: userData.name || userData.login || null,
    };
  }
}

import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { getLoginEnv } from './get-login-env';

@AuthProvider({ provider: 'GITHUB' })
export class GithubProvider extends AuthProviderAbstract {
  generateLink(): string {
    return `https://github.com/login/oauth/authorize?client_id=${
      getLoginEnv('GITHUB_CLIENT_ID')
    }&scope=user:email&redirect_uri=${encodeURIComponent(
      `${process.env.FRONTEND_URL}/settings`
    )}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const { access_token } = await (
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: getLoginEnv('GITHUB_CLIENT_ID'),
          client_secret: getLoginEnv('GITHUB_CLIENT_SECRET'),
          code,
          redirect_uri: `${process.env.FRONTEND_URL}/settings`,
        }),
      })
    ).json();

    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const data = await (
      await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    const [{ email }] = await (
      await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `token ${access_token}`,
        },
      })
    ).json();

    return {
      email: email,
      id: String(data.id),
    };
  }
}

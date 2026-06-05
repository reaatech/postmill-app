import { google } from 'googleapis';
import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { getEnvOr } from '@gitroom/nestjs-libraries/integrations/credentials';

const defaultRedirect = () =>
  `${process.env.FRONTEND_URL}/integrations/social/youtube`;

const makeClient = (redirectUri: string) =>
  new google.auth.OAuth2({
    // NOTE: Uses 'youtube' identifier because Google sign-in and YouTube share the same Google Cloud project credentials.
    clientId: getEnvOr('YOUTUBE_CLIENT_ID', 'youtube', 'clientId'),
    clientSecret: getEnvOr('YOUTUBE_CLIENT_SECRET', 'youtube', 'clientSecret'),
    redirectUri,
  });

@AuthProvider({ provider: 'GOOGLE' })
export class GoogleProvider extends AuthProviderAbstract {
  generateLink(query?: { redirect_uri?: string }) {
    const redirectUri = query?.redirect_uri || defaultRedirect();
    return makeClient(redirectUri).generateAuthUrl({
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
    const client = makeClient(redirectUri || defaultRedirect());
    const { tokens } = await client.getToken(code);
    return tokens.access_token!;
  }

  async getUser(providerToken: string) {
    const client = makeClient(defaultRedirect());
    client.setCredentials({ access_token: providerToken });
    const { data } = await google
      .oauth2({ version: 'v2', auth: client })
      .userinfo.get();

    return {
      id: data.id!,
      email: data.email!,
    };
  }
}

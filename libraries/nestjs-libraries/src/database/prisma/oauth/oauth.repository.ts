import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

@Injectable()
export class OAuthRepository {
  constructor(
    private _oauthApp: PrismaRepository<'oAuthApp'>,
    private _oauthAuth: PrismaRepository<'oAuthAuthorization'>
  ) {}

  getAppByOrgId(orgId: string) {
    return this._oauthApp.model.oAuthApp.findFirst({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
      include: {
        picture: true,
      },
    });
  }

  getAppByClientId(clientId: string) {
    return this._oauthApp.model.oAuthApp.findFirst({
      where: {
        clientId,
        deletedAt: null,
      },
      include: {
        picture: true,
      },
    });
  }

  createApp(
    orgId: string,
    data: {
      name: string;
      description?: string;
      pictureId?: string;
      redirectUrl: string;
      clientId: string;
      clientSecret: string;
    }
  ) {
    return this._oauthApp.model.oAuthApp.create({
      data: {
        organizationId: orgId,
        name: data.name,
        description: data.description,
        pictureId: data.pictureId,
        redirectUrl: data.redirectUrl,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
      },
      include: {
        picture: true,
      },
    });
  }

  async updateApp(
    orgId: string,
    data: {
      name?: string;
      description?: string;
      pictureId?: string;
      redirectUrl?: string;
    }
  ) {
    const app = await this._oauthApp.model.oAuthApp.findFirst({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
    if (!app) {
      return null;
    }
    return this._oauthApp.model.oAuthApp.update({
      where: { id: app.id },
      data,
      include: {
        picture: true,
      },
    });
  }

  async deleteApp(orgId: string) {
    const app = await this._oauthApp.model.oAuthApp.findFirst({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
    if (!app) {
      return null;
    }
    return this._oauthApp.model.oAuthApp.update({
      where: { id: app.id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async updateClientSecret(orgId: string, newSecret: string) {
    const app = await this._oauthApp.model.oAuthApp.findFirst({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
    if (!app) {
      return null;
    }
    return this._oauthApp.model.oAuthApp.update({
      where: { id: app.id },
      data: {
        clientSecret: newSecret,
      },
    });
  }

  createAuthorization(data: {
    oauthAppId: string;
    userId: string;
    organizationId: string;
    authorizationCode: string;
    codeExpiresAt: Date;
    redirectUri?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string | null;
    scope?: string;
  }) {
    return this._oauthAuth.model.oAuthAuthorization.upsert({
      where: {
        oauthAppId_userId_organizationId: {
          oauthAppId: data.oauthAppId,
          userId: data.userId,
          organizationId: data.organizationId,
        },
      },
      create: {
        oauthAppId: data.oauthAppId,
        userId: data.userId,
        organizationId: data.organizationId,
        authorizationCode: data.authorizationCode,
        codeExpiresAt: data.codeExpiresAt,
        redirectUri: data.redirectUri,
        codeChallenge: data.codeChallenge,
        codeChallengeMethod: data.codeChallengeMethod,
        scope: data.scope,
      },
      update: {
        authorizationCode: data.authorizationCode,
        codeExpiresAt: data.codeExpiresAt,
        redirectUri: data.redirectUri,
        codeChallenge: data.codeChallenge,
        codeChallengeMethod: data.codeChallengeMethod,
        scope: data.scope,
        accessToken: null,
        revokedAt: null,
      },
    });
  }

  findByCode(encryptedCode: string | string[]) {
    return this._oauthAuth.model.oAuthAuthorization.findFirst({
      where: {
        authorizationCode: Array.isArray(encryptedCode)
          ? { in: encryptedCode }
          : encryptedCode,
        revokedAt: null,
      },
    });
  }

  exchangeCodeForToken(
    id: string,
    encryptedToken: string,
    options?: {
      refreshToken?: string;
      tokenExpiresAt?: Date;
      refreshTokenExpiresAt?: Date;
      scope?: string;
    }
  ) {
    return this._oauthAuth.model.oAuthAuthorization.update({
      where: { id },
      select: {
        organizationId: true,
        organization: {
          select: {
            paymentId: true,
          }
        }
      },
      data: {
        accessToken: encryptedToken,
        authorizationCode: null,
        codeExpiresAt: null,
        ...(options?.refreshToken ? { refreshToken: options.refreshToken } : {}),
        ...(options?.tokenExpiresAt ? { tokenExpiresAt: options.tokenExpiresAt } : {}),
        ...(options?.refreshTokenExpiresAt ? { refreshTokenExpiresAt: options.refreshTokenExpiresAt } : {}),
        ...(options?.scope ? { scope: options.scope } : {}),
      },
    });
  }

  findByAccessToken(encryptedToken: string | string[]) {
    return this._oauthAuth.model.oAuthAuthorization.findFirst({
      where: {
        accessToken: Array.isArray(encryptedToken)
          ? { in: encryptedToken }
          : encryptedToken,
        revokedAt: null,
      },
      include: {
        organization: {
          include: {
            subscription: {
              select: {
                subscriptionTier: true,
                totalChannels: true,
                isLifetime: true,
              },
            },
          },
        },
        user: {
          select: { id: true },
        },
      },
    });
  }

  findByRefreshToken(encryptedRefreshToken: string | string[]) {
    return this._oauthAuth.model.oAuthAuthorization.findFirst({
      where: {
        refreshToken: Array.isArray(encryptedRefreshToken)
          ? { in: encryptedRefreshToken }
          : encryptedRefreshToken,
        revokedAt: null,
      },
    });
  }

  updateTokens(
    id: string,
    data: {
      accessToken: string;
      refreshToken: string;
      tokenExpiresAt: Date;
      refreshTokenExpiresAt: Date;
    },
  ) {
    return this._oauthAuth.model.oAuthAuthorization.update({
      where: { id },
      data: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        refreshTokenExpiresAt: data.refreshTokenExpiresAt,
      },
    });
  }

  getApprovedApps(userId: string) {
    return this._oauthAuth.model.oAuthAuthorization.findMany({
      where: {
        userId,
        revokedAt: null,
        accessToken: { not: null },
      },
      include: {
        oauthApp: {
          include: {
            picture: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  revokeAuthorization(userId: string, authId: string) {
    return this._oauthAuth.model.oAuthAuthorization.update({
      where: {
        id: authId,
        userId,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  revokeAllForApp(oauthAppId: string) {
    return this._oauthAuth.model.oAuthAuthorization.updateMany({
      where: {
        oauthAppId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}

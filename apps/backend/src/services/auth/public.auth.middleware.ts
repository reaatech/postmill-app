import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { ApiKeysService } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import * as crypto from 'crypto';

@Injectable()
export class PublicAuthMiddleware implements NestMiddleware {
  constructor(
    private _oauthService: OAuthService,
    private _apiKeysService: ApiKeysService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const auth = (req.headers.authorization ||
      req.headers.Authorization) as string;
    if (!auth) {
      res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'No API Key found' });
      return;
    }
    try {
      if (auth.startsWith('pos_')) {
        const authorization = await this._oauthService.getOrgByOAuthToken(auth);
        if (!authorization) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid OAuth token' });
          return;
        }

        const org = authorization.organization;
        if (!!process.env.STRIPE_SECRET_KEY && !org.subscription) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'No subscription found' });
          return;
        }

        // @ts-ignore
        req.org = { ...org, users: [{ users: { role: 'SUPERADMIN' } }] };
      } else {
        const hash = crypto.createHash('sha256').update(auth).digest('hex');
        const apiKey = await this._apiKeysService.findActiveByHash(hash);
        if (!apiKey) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid API key' });
          return;
        }

        if (!!process.env.STRIPE_SECRET_KEY && !apiKey.organization.subscription) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'No subscription found' });
          return;
        }

        const userOrg = apiKey.user.organizations?.find(
          (o) => o.organizationId === apiKey.organizationId,
        );
        const roleKey =
          userOrg?.roleRef?.key ??
          (apiKey.user.isSuperAdmin ? 'owner' : 'member');
        // @ts-ignore
        req.org = {
          ...apiKey.organization,
          users: [{ roleId: userOrg?.roleId ?? undefined, users: { role: roleKey } }],
        };
        // @ts-ignore
        req.user = apiKey.user;

        this._apiKeysService.touchLastUsed(apiKey.id).catch(() => {});
      }
    } catch (err) {
      throw new HttpForbiddenException();
    }
    next();
  }
}

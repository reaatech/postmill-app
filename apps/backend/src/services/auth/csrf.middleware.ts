import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Only enforce CSRF for unsafe methods
    if (!UNSAFE_METHODS.includes(req.method.toUpperCase())) {
      next();
      return;
    }

    // NOTE: do NOT exempt /copilot/ from CSRF. Doing so lets the CopilotKit
    // runtime actually execute, which currently throws an uncaught
    // "lambdaClient.send is not a function" and CRASHES the backend on every
    // page load. Keep copilot CSRF-gated (it 403s, in-app chat stays disabled)
    // until the CopilotKit runtime/dependency bug is fixed. See v3.5.5 fix list.

    // Determine auth source: only enforce when auth came from cookie
    const authFromCookie = !!req.cookies?.auth;
    const authFromHeader = !!req.headers?.auth;
    const hasBodyJwt = req.body?.jwt || req.body?.params;

    // Exempt: header/API-key auth, body-JWT (extension), or no auth
    if (!authFromCookie || authFromHeader || hasBodyJwt) {
      next();
      return;
    }

    // Validate CSRF token
    const csrfCookie = req.cookies?.[CSRF_COOKIE];
    const csrfHeader = req.headers?.[CSRF_HEADER] as string | undefined;

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      res.status(403).json({ error: 'Invalid or missing CSRF token' });
      return;
    }

    next();
  }
}

export function issueCsrfToken(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const token = require('crypto').randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    ...(!process.env.NOT_SECURED
      ? {
          secure: true,
          sameSite: 'none',
        }
      : {}),
    httpOnly: false, // must be readable by JavaScript
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
  });
  return token;
}

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

    // CopilotKit's runtime client manages its own transport and cannot attach
    // the double-submit CSRF header, so its POSTs were 403ing (breaking in-app
    // AI chat on every page). These routes remain auth- + policy- + budget-gated.
    if (req.path.includes('/copilot/')) {
      next();
      return;
    }

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

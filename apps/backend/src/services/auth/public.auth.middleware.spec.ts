import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';

vi.mock('@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service', () => ({
  OAuthService: class {},
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service', () => ({
  ApiKeysService: class {},
}));

vi.mock('@gitroom/nestjs-libraries/services/exception.filter', () => ({
  HttpForbiddenException: class HttpForbiddenException extends Error {
    constructor() {
      super('Forbidden');
    }
  },
}));

import { PublicAuthMiddleware } from './public.auth.middleware';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

function mockReq(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as any;
}

function makeApiKey(overrides: Record<string, any> = {}) {
  return {
    id: 'key-1',
    organizationId: 'org-1',
    organization: {
      id: 'org-1',
      name: 'Org One',
      subscription: { subscriptionTier: 'PRO', totalChannels: 10, isLifetime: false },
    },
    user: {
      id: 'user-1',
      email: 'user@example.com',
      isSuperAdmin: false,
      organizations: [{ organizationId: 'org-1', userId: 'user-1', role: 'ADMIN' }],
    },
    ...overrides,
  };
}

describe('PublicAuthMiddleware', () => {
  let oauthService: { getOrgByOAuthToken: ReturnType<typeof vi.fn> };
  let apiKeysService: {
    findActiveByHash: ReturnType<typeof vi.fn>;
    touchLastUsed: ReturnType<typeof vi.fn>;
  };
  let middleware: PublicAuthMiddleware;
  let next: ReturnType<typeof vi.fn>;
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    oauthService = { getOrgByOAuthToken: vi.fn() };
    apiKeysService = {
      findActiveByHash: vi.fn(),
      touchLastUsed: vi.fn().mockResolvedValue({ count: 1 }),
    };
    next = vi.fn();
    middleware = new PublicAuthMiddleware(
      oauthService as any,
      apiKeysService as any,
    );
  });

  afterEach(() => {
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeKey;
    }
  });

  it('returns 401 when no Authorization header is present', async () => {
    const req = mockReq();
    const res = mockRes();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalledWith({ msg: 'No API Key found' });
    expect(next).not.toHaveBeenCalled();
    expect(apiKeysService.findActiveByHash).not.toHaveBeenCalled();
  });

  it('returns 401 "Invalid API key" when findActiveByHash returns null (revoked/expired/unknown)', async () => {
    apiKeysService.findActiveByHash.mockResolvedValue(null);
    const req = mockReq('pm_live_revokedkey');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect(apiKeysService.findActiveByHash).toHaveBeenCalledWith(
      sha256('pm_live_revokedkey'),
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalledWith({ msg: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.org with the user\'s actual UserOrganization role and req.user on a valid key', async () => {
    const apiKey = makeApiKey({
      user: {
        id: 'user-1',
        isSuperAdmin: true, // must NOT win over the real membership role
        organizations: [{ organizationId: 'org-1', userId: 'user-1', role: 'ADMIN' }],
      },
    });
    apiKeysService.findActiveByHash.mockResolvedValue(apiKey);
    const req = mockReq('pm_live_goodkey');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).org.id).toBe('org-1');
    expect((req as any).org.users[0].users.role).toBe('ADMIN');
    expect((req as any).org.users[0].users.role).not.toBe('SUPERADMIN');
    expect((req as any).user).toBe(apiKey.user);
    expect(apiKeysService.touchLastUsed).toHaveBeenCalledWith('key-1');
  });

  it('uses the membership of the key\'s org, not another org the user belongs to', async () => {
    const apiKey = makeApiKey({
      user: {
        id: 'user-1',
        isSuperAdmin: false,
        organizations: [
          { organizationId: 'other-org', userId: 'user-1', role: 'SUPERADMIN' },
          { organizationId: 'org-1', userId: 'user-1', role: 'USER' },
        ],
      },
    });
    apiKeysService.findActiveByHash.mockResolvedValue(apiKey);
    const req = mockReq('pm_live_goodkey');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect((req as any).org.users[0].users.role).toBe('USER');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to SUPERADMIN when the user has no UserOrganization but isSuperAdmin', async () => {
    const apiKey = makeApiKey({
      user: { id: 'user-1', isSuperAdmin: true, organizations: [] },
    });
    apiKeysService.findActiveByHash.mockResolvedValue(apiKey);
    const req = mockReq('pm_live_goodkey');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect((req as any).org.users[0].users.role).toBe('SUPERADMIN');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to USER when the user has no UserOrganization and is not a super admin', async () => {
    const apiKey = makeApiKey({
      user: { id: 'user-1', isSuperAdmin: false, organizations: [] },
    });
    apiKeysService.findActiveByHash.mockResolvedValue(apiKey);
    const req = mockReq('pm_live_goodkey');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect((req as any).org.users[0].users.role).toBe('USER');
    expect(next).toHaveBeenCalled();
  });

  it('routes pos_ tokens through OAuthService and sets SUPERADMIN', async () => {
    oauthService.getOrgByOAuthToken.mockResolvedValue({
      organization: { id: 'org-1', subscription: { subscriptionTier: 'PRO' } },
    });
    const req = mockReq('pos_oauthtoken');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect(oauthService.getOrgByOAuthToken).toHaveBeenCalledWith('pos_oauthtoken');
    expect(apiKeysService.findActiveByHash).not.toHaveBeenCalled();
    expect((req as any).org.users[0].users.role).toBe('SUPERADMIN');
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 for an invalid pos_ token', async () => {
    oauthService.getOrgByOAuthToken.mockResolvedValue(null);
    const req = mockReq('pos_badtoken');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalledWith({ msg: 'Invalid OAuth token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 "No subscription found" when STRIPE_SECRET_KEY is set and the org has no subscription', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    const apiKey = makeApiKey({
      organization: { id: 'org-1', subscription: null },
    });
    apiKeysService.findActiveByHash.mockResolvedValue(apiKey);
    const req = mockReq('pm_live_goodkey');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalledWith({ msg: 'No subscription found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an org without subscription when STRIPE_SECRET_KEY is not set', async () => {
    const apiKey = makeApiKey({
      organization: { id: 'org-1', subscription: null },
    });
    apiKeysService.findActiveByHash.mockResolvedValue(apiKey);
    const req = mockReq('pm_live_goodkey');
    const res = mockRes();

    await middleware.use(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('wraps unexpected lookup errors in HttpForbiddenException', async () => {
    apiKeysService.findActiveByHash.mockRejectedValue(new Error('db down'));
    const req = mockReq('pm_live_goodkey');
    const res = mockRes();

    await expect(middleware.use(req, res, next)).rejects.toBeInstanceOf(
      HttpForbiddenException,
    );
    expect(next).not.toHaveBeenCalled();
  });
});

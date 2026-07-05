import { describe, it, expect, vi } from 'vitest';
import { OAuthRepository } from './oauth.repository';

/**
 * 2.1 — an expired-but-unrevoked pos_ token must not authenticate forever.
 * findByAccessToken must scope on both revokedAt AND tokenExpiresAt.
 *
 * NOTE (4.5): this is a DELIBERATE white-box spec — it asserts the exact Prisma
 * `where` shape (the `OR` branches + `revokedAt: null`). A semantically-equivalent
 * rewrite of the query would falsely fail here. That coupling is intentional for a
 * security-critical filter: the change-detector is the point (any edit to the
 * expiry/revocation predicate must be re-reviewed), so keep it white-box rather
 * than loosening it to a behavior-style matcher.
 */
describe('OAuthRepository.findByAccessToken', () => {
  const makeRepo = () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const oauthAuth = { model: { oAuthAuthorization: { findFirst } } } as any;
    const oauthApp = { model: { oAuthApp: {} } } as any;
    return { repo: new OAuthRepository(oauthApp, oauthAuth), findFirst };
  };

  it('rejects expired tokens (OR: null | tokenExpiresAt > now) and keeps revokedAt: null', () => {
    const { repo, findFirst } = makeRepo();
    repo.findByAccessToken('enc-token');

    const where = findFirst.mock.calls[0][0].where;
    expect(where.revokedAt).toBeNull();
    expect(Array.isArray(where.OR)).toBe(true);
    // one branch allows legacy null rows, the other requires a future expiry
    const hasNullBranch = where.OR.some(
      (b: any) => b.tokenExpiresAt === null
    );
    const hasFutureBranch = where.OR.some(
      (b: any) => b.tokenExpiresAt?.gt instanceof Date
    );
    expect(hasNullBranch).toBe(true);
    expect(hasFutureBranch).toBe(true);
  });
});

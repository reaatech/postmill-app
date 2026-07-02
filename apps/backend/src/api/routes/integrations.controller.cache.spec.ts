import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Organization } from '@prisma/client';

// Controllable ioRedis stub so we can assert the 60s integrations-list cache (ENHANCEMENTS_3 D4).
// `vi.hoisted` so the stub exists before the hoisted `vi.mock` factory references it.
const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: vi.fn(async (k: string) => {
      store.delete(k);
      return 1;
    }),
  };
});
vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: redis,
}));

// Mock the four constructor deps to trivial classes so importing the controller is cheap.
const getIntegrationsList = vi.fn();
vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class { getIntegrationsList = getIntegrationsList; } })
);
vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class {},
}));
vi.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);

import { IntegrationsController } from './integrations.controller';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';

const org = { id: 'org-1' } as Organization;

function makeController() {
  return new IntegrationsController(
    {} as any,
    new (IntegrationService as any)() as any,
    {} as any,
    {} as any,
    {} as any
  );
}

describe('IntegrationsController — integrations-list cache (D4)', () => {
  beforeEach(() => {
    redis.store.clear();
    vi.clearAllMocks();
    // Empty list keeps the per-integration map trivial; the cache behaviour is what we assert.
    getIntegrationsList.mockResolvedValue([]);
  });

  it('computes on first call and sets the cache key with a 60s TTL', async () => {
    const c = makeController();
    const res = await c.getIntegrationList(org);

    expect(res).toEqual({ integrations: [] });
    expect(getIntegrationsList).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'integrations:list:org-1',
      JSON.stringify({ integrations: [] }),
      'EX',
      60
    );
  });

  it('serves the second call from cache without recomputing', async () => {
    const c = makeController();
    await c.getIntegrationList(org); // populates cache
    getIntegrationsList.mockClear();

    const res = await c.getIntegrationList(org);
    expect(res).toEqual({ integrations: [] });
    expect(getIntegrationsList).not.toHaveBeenCalled(); // cache hit
  });

  it('a list-mutating handler invalidates the cached key', async () => {
    const c = makeController();
    await c.getIntegrationList(org);
    expect(redis.store.has('integrations:list:org-1')).toBe(true);

    await (c as any)._invalidateIntegrationsList('org-1');
    expect(redis.del).toHaveBeenCalledWith('integrations:list:org-1');
    expect(redis.store.has('integrations:list:org-1')).toBe(false);
  });
});

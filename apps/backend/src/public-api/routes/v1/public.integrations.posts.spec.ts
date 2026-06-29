import { describe, it, expect, vi } from 'vitest';

vi.mock('@sentry/nestjs', () => ({ metrics: { count: vi.fn() } }));
// neutralize the top-level CJS require of file-type
vi.mock('file-type', () => ({ fromBuffer: vi.fn() }));

import { PublicIntegrationsController } from './public.integrations.controller';

describe('PublicIntegrationsController.getPosts — J2 pagination cap', () => {
  const org = { id: 'org-1' } as any;

  const make = (count: number) => {
    const all = Array.from({ length: count }, (_, i) => ({ id: `p-${i}` }));
    const postsService = { getPosts: vi.fn().mockResolvedValue(all) };
    const ctrl = new (PublicIntegrationsController as any)(
      {}, // integrationService
      postsService,
      {}, // fileService
      {}, // notificationService
      {}, // integrationManager
      {}, // refreshIntegrationService
      {}, // analyticsService
      {}, // storageService
      {} // aiGeneration
    );
    return { ctrl, all };
  };

  const query = (extra: Record<string, any> = {}) =>
    ({ startDate: 'x', endDate: 'y', ...extra }) as any;

  it('caps the default response at max and returns a next cursor', async () => {
    const { ctrl } = make(250);
    const res = await ctrl.getPosts(org, query());
    expect(res.posts).toHaveLength(100);
    expect(res.cursor).toBe(100);
  });

  it('honours limit + cursor and nulls the cursor on the last page', async () => {
    const { ctrl, all } = make(250);
    const res = await ctrl.getPosts(org, query({ limit: 50, cursor: 200 }));
    expect(res.posts).toHaveLength(50);
    expect(res.posts[0].id).toBe(all[200].id);
    expect(res.cursor).toBeNull();
  });

  it('returns all posts (capped) with null cursor when under the cap', async () => {
    const { ctrl, all } = make(12);
    const res = await ctrl.getPosts(org, query());
    expect(res.posts).toEqual(all);
    expect(res.cursor).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { AnalyticsRepository } from './analytics.repository';

describe('AnalyticsRepository — campaign scope (1.1)', () => {
  // Two campaigns (A/B) share one integration (i1). Seeded post snapshots are
  // tagged with the campaign of the post they belong to; the mock findMany
  // applies the `post.campaignId.in` relation filter, so the assertion proves
  // only the requested campaign's rows come back even though the channel is
  // shared.
  const seed = [
    { id: 's1', integrationId: 'i1', metric: 'likes', value: 10, date: new Date('2024-01-01'), _campaignId: 'A' },
    { id: 's2', integrationId: 'i1', metric: 'likes', value: 20, date: new Date('2024-01-02'), _campaignId: 'A' },
    { id: 's3', integrationId: 'i1', metric: 'likes', value: 99, date: new Date('2024-01-01'), _campaignId: 'B' },
  ];

  const makeRepo = () => {
    const findMany = vi.fn(async (args: any) => {
      const wanted: string[] = args.where.post.campaignId.in;
      const intFilter: string[] | undefined = args.where.integrationId?.in;
      return seed
        .filter((r) => wanted.includes(r._campaignId))
        .filter((r) => (intFilter ? intFilter.includes(r.integrationId) : true))
        .map(({ _campaignId, ...row }) => row);
    });
    const repo = Object.create(AnalyticsRepository.prototype) as AnalyticsRepository;
    (repo as any)._postAnalyticsSnapshot = {
      model: { postAnalyticsSnapshot: { findMany } },
    };
    return { repo, findMany };
  };

  it('getPostSnapshotsByCampaigns returns only the requested campaign rows', async () => {
    const { repo, findMany } = makeRepo();

    const rows = await repo.getPostSnapshotsByCampaigns(
      'org1',
      ['A'],
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );

    // Only campaign A's rows, even though B shares integration i1.
    expect(rows.map((r: any) => r.id)).toEqual(['s1', 's2']);

    const where = findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org1');
    expect(where.post).toEqual({ campaignId: { in: ['A'] }, deletedAt: null });
    // No integration filter when omitted.
    expect(where.integrationId).toBeUndefined();
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ date: 'asc' });
  });

  it('getPostSnapshotsByCampaigns applies the optional integration filter', async () => {
    const { repo, findMany } = makeRepo();

    await repo.getPostSnapshotsByCampaigns(
      'org1',
      ['A', 'B'],
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      ['i1'],
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.integrationId).toEqual({ in: ['i1'] });
    expect(where.post).toEqual({ campaignId: { in: ['A', 'B'] }, deletedAt: null });
  });

  // R1.3 baselines are read via a raw DISTINCT ON query (Prisma client-side
  // `distinct` would ship every pre-window row from the DB — see the repo
  // comment). The spec asserts the raw path is used, its params ride through,
  // and the degenerate inputs short-circuit without touching the DB.
  const makeRawRepo = () => {
    const queryRaw = vi.fn(async () => [
      { postId: 'p1', metric: 'likes', value: 90 },
    ]);
    const repo = Object.create(AnalyticsRepository.prototype) as AnalyticsRepository;
    (repo as any)._prisma = { $queryRaw: queryRaw };
    return { repo, queryRaw };
  };

  it('getLatestPostSnapshotsBeforeByCampaigns runs DISTINCT ON in the DB and returns the rows (R1.3)', async () => {
    const { repo, queryRaw } = makeRawRepo();
    const before = new Date('2024-02-01');

    const rows = await repo.getLatestPostSnapshotsBeforeByCampaigns(
      'org1',
      ['A'],
      before,
      ['i1'],
    );

    expect(rows).toEqual([{ postId: 'p1', metric: 'likes', value: 90 }]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    // Tagged template: params ride as values (orgId, before, campaign ids,
    // integration ids); the SQL text carries DISTINCT ON + date DESC ordering.
    const [strings, ...values] = queryRaw.mock.calls[0] as any[];
    const sql = strings.join(' ');
    expect(sql).toContain('DISTINCT ON');
    expect(sql).toContain('"date" DESC');
    expect(values).toContainEqual('org1');
    expect(values).toContainEqual(before);
  });

  it('getLatestPostSnapshotsBeforeByCampaigns short-circuits on empty inputs (R1.3)', async () => {
    const { repo, queryRaw } = makeRawRepo();

    await expect(
      repo.getLatestPostSnapshotsBeforeByCampaigns('org1', [], new Date()),
    ).resolves.toEqual([]);
    await expect(
      repo.getLatestPostSnapshotsBeforeByCampaigns('org1', ['A'], new Date(), []),
    ).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('getPostsByCampaigns scopes by campaignId + org/date and includes integration', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = Object.create(AnalyticsRepository.prototype) as AnalyticsRepository;
    (repo as any)._post = { model: { post: { findMany } } };

    await repo.getPostsByCampaigns(
      'org1',
      ['A'],
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      0,
      20,
    );

    const args = findMany.mock.calls[0][0];
    expect(args.where.campaignId).toEqual({ in: ['A'] });
    expect(args.where.organizationId).toBe('org1');
    expect(args.where.deletedAt).toBeNull();
    expect(args.include).toEqual({ integration: true });
    expect(args.orderBy).toEqual({ publishDate: 'desc' });
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
  });

  it('countPostsByCampaigns scopes by campaignId', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const repo = Object.create(AnalyticsRepository.prototype) as AnalyticsRepository;
    (repo as any)._post = { model: { post: { count } } };

    const total = await repo.countPostsByCampaigns(
      'org1',
      ['A'],
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );

    expect(total).toBe(2);
    expect(count.mock.calls[0][0].where.campaignId).toEqual({ in: ['A'] });
  });
});

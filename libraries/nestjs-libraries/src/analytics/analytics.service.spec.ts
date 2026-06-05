import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from './analytics.service';
import { METRIC_REGISTRY, isKnownMetric } from '@gitroom/nestjs-libraries/integrations/social/analytics.metrics';
import { NotFoundException } from '@nestjs/common';
import dayjs from 'dayjs';

vi.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaService: class MockPrisma {
    analyticsSnapshot = { findMany: vi.fn(), count: vi.fn() };
    postAnalyticsSnapshot = { findMany: vi.fn() };
    integration = { findMany: vi.fn() };
    post = { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() };
    $transaction = vi.fn();
  },
}));

vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class MockManager {},
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: class MockService {
    checkAnalytics = vi.fn();
  },
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class MockService {
    checkPostAnalytics = vi.fn();
  },
}));

import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';

// Helper: create local-midnight dates to avoid timezone offset in dayjs formatting
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;
  let integrationService: IntegrationService;
  let postsService: PostsService;

  const mockOrg = { id: 'org1', name: 'Test Org' } as any;

  const mockIntegration = {
    id: 'i1', name: 'Test Channel', providerIdentifier: 'instagram',
    picture: 'https://example.com/pic.jpg', organizationId: 'org1',
    disabled: false, deletedAt: null, type: 'social', token: 'tok',
    createdAt: new Date(), updatedAt: null,
  };

  const mockIntegration2 = {
    id: 'i2', name: 'Test Channel 2', providerIdentifier: 'tiktok',
    picture: null, organizationId: 'org1',
    disabled: false, deletedAt: null, type: 'social', token: 'tok',
    createdAt: new Date(), updatedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = new PrismaService();
    const manager = {} as any;
    integrationService = new IntegrationService();
    postsService = new PostsService();
    service = new AnalyticsService(prisma, manager, integrationService, postsService);
  });

  // ============ EXISTING TESTS (kept exactly) ============

  describe('computePercentageChange', () => {
    it('returns null when previous is 0 and current is non-zero', () => {
      const result = (service as any).computePercentageChange(100, 0, 'count');
      expect(result).toBeNull();
    });

    it('returns 0 when both current and previous are 0', () => {
      const result = (service as any).computePercentageChange(0, 0, 'count');
      expect(result).toBe(0);
    });

    it('returns null when previous is null', () => {
      const result = (service as any).computePercentageChange(100, null, 'count');
      expect(result).toBeNull();
    });

    it('computes percentage change for count metrics', () => {
      const result = (service as any).computePercentageChange(150, 100, 'count');
      expect(result).toBe(50);
    });

    it('computes negative percentage change', () => {
      const result = (service as any).computePercentageChange(50, 100, 'count');
      expect(result).toBe(-50);
    });

    it('returns percentage-point delta for percent metrics', () => {
      const result = (service as any).computePercentageChange(65, 50, 'percent');
      expect(result).toBe(15);
    });

    it('returns negative pp delta for percent metrics', () => {
      const result = (service as any).computePercentageChange(30, 50, 'percent');
      expect(result).toBe(-20);
    });

    it('returns null when current positive and previous 0', () => {
      expect((service as any).computePercentageChange(50, 0, 'count')).toBeNull();
    });
  });

  describe('getMetricDef', () => {
    it('returns known metric definition', () => {
      const def = (service as any).getMetricDef('impressions');
      expect(def.label).toBe('Impressions');
      expect(def.format).toBe('count');
      expect(def.kind).toBe('flow');
    });

    it('returns default definition for unknown metric', () => {
      const def = (service as any).getMetricDef('unknown_metric');
      expect(def.label).toBe('unknown_metric');
      expect(def.format).toBe('count');
      expect(def.kind).toBe('flow');
    });
  });

  describe('aggregateSnapshots', () => {
    const snapshots = [
      { integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1) },
      { integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 2) },
      { integrationId: 'i2', metric: 'impressions', value: 300, date: d(2024, 1, 1) },
    ];

    it('sums flow metrics across all integrations and dates', () => {
      const result = (service as any).aggregateSnapshots(snapshots, 'impressions');
      expect(result).toBe(600);
    });

    it('takes latest value per integration for stock metrics', () => {
      const stockSnapshots = [
        { integrationId: 'i1', metric: 'followers', value: 1000, date: d(2024, 1, 1) },
        { integrationId: 'i1', metric: 'followers', value: 1100, date: d(2024, 1, 2) },
        { integrationId: 'i2', metric: 'followers', value: 500, date: d(2024, 1, 1) },
      ];
      const result = (service as any).aggregateSnapshots(stockSnapshots, 'followers');
      expect(result).toBe(1600);
    });

    it('returns 0 for empty snapshots', () => {
      expect((service as any).aggregateSnapshots([], 'impressions')).toBe(0);
    });

    it('averages percent-flow metrics', () => {
      const s = [
        { integrationId: 'i1', metric: 'avg_view_percentage', value: 50, date: d(2024, 1, 1) },
        { integrationId: 'i1', metric: 'avg_view_percentage', value: 70, date: d(2024, 1, 2) },
      ];
      expect((service as any).aggregateSnapshots(s, 'avg_view_percentage')).toBe(60);
    });

    it('sums latest per integration for stock-count metrics', () => {
      const s = [
        { integrationId: 'i1', metric: 'followers', value: 1000, date: d(2024, 1, 1) },
        { integrationId: 'i1', metric: 'followers', value: 2000, date: d(2024, 1, 2) },
        { integrationId: 'i2', metric: 'followers', value: 3000, date: d(2024, 1, 1) },
      ];
      expect((service as any).aggregateSnapshots(s, 'followers')).toBe(5000);
    });

    it('returns 0 when percent-stock (no data) returns 0', () => {
      expect((service as any).aggregateSnapshots([], 'followers')).toBe(0);
    });

    it('returns 0 when percent-flow has no data', () => {
      expect((service as any).aggregateSnapshots([], 'avg_view_percentage')).toBe(0);
    });
  });

  describe('getOverview (empty)', () => {
    it('returns empty overview when no integrations match', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([]);
      const result = await service.getOverview(mockOrg as any, '2024-01-01', '2024-01-07', ['i1'], false);
      expect(result.kpis).toHaveLength(0);
      expect(result.series).toEqual({});
      expect(result.byChannel).toHaveLength(0);
      expect(result.breakdown.byPlatform).toHaveLength(0);
    });
  });

  // ============ NEW PRIVATE METHOD TESTS ============

  describe('escapeCSVField', () => {
    it('returns normal string unchanged', () => {
      expect((service as any).escapeCSVField('hello')).toBe('hello');
    });
    it('quotes field containing comma', () => {
      expect((service as any).escapeCSVField('hello,world')).toBe('"hello,world"');
    });
    it('escapes double quotes', () => {
      expect((service as any).escapeCSVField('say "hi"')).toBe('"say ""hi"""');
    });
    it('quotes field containing newline', () => {
      expect((service as any).escapeCSVField('line1\nline2')).toBe('"line1\nline2"');
    });
    it('quotes field containing carriage return', () => {
      expect((service as any).escapeCSVField('line1\rline2')).toBe('"line1\rline2"');
    });
    it('converts number to string', () => {
      expect((service as any).escapeCSVField(42)).toBe('42');
    });
    it('handles empty string', () => {
      expect((service as any).escapeCSVField('')).toBe('');
    });
  });

  describe('checkCoverage', () => {
    const from = d(2024, 1, 1);
    const to = d(2024, 1, 3);

    it('returns 1.0 when all days have snapshots', async () => {
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([
        { date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) },
      ]);
      expect(await (service as any).checkCoverage('org1', ['i1'], from, to)).toBe(1);
    });

    it('returns partial coverage', async () => {
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([{ date: d(2024, 1, 1) }]);
      expect(await (service as any).checkCoverage('org1', ['i1'], from, to)).toBeCloseTo(1 / 3, 5);
    });

    it('returns 0 when no distinct dates', async () => {
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([]);
      expect(await (service as any).checkCoverage('org1', ['i1'], from, to)).toBe(0);
    });

    it('returns 0 when integrationIds empty', async () => {
      expect(await (service as any).checkCoverage('org1', [], from, to)).toBe(0);
    });

    it('returns 0 when from or to null', async () => {
      expect(await (service as any).checkCoverage('org1', ['i1'], null, to)).toBe(0);
    });

    it('returns 0 when totalDays <= 0', async () => {
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([]);
      const later = d(2024, 1, 5);
      const earlier = d(2024, 1, 1);
      expect(await (service as any).checkCoverage('org1', ['i1'], later, earlier)).toBe(0);
    });
  });

  describe('fetchLiveFallback', () => {
    const from = d(2024, 1, 1);
    const to = d(2024, 1, 3);

    it('returns data per integration', async () => {
      (integrationService.checkAnalytics as any).mockResolvedValue([{ label: 'Likes', data: [{ date: '2024-01-02', total: 100 }] }]);
      const result = await (service as any).fetchLiveFallback(mockOrg as any, ['i1'], from, to);
      expect(result).toEqual({ i1: [{ label: 'Likes', data: [{ date: '2024-01-02', total: 100 }] }] });
    });

    it('silently catches errors per integration', async () => {
      (integrationService.checkAnalytics as any).mockRejectedValue(new Error('fail'));
      expect(await (service as any).fetchLiveFallback(mockOrg as any, ['i1'], from, to)).toEqual({});
    });

    it('returns undefined for non-array data', async () => {
      (integrationService.checkAnalytics as any).mockResolvedValue({ not: 'array' });
      const result = await (service as any).fetchLiveFallback(mockOrg as any, ['i1'], from, to);
      expect(result).toEqual({ i1: undefined });
    });
  });

  describe('convertLiveToSnapshots', () => {
    const from = d(2024, 1, 1);
    const to = d(2024, 1, 3);
    const integrationMap = { i1: 'instagram' };

    it('converts live data to snapshot rows with normalized metric', () => {
      const pd = { i1: [{ label: 'Likes', data: [{ date: '2024-01-02', total: 100 }] }] };
      const rows = (service as any).convertLiveToSnapshots(pd, 'org1', integrationMap, from, to);
      expect(rows[0]).toMatchObject({ organizationId: 'org1', integrationId: 'i1', metric: 'likes', value: 100 });
    });

    it('falls back to lowercased label when not in metric map', () => {
      const pd = { i1: [{ label: 'Custom Metric', data: [{ date: '2024-01-02', total: 50 }] }] };
      expect((service as any).convertLiveToSnapshots(pd, 'org1', { i1: 'unknown' }, from, to)[0].metric).toBe('custom_metric');
    });

    it('filters data points outside date range', () => {
      const pd = { i1: [{ label: 'Likes', data: [{ date: '2023-12-31', total: 50 }, { date: '2024-01-02', total: 200 }] }] };
      expect((service as any).convertLiveToSnapshots(pd, 'org1', integrationMap, from, to)).toHaveLength(1);
    });

    it('handles null provider data', () => {
      expect((service as any).convertLiveToSnapshots({ i1: null }, 'org1', integrationMap, from, to)).toHaveLength(0);
    });

    it('handles missing providerIdentifier gracefully', () => {
      const pd = { i1: [{ label: 'Likes', data: [{ date: '2024-01-02', total: 100 }] }] };
      expect((service as any).convertLiveToSnapshots(pd, 'org1', {}, from, to)[0].metric).toBe('likes');
    });

    it('handles item with no data array', () => {
      const pd = { i1: [{ label: 'Likes' }] };
      expect((service as any).convertLiveToSnapshots(pd, 'org1', integrationMap, from, to)).toHaveLength(0);
    });
  });

  describe('buildFilledDayMap', () => {
    const snapshots = [
      { date: d(2024, 1, 1), metric: 'impressions', value: 100, integrationId: 'i1' },
      { date: d(2024, 1, 2), metric: 'impressions', value: 200, integrationId: 'i1' },
      { date: d(2024, 1, 1), metric: 'impressions', value: 50, integrationId: 'i2' },
    ];
    const from = d(2024, 1, 1);
    const to = d(2024, 1, 3);

    it('sums flow metrics across integrations, zero-fills missing', () => {
      expect((service as any).buildFilledDayMap(snapshots, 'impressions', from, to, 'flow', 0))
        .toEqual({ '2024-01-01': 150, '2024-01-02': 200, '2024-01-03': 0 });
    });

    it('carries forward last value per integration for stock metrics', () => {
      const ss = [
        { date: d(2024, 1, 1), metric: 'followers', value: 1000, integrationId: 'i1' },
        { date: d(2024, 1, 2), metric: 'followers', value: 1100, integrationId: 'i1' },
        { date: d(2024, 1, 1), metric: 'followers', value: 500, integrationId: 'i2' },
      ];
      expect((service as any).buildFilledDayMap(ss, 'followers', from, to, 'stock', 0))
        .toEqual({ '2024-01-01': 1500, '2024-01-02': 1600, '2024-01-03': 1600 });
    });

    it('applies dateOffset to output keys', () => {
      expect((service as any).buildFilledDayMap(snapshots, 'impressions', from, to, 'flow', 1))
        .toEqual({ '2024-01-02': 150, '2024-01-03': 200, '2024-01-04': 0 });
    });

    it('returns all zeros for empty flow snapshots', () => {
      expect((service as any).buildFilledDayMap([], 'impressions', from, to, 'flow', 0))
        .toEqual({ '2024-01-01': 0, '2024-01-02': 0, '2024-01-03': 0 });
    });

    it('returns all zeros for empty stock snapshots', () => {
      expect((service as any).buildFilledDayMap([], 'followers', from, to, 'stock', 0))
        .toEqual({ '2024-01-01': 0, '2024-01-02': 0, '2024-01-03': 0 });
    });

    it('carries forward from first appearance for stock', () => {
      const ss = [{ date: d(2024, 1, 2), metric: 'followers', value: 500, integrationId: 'i1' }];
      expect((service as any).buildFilledDayMap(ss, 'followers', from, to, 'stock', 0))
        .toEqual({ '2024-01-01': 0, '2024-01-02': 500, '2024-01-03': 500 });
    });

    it('filters by metric and skips unmatched rows', () => {
      const ss = [
        { date: d(2024, 1, 1), metric: 'likes', value: 999, integrationId: 'i1' },
        { date: d(2024, 1, 2), metric: 'impressions', value: 200, integrationId: 'i1' },
      ];
      expect((service as any).buildFilledDayMap(ss, 'impressions', from, to, 'flow', 0))
        .toEqual({ '2024-01-01': 0, '2024-01-02': 200, '2024-01-03': 0 });
    });
  });

  describe('buildSparkline', () => {
    it('returns {date,value} for each day in range', () => {
      const ss = [
        { date: d(2024, 1, 1), metric: 'impressions', value: 100, integrationId: 'i1' },
        { date: d(2024, 1, 2), metric: 'impressions', value: 200, integrationId: 'i1' },
      ];
      expect((service as any).buildSparkline(ss, 'impressions', d(2024, 1, 1), d(2024, 1, 3)))
        .toEqual([{ date: '2024-01-01', value: 100 }, { date: '2024-01-02', value: 200 }, { date: '2024-01-03', value: 0 }]);
    });

    it('returns zero-filled array when no snapshots match', () => {
      expect((service as any).buildSparkline([], 'impressions', d(2024, 1, 1), d(2024, 1, 2)))
        .toEqual([{ date: '2024-01-01', value: 0 }, { date: '2024-01-02', value: 0 }]);
    });
  });

  describe('buildSeries', () => {
    it('builds series for each known metric', () => {
      const ss = [
        { date: d(2024, 1, 1), metric: 'impressions', value: 100, integrationId: 'i1' },
        { date: d(2024, 1, 2), metric: 'impressions', value: 200, integrationId: 'i1' },
        { date: d(2024, 1, 1), metric: 'likes', value: 10, integrationId: 'i1' },
      ];
      const result = (service as any).buildSeries(ss, d(2024, 1, 1), d(2024, 1, 2));
      expect(result).toHaveProperty('impressions');
      expect(result).toHaveProperty('likes');
      expect(result.impressions).toHaveLength(2);
      expect(result.likes).toHaveLength(2);
    });

    it('returns empty object when no known metrics', () => {
      const ss = [{ date: d(2024, 1, 1), metric: 'bogus', value: 100, integrationId: 'i1' }];
      expect((service as any).buildSeries(ss, d(2024, 1, 1), d(2024, 1, 1))).toEqual({});
    });

    it('returns empty object for empty input', () => {
      expect((service as any).buildSeries([], d(2024, 1, 1), d(2024, 1, 1))).toEqual({});
    });
  });

  describe('buildPrevMap', () => {
    it('returns date-offset map for known metrics', () => {
      const ss = [
        { date: d(2023, 12, 25), metric: 'impressions', value: 100, integrationId: 'i1' },
        { date: d(2023, 12, 26), metric: 'impressions', value: 200, integrationId: 'i1' },
      ];
      const result = (service as any).buildPrevMap(ss, d(2023, 12, 25), d(2023, 12, 26), 7);
      expect(result.impressions['2024-01-01']).toBe(100);
      expect(result.impressions['2024-01-02']).toBe(200);
    });

    it('returns empty object for empty input', () => {
      expect((service as any).buildPrevMap([], d(2024, 1, 1), d(2024, 1, 1), 0)).toEqual({});
    });

    it('filters out unknown metrics', () => {
      const ss = [{ date: d(2024, 1, 1), metric: 'bogus', value: 100, integrationId: 'i1' }];
      expect((service as any).buildPrevMap(ss, d(2024, 1, 1), d(2024, 1, 1), 0)).toEqual({});
    });
  });

  // ============ PUBLIC METHOD FULL FLOW TESTS ============

  describe('getOverview (full flow)', () => {
    const from = '2024-01-01';
    const to = '2024-01-03';

    it('returns kpis/series/byChannel/breakdown with compare=false', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
          { id: 's3', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 300, date: d(2024, 1, 3), createdAt: new Date(), integration: {} as any },
        ]);
      const r = await service.getOverview(mockOrg as any, from, to, ['i1'], false);
      expect(r.kpis[0]).toMatchObject({ metric: 'impressions', total: 600, previousTotal: null, percentageChange: null });
      expect(r.byChannel[0].integrationId).toBe('i1');
      expect(r.breakdown.byPlatform[0]).toMatchObject({ identifier: 'instagram', value: 600 });
    });

    it('returns compare=true with previous snapshots', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 300, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
        ])
        .mockResolvedValueOnce([{ date: d(2023, 12, 29) }, { date: d(2023, 12, 30) }, { date: d(2023, 12, 31) }])
        .mockResolvedValueOnce([
          { id: 's3', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2023, 12, 30), createdAt: new Date(), integration: {} as any },
          { id: 's4', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 150, date: d(2023, 12, 31), createdAt: new Date(), integration: {} as any },
        ]);
      const r = await service.getOverview(mockOrg as any, from, to, ['i1'], true);
      expect(r.kpis[0].total).toBe(500);
      expect(r.kpis[0].previousTotal).toBe(250);
      expect(r.series.impressions[0].previousValue).toBeDefined();
    });

    it('uses live fallback when coverage < threshold', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockResolvedValue([{ label: 'Impressions', data: [{ date: '2024-01-02', total: 100 }] }]);
      const r = await service.getOverview(mockOrg as any, from, to, ['i1'], false);
      expect(r.kpis[0].metric).toBe('impressions');
    });

    it('handles live fallback error gracefully', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockRejectedValue(new Error('fail'));
      const r = await service.getOverview(mockOrg as any, from, to, ['i1'], false);
      expect(r.kpis).toHaveLength(0);
    });

    it('uses live fallback for prev window when compare=true', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ label: 'Impressions', data: [{ date: '2023-12-30', total: 100 }] }]);
      const r = await service.getOverview(mockOrg as any, from, to, ['i1'], true);
      expect(r.kpis[0].previousTotal).not.toBeNull();
    });

    it('handles prev window live fallback error (previousSnapshots is empty, aggregate gives 0)', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockRejectedValue(new Error('fail'));
      const r = await service.getOverview(mockOrg as any, from, to, ['i1'], true);
      expect(r.kpis[0].previousTotal).toBe(0);
      expect(r.kpis[0].total).toBe(200);
    });

    it('handles no known metrics gracefully', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'bogus', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }]);
      const r = await service.getOverview(mockOrg as any, from, to, ['i1'], false);
      expect(r.kpis).toHaveLength(0);
    });

    it('handles multiple integrations with multiple metrics', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration, mockIntegration2]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i2', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ]);
      const r = await service.getOverview(mockOrg as any, from, to, ['i1', 'i2'], false);
      expect(r.byChannel).toHaveLength(2);
      expect(r.breakdown.byPlatform).toHaveLength(2);
    });
  });

  describe('getChannel', () => {
    it('returns overview with channel info', async () => {
      (prisma.integration.findMany as any).mockResolvedValueOnce([mockIntegration]).mockResolvedValueOnce([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }]);
      const r = await service.getChannel(mockOrg as any, 'i1', '2024-01-01', '2024-01-02', false);
      expect(r.integrationId).toBe('i1');
      expect(r.name).toBe('Test Channel');
      expect(r.identifier).toBe('instagram');
      expect(r.picture).toBe('https://example.com/pic.jpg');
    });

    it('returns empty fields when no integrations found', async () => {
      (prisma.integration.findMany as any).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const r = await service.getChannel(mockOrg as any, 'i1', '2024-01-01', '2024-01-02', false);
      expect(r.name).toBe('');
      expect(r.identifier).toBe('');
      expect(r.picture).toBeNull();
    });

    it('returns null picture when integration has none', async () => {
      const intNoPic = { ...mockIntegration, picture: null };
      (prisma.integration.findMany as any).mockResolvedValueOnce([intNoPic]).mockResolvedValueOnce([intNoPic]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }])
        .mockResolvedValueOnce([]);
      expect((await service.getChannel(mockOrg as any, 'i1', '2024-01-01', '2024-01-02', false)).picture).toBeNull();
    });
  });

  describe('getPosts', () => {
    const from = '2024-01-01';
    const to = '2024-01-03';
    const mkPost = (id: string, intId = 'i1') => ({
      id, content: `Content ${id}`, publishDate: d(2024, 1, 2),
      organizationId: 'org1', integrationId: intId, deletedAt: null,
      integration: { id: intId, name: 'Channel', providerIdentifier: 'insta', picture: null },
    });

    it('returns paginated posts with default page/limit', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
      ]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p1')]);
      (prisma.post.count as any).mockResolvedValue(1);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1']);
      expect(r.posts).toHaveLength(1);
      expect(r.total).toBe(1);
    });

    it('sorts by known metric desc', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
        { postId: 'p2', metric: 'impressions', value: 300, date: d(2024, 1, 2) },
        { postId: 'p3', metric: 'impressions', value: 200, date: d(2024, 1, 2) },
      ]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p1'), mkPost('p2'), mkPost('p3')]);
      (prisma.post.count as any).mockResolvedValue(3);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1'], 'impressions', 'desc', 1, 25);
      expect(r.posts[0].postId).toBe('p2');
      expect(r.posts[1].postId).toBe('p3');
      expect(r.posts[2].postId).toBe('p1');
    });

    it('sorts by known metric asc', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
        { postId: 'p2', metric: 'impressions', value: 300, date: d(2024, 1, 2) },
      ]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p1'), mkPost('p2')]);
      (prisma.post.count as any).mockResolvedValue(2);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1'], 'impressions', 'asc', 1, 25);
      expect(r.posts[0].postId).toBe('p1');
      expect(r.posts[1].postId).toBe('p2');
    });

    it('uses skip/take when sort is unknown metric', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p3')]);
      (prisma.post.count as any).mockResolvedValue(3);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1'], 'bogus', undefined, 2, 1);
      expect(r.posts).toHaveLength(1);
      expect(r.posts[0].postId).toBe('p3');
    });

    it('returns empty when no posts', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.post.findMany as any).mockResolvedValue([]);
      (prisma.post.count as any).mockResolvedValue(0);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1']);
      expect(r.posts).toHaveLength(0);
      expect(r.total).toBe(0);
    });

    it('handles null content gracefully', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.post.findMany as any).mockResolvedValue([{ ...mkPost('p1'), content: null }]);
      (prisma.post.count as any).mockResolvedValue(1);
      expect((await service.getPosts(mockOrg as any, from, to, ['i1'])).posts[0].content).toBe('');
    });

    it('paginates sorted results with slice', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
        { postId: 'p2', metric: 'impressions', value: 200, date: d(2024, 1, 2) },
        { postId: 'p3', metric: 'impressions', value: 300, date: d(2024, 1, 2) },
      ]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p1'), mkPost('p2'), mkPost('p3')]);
      (prisma.post.count as any).mockResolvedValue(3);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1'], 'impressions', 'asc', 2, 2);
      expect(r.posts).toHaveLength(1);
      expect(r.posts[0].postId).toBe('p3');
    });

    it('returns empty sorted page when slice empty', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
      ]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p1')]);
      (prisma.post.count as any).mockResolvedValue(1);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1'], 'impressions', 'desc', 2, 25);
      expect(r.posts).toHaveLength(0);
    });

    it('handles empty integrations gracefully', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.post.findMany as any).mockResolvedValue([]);
      (prisma.post.count as any).mockResolvedValue(0);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1']);
      expect(r.posts).toHaveLength(0);
      expect(r.total).toBe(0);
    });

    it('defaults dir to desc when not provided with valid sort', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
        { postId: 'p2', metric: 'impressions', value: 300, date: d(2024, 1, 2) },
      ]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p1'), mkPost('p2')]);
      (prisma.post.count as any).mockResolvedValue(2);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1'], 'impressions');
      expect(r.posts[0].postId).toBe('p2');
    });

    it('supports custom page/limit without sort', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.post.findMany as any).mockResolvedValue([mkPost('p2')]);
      (prisma.post.count as any).mockResolvedValue(3);
      const r = await service.getPosts(mockOrg as any, from, to, ['i1'], undefined, undefined, 2, 1);
      expect(r.posts).toHaveLength(1);
      expect(r.posts[0].postId).toBe('p2');
    });
  });

  describe('getPostDetail', () => {
    const mkPostDetail = (del: Date | null = null, content = 'Hello world') => ({
      id: 'post1', content, publishDate: d(2024, 1, 2),
      integrationId: 'i1', organizationId: 'org1', deletedAt: del,
      integration: { id: 'i1', name: 'Test Channel', providerIdentifier: 'instagram', picture: null },
    });

    it('returns post with metrics grouped by metric', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'post1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
        { postId: 'post1', metric: 'impressions', value: 200, date: d(2024, 1, 3) },
        { postId: 'post1', metric: 'likes', value: 10, date: d(2024, 1, 2) },
      ]);
      const r = await service.getPostDetail(mockOrg as any, 'post1');
      expect(r.postId).toBe('post1');
      expect(r.metrics.impressions).toHaveLength(2);
      expect(r.metrics.likes).toHaveLength(1);
    });

    it('throws NotFoundException when post not found', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(null);
      await expect(service.getPostDetail(mockOrg as any, 'nope')).rejects.toThrow(NotFoundException);
    });

    it('returns empty metrics when no snapshots', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      expect((await service.getPostDetail(mockOrg as any, 'post1')).metrics).toEqual({});
    });

    it('returns integration info', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getPostDetail(mockOrg as any, 'post1');
      expect(r.integration.name).toBe('Test Channel');
      expect(r.integration.identifier).toBe('instagram');
    });

    it('returns snapshots directly without calling live fallback', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'post1', metric: 'impressions', value: 100, date: d(2024, 1, 2) },
      ]);
      const r = await service.getPostDetail(mockOrg as any, 'post1');
      expect(r.metrics.impressions).toHaveLength(1);
      expect(postsService.checkPostAnalytics).not.toHaveBeenCalled();
    });

    it('calls live fallback when snapshots empty and converts live data', async () => {
      const recentDate = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (postsService.checkPostAnalytics as any).mockResolvedValue([
        { label: 'Likes', data: [{ total: '50', date: recentDate }] },
      ]);
      const r = await service.getPostDetail(mockOrg as any, 'post1');
      expect(postsService.checkPostAnalytics).toHaveBeenCalledWith('org1', 'post1', 30);
      expect(r.metrics.likes).toBeDefined();
      expect(r.metrics.likes[0].value).toBe(50);
    });

    it('handles empty snapshots with failing live fallback gracefully', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (postsService.checkPostAnalytics as any).mockRejectedValue(new Error('API down'));
      const r = await service.getPostDetail(mockOrg as any, 'post1');
      expect(r.metrics).toEqual({});
    });

    it('handles live fallback returning missing gracefully', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (postsService.checkPostAnalytics as any).mockResolvedValue({ missing: true });
      const r = await service.getPostDetail(mockOrg as any, 'post1');
      expect(r.metrics).toEqual({});
    });

    it('handles live fallback returning non-array gracefully', async () => {
      (prisma.post.findFirst as any).mockResolvedValue(mkPostDetail());
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      (postsService.checkPostAnalytics as any).mockResolvedValue(undefined);
      const r = await service.getPostDetail(mockOrg as any, 'post1');
      expect(r.metrics).toEqual({});
    });
  });

  describe('getMetricDetail', () => {
    const from = '2024-01-01';
    const to = '2024-01-03';

    it('returns metric detail with compare=false', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], false);
      expect(r.metric).toBe('impressions');
      expect(r.total).toBe(300);
      expect(r.previousTotal).toBeNull();
      expect(r.series).toHaveLength(3);
      expect(r.movers).toEqual({ up: [], down: [] });
    });

    it('returns with compare=true and movers (up)', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ])
        .mockResolvedValueOnce([{ date: d(2023, 12, 29) }, { date: d(2023, 12, 30) }, { date: d(2023, 12, 31) }])
        .mockResolvedValueOnce([
          { id: 's3', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 50, date: d(2023, 12, 30), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], true);
      expect(r.previousTotal).not.toBeNull();
      expect(r.series[0]).toHaveProperty('previousValue');
      expect(r.movers.up).toHaveLength(1);
      expect(r.movers.down).toHaveLength(0);
    });

    it('populates movers.down with negative changes', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 50, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ])
        .mockResolvedValueOnce([{ date: d(2023, 12, 29) }, { date: d(2023, 12, 30) }, { date: d(2023, 12, 31) }])
        .mockResolvedValueOnce([
          { id: 's3', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2023, 12, 30), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], true);
      expect(r.movers.up).toHaveLength(0);
      expect(r.movers.down).toHaveLength(1);
    });

    it('throws NotFoundException for unknown metric', async () => {
      await expect(service.getMetricDetail(mockOrg as any, 'bogus', from, to, ['i1'], false)).rejects.toThrow(NotFoundException);
    });

    it('includes topPosts', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', value: 50, integrationId: 'i1', metric: 'impressions', post: { content: 'Top post', publishDate: d(2024, 1, 2) } },
      ]);
      expect((await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], false)).topPosts).toHaveLength(1);
    });

    it('uses live fallback when coverage < threshold', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockResolvedValue([{ label: 'Impressions', data: [{ date: '2024-01-02', total: 100 }] }]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      expect((await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], false)).total).toBe(100);
    });

    it('uses live fallback for prev window with compare=true', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ label: 'Impressions', data: [{ date: '2023-12-30', total: 100 }] }]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], true);
      expect(r.previousTotal).not.toBeNull();
    });

    it('handles empty topPosts gracefully', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      expect((await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], false)).topPosts).toEqual([]);
    });

    it('handles no integrations gracefully', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValueOnce([{ date: d(2024, 1, 1) }]).mockResolvedValueOnce([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      expect((await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], false)).byChannel).toHaveLength(0);
    });

    it('handles stock metric kind', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'followers', value: 1000, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i1', metric: 'followers', value: 1100, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      expect((await service.getMetricDetail(mockOrg as any, 'followers', from, to, ['i1'], false)).total).toBe(1100);
    });

    it('returns zero series when no snapshots for metric', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }])
        .mockResolvedValueOnce([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1'], false);
      expect(r.total).toBe(0);
      expect(r.series.every((s: any) => s.value === 0)).toBe(true);
    });

    it('handles multiple integrations in byChannel', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration, mockIntegration2]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i2', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getMetricDetail(mockOrg as any, 'impressions', from, to, ['i1', 'i2'], false);
      expect(r.byChannel).toHaveLength(2);
      expect(r.byChannel[0].share + r.byChannel[1].share).toBe(100);
    });
  });

  describe('getDayDetail', () => {
    it('returns byChannel and posts for known metric', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([
        { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
      ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', value: 50, integrationId: 'i1', metric: 'impressions', post: { content: 'Hello', publishDate: d(2024, 1, 2) } },
      ]);
      const r = await service.getDayDetail(mockOrg as any, '2024-01-02', 'impressions', ['i1']);
      expect(r.value).toBe(100);
      expect(r.byChannel).toHaveLength(1);
      expect(r.posts).toHaveLength(1);
    });

    it('throws NotFoundException for unknown metric', async () => {
      await expect(service.getDayDetail(mockOrg as any, '2024-01-02', 'bogus', ['i1'])).rejects.toThrow(NotFoundException);
    });

    it('returns zero values when no snapshots', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getDayDetail(mockOrg as any, '2024-01-02', 'impressions', ['i1']);
      expect(r.value).toBe(0);
      expect(r.byChannel[0].value).toBe(0);
      expect(r.posts).toHaveLength(0);
    });

    it('handles multiple integrations', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration, mockIntegration2]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([
        { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
        { id: 's2', organizationId: 'org1', integrationId: 'i2', metric: 'impressions', value: 200, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
      ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getDayDetail(mockOrg as any, '2024-01-02', 'impressions', ['i1', 'i2']);
      expect(r.value).toBe(300);
      expect(r.byChannel).toHaveLength(2);
    });

    it('includes integration info in posts', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', value: 50, integrationId: 'i1', metric: 'impressions', post: { content: 'Hello', publishDate: d(2024, 1, 2) } },
      ]);
      const r = await service.getDayDetail(mockOrg as any, '2024-01-02', 'impressions', ['i1']);
      expect(r.posts[0].integration?.name).toBe('Test Channel');
    });

    it('handles post with no matching integration', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValue([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', value: 50, integrationId: 'i1', metric: 'impressions', post: { content: 'Hello', publishDate: d(2024, 1, 2) } },
      ]);
      expect((await service.getDayDetail(mockOrg as any, '2024-01-02', 'impressions', ['i1'])).posts[0].integration).toBeNull();
    });
  });

  describe('getChannelMetric', () => {
    const from = '2024-01-01';
    const to = '2024-01-03';

    it('returns series with previousValue when compare=true', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ])
        .mockResolvedValueOnce([{ date: d(2023, 12, 29) }, { date: d(2023, 12, 30) }, { date: d(2023, 12, 31) }])
        .mockResolvedValueOnce([
          { id: 's3', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 50, date: d(2023, 12, 30), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, true);
      expect(r.series[0]).toHaveProperty('previousValue');
      expect(r.byDay).toHaveLength(1);
    });

    it('returns series without previousValue when compare=false', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, false);
      expect(r.series[0]).not.toHaveProperty('previousValue');
    });

    it('throws NotFoundException when integration not found', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([]);
      await expect(service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, false)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for unknown metric', async () => {
      await expect(service.getChannelMetric(mockOrg as any, 'i1', 'bogus', from, to, false)).rejects.toThrow(NotFoundException);
    });

    it('returns topPosts', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }])
        .mockResolvedValueOnce([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([
        { postId: 'p1', value: 50, integrationId: 'i1', metric: 'impressions', post: { content: 'Hello', publishDate: d(2024, 1, 2) } },
      ]);
      expect((await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, false)).topPosts).toHaveLength(1);
    });

    it('handles live fallback when coverage < threshold', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockResolvedValue([{ label: 'Impressions', data: [{ date: '2024-01-02', total: 100 }] }]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      expect((await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, false)).series[1].value).toBe(100);
    });

    it('handles live fallback error', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockRejectedValue(new Error('fail'));
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, false);
      expect(r.series.every((s: any) => s.value === 0)).toBe(true);
    });

    it('handles live fallback for prev window with compare=true', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ label: 'Impressions', data: [{ date: '2023-12-30', total: 100 }] }]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, true);
      expect(r.series[0].previousValue).toBe(0);
    });

    it('handles compare=true live fallback error', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([{ id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      (integrationService.checkAnalytics as any).mockRejectedValue(new Error('fail'));
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, true);
      expect(r.series[0]).toHaveProperty('previousValue');
    });

    it('returns empty series when no snapshots', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }, { date: d(2024, 1, 3) }])
        .mockResolvedValueOnce([]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, false);
      expect(r.series.every((s: any) => s.value === 0)).toBe(true);
      expect(r.byDay).toHaveLength(0);
    });

    it('returns byDay totals', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
        ]);
      (prisma.postAnalyticsSnapshot.findMany as any).mockResolvedValue([]);
      const r = await service.getChannelMetric(mockOrg as any, 'i1', 'impressions', from, to, false);
      expect(r.byDay).toHaveLength(2);
      expect(r.byDay[0]).toMatchObject({ date: '2024-01-01', value: 100 });
      expect(r.byDay[1]).toMatchObject({ date: '2024-01-02', value: 200 });
    });
  });

  describe('exportData', () => {
    it('returns CSV with header and rows', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
          { id: 's2', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 200, date: d(2024, 1, 2), createdAt: new Date(), integration: {} as any },
        ]);
      const r = await service.exportData(mockOrg as any, '2024-01-01', '2024-01-02', ['i1'], 'csv');
      expect(r.contentType).toBe('text/csv');
      expect(r.data).toContain('metric,label,format,total,percentage_change,date,value');
      expect(r.data).toContain('impressions');
    });

    it('returns JSON format', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ]);
      const r = await service.exportData(mockOrg as any, '2024-01-01', '2024-01-01', ['i1'], 'json');
      expect(r.contentType).toBe('application/json');
      const parsed = JSON.parse(r.data);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].metric).toBe('impressions');
    });

    it('exports with compare=true', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }, { date: d(2024, 1, 2) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ])
        .mockResolvedValueOnce([{ date: d(2023, 12, 31) }])
        .mockResolvedValueOnce([
          { id: 's2', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 50, date: d(2023, 12, 31), createdAt: new Date(), integration: {} as any },
        ]);
      const r = await service.exportData(mockOrg as any, '2024-01-01', '2024-01-02', ['i1'], 'json', true);
      const parsed = JSON.parse(r.data);
      expect(parsed).toHaveLength(2);
    });

    it('handles null percentageChange in CSV', async () => {
      (prisma.integration.findMany as any).mockResolvedValue([mockIntegration]);
      (prisma.analyticsSnapshot.findMany as any)
        .mockResolvedValueOnce([{ date: d(2024, 1, 1) }])
        .mockResolvedValueOnce([
          { id: 's1', organizationId: 'org1', integrationId: 'i1', metric: 'impressions', value: 100, date: d(2024, 1, 1), createdAt: new Date(), integration: {} as any },
        ]);
      const r = await service.exportData(mockOrg as any, '2024-01-01', '2024-01-01', ['i1'], 'csv');
      expect(r.data).toContain(',,');
    });
  });
});

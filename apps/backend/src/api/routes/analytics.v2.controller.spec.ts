import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

vi.mock('@gitroom/nestjs-libraries/analytics/analytics.service', () => ({
  AnalyticsService: class MockAnalyticsService {
    getOverview = vi.fn();
    getChannel = vi.fn();
    getPosts = vi.fn();
    getPostDetail = vi.fn();
    getMetricDetail = vi.fn();
    getDayDetail = vi.fn();
    getChannelMetric = vi.fn();
    exportData = vi.fn();
    getLinksForOrg = vi.fn();
    getAggregatedClicks = vi.fn();
  },
}));

import {
  AnalyticsV2Controller,
  parseIntegrations,
  parsePage,
  parseLimit,
  parseCompare,
  validateDateRange,
  validateToGteFrom,
} from './analytics.v2.controller';
import { AnalyticsService } from '@gitroom/nestjs-libraries/analytics/analytics.service';
import type {
  AnalyticsDateRangeDto,
  AnalyticsPostsQueryDto,
  AnalyticsExportQueryDto,
} from '@gitroom/nestjs-libraries/dtos/analytics/analytics.query.dto';

const mockOrg = { id: 'test-org-id', name: 'Test Org' } as any;

function mockResponse() {
  return { setHeader: vi.fn().mockReturnThis() };
}

function dq(overrides: Partial<AnalyticsDateRangeDto & AnalyticsPostsQueryDto & AnalyticsExportQueryDto> = {}): AnalyticsDateRangeDto & AnalyticsPostsQueryDto & AnalyticsExportQueryDto {
  return {
    from: '2024-01-01',
    to: '2024-01-07',
    integrations: undefined,
    compare: undefined,
    sort: undefined,
    dir: undefined,
    page: undefined,
    limit: undefined,
    format: undefined,
    ...overrides,
  };
}

describe('AnalyticsV2Controller', () => {
  let controller: AnalyticsV2Controller;
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (AnalyticsService as any)();
    const watchlistService = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as any;
    controller = new AnalyticsV2Controller(
      service as unknown as AnalyticsService,
      watchlistService,
    );
  });

  it('getOverview delegates and parses integrations param', async () => {
    const mockResult: Record<string, any> = { kpis: [] };
    (service.getOverview as any).mockResolvedValue(mockResult);

    const result = await controller.getOverview(mockOrg, dq({ integrations: 'i1,i2', compare: 'true' }));

    expect(service.getOverview).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', ['i1', 'i2'], true);
    expect(result).toBe(mockResult);
  });

  it('getOverview passes empty array when integrations param missing', async () => {
    (service.getOverview as any).mockResolvedValue({ kpis: [] });

    await controller.getOverview(mockOrg, dq({ integrations: undefined, compare: undefined }));

    expect(service.getOverview).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], false);
  });

  it('getChannel delegates correctly', async () => {
    (service.getChannel as any).mockResolvedValue({ kpis: [] });

    await controller.getChannel(mockOrg, 'ch1', dq({ compare: 'true' }));

    expect(service.getChannel).toHaveBeenCalledWith(mockOrg, 'ch1', '2024-01-01', '2024-01-07', true);
  });

  it('getPosts delegates with default pagination', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, dq({ sort: 'impressions', dir: 'desc', page: undefined, limit: undefined }));

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], 'impressions', 'desc', 1, 20);
  });

  it('getMetric delegates correctly', async () => {
    (service.getMetricDetail as any).mockResolvedValue({ metric: 'impressions' });

    await controller.getMetric(mockOrg, 'impressions', dq({ integrations: 'i1,i2', compare: 'false' }));

    expect(service.getMetricDetail).toHaveBeenCalledWith(mockOrg, 'impressions', '2024-01-01', '2024-01-07', ['i1', 'i2'], false);
  });

  it('getDay delegates correctly', async () => {
    (service.getDayDetail as any).mockResolvedValue({ metric: 'impressions' });

    await controller.getDay(mockOrg, '2024-01-01', 'impressions', 'i1');

    expect(service.getDayDetail).toHaveBeenCalledWith(mockOrg, '2024-01-01', 'impressions', ['i1']);
  });

  it('getChannelMetric delegates correctly', async () => {
    (service.getChannelMetric as any).mockResolvedValue({ series: [] });

    await controller.getChannelMetric(mockOrg, 'ch1', 'impressions', dq({ compare: 'true' }));

    expect(service.getChannelMetric).toHaveBeenCalledWith(mockOrg, 'ch1', 'impressions', '2024-01-01', '2024-01-07', true);
  });

  it('getPostDetail delegates correctly', async () => {
    (service.getPostDetail as any).mockResolvedValue({ postId: 'p1' });

    const result = await controller.getPostDetail(mockOrg, 'p1');

    expect(service.getPostDetail).toHaveBeenCalledWith(mockOrg, 'p1', undefined);
    expect(result).toEqual({ postId: 'p1' });
  });

  it('getPostDetail passes date param', async () => {
    (service.getPostDetail as any).mockResolvedValue({ postId: 'p1' });

    await controller.getPostDetail(mockOrg, 'p1', '7');

    expect(service.getPostDetail).toHaveBeenCalledWith(mockOrg, 'p1', '7');
  });

  it('getOverview throws when from is missing', async () => {
    await expect(
      controller.getOverview(mockOrg, dq({ from: '' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview throws when to is missing', async () => {
    await expect(
      controller.getOverview(mockOrg, dq({ to: '' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview throws when from is an invalid date', async () => {
    await expect(
      controller.getOverview(mockOrg, dq({ from: 'not-a-date' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview throws when to is an invalid date', async () => {
    await expect(
      controller.getOverview(mockOrg, dq({ to: 'bad-date' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview parses empty integrations string as empty array', async () => {
    (service.getOverview as any).mockResolvedValue({ kpis: [] });

    await controller.getOverview(mockOrg, dq({ integrations: '' }));

    expect(service.getOverview).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], false);
  });

  it('getPosts uses defaults when no sort/dir/page/limit provided', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, dq({ sort: undefined, dir: undefined, page: undefined, limit: undefined }));

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], undefined, 'desc', 1, 20);
  });

  it('getPosts passes dir=asc when provided', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, dq({ sort: undefined, dir: 'asc', page: undefined, limit: undefined }));

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], undefined, 'asc', 1, 20);
  });

  it('getPosts delegates with explicit page and limit', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, dq({ integrations: 'i1', sort: 'impressions', dir: 'desc', page: 3, limit: 10 }));

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', ['i1'], 'impressions', 'desc', 3, 10);
  });

  it('exportData with csv format sets correct headers and returns data', async () => {
    const res = mockResponse();
    const csvData = 'col1,col2\nv1,v2';
    (service.exportData as any).mockResolvedValue({ contentType: 'text/csv', data: csvData });

    const result = await controller.exportData(mockOrg, dq({ format: 'csv' }), res as any);

    expect(service.exportData).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], 'csv', false);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="analytics-export.csv"');
    expect(result).toBe(csvData);
  });

  it('exportData with json format sets correct headers and returns data', async () => {
    const res = mockResponse();
    const jsonData = { key: 'value' };
    (service.exportData as any).mockResolvedValue({ contentType: 'application/json', data: jsonData });

    const result = await controller.exportData(mockOrg, dq({ format: 'json' }), res as any);

    expect(service.exportData).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], 'json', false);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="analytics-export.json"');
    expect(result).toBe(jsonData);
  });

  it('exportData throws when format is invalid', async () => {
    const res = mockResponse();

    await expect(
      controller.exportData(mockOrg, dq({ format: 'pdf' }), res as any)
    ).rejects.toThrow(BadRequestException);
  });

  it('exportData throws when from is missing', async () => {
    const res = mockResponse();

    await expect(
      controller.exportData(mockOrg, dq({ from: '', format: 'json' }), res as any)
    ).rejects.toThrow(BadRequestException);
  });

  it('getChannel throws when from is missing', async () => {
    await expect(
      controller.getChannel(mockOrg, 'ch1', dq({ from: '' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('getMetricDetail throws when from is missing', async () => {
    await expect(
      controller.getMetric(mockOrg, 'impressions', dq({ from: '' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('getChannelMetric throws when from is missing', async () => {
    await expect(
      controller.getChannelMetric(mockOrg, 'ch1', 'impressions', dq({ from: '' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('getPosts throws when from is missing', async () => {
    await expect(
      controller.getPosts(mockOrg, dq({ from: '' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('validateToGteFrom rejects to before from', async () => {
    await expect(
      controller.getOverview(mockOrg, dq({ from: '2024-01-07', to: '2024-01-01' }))
    ).rejects.toThrow(BadRequestException);
  });

  it('validateToGteFrom accepts to equal from', async () => {
    (service.getOverview as any).mockResolvedValue({ kpis: [] });
    await controller.getOverview(mockOrg, dq({ from: '2024-01-01', to: '2024-01-01' }));
    expect(service.getOverview).toHaveBeenCalled();
  });

  it('getPosts caps limit at 100', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });
    await controller.getPosts(mockOrg, dq({ limit: 999 }));
    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], undefined, 'desc', 1, 100);
  });

  describe('getShortLinks', () => {
    it('returns enriched links with click counts (routed through analytics service)', async () => {
      (service.getLinksForOrg as any).mockResolvedValue([
        { id: 'l1', shortUrl: 'https://sh.rt/a', originalUrl: 'https://example.com/a', provider: 'bitly', createdAt: new Date('2024-01-01') },
        { id: 'l2', shortUrl: 'https://sh.rt/b', originalUrl: 'https://example.com/b', provider: 'bitly', createdAt: new Date('2024-01-02') },
      ]);
      (service.getAggregatedClicks as any).mockResolvedValue([
        { shortLinkId: 'l1', clicks: 42, date: new Date('2024-01-03T12:00:00.000Z'), shortLink: { id: 'l1' } },
        { shortLinkId: 'l1', clicks: 8, date: new Date('2024-01-04T12:00:00.000Z'), shortLink: { id: 'l1' } },
        { shortLinkId: 'l2', clicks: 7, date: new Date('2024-01-05T12:00:00.000Z'), shortLink: { id: 'l2' } },
      ]);

      const result = await controller.getShortLinks(mockOrg, '2024-01-01', '2024-01-07');

      expect(service.getLinksForOrg).toHaveBeenCalledWith('test-org-id');
      expect(service.getAggregatedClicks).toHaveBeenCalledWith('test-org-id', expect.any(Date), expect.any(Date));
      expect(result).toHaveLength(2);
      expect(result[0].clicks).toBe(50);
      expect(result[1].clicks).toBe(7);
    });

    it('returns zero clicks for links with no snapshots', async () => {
      (service.getLinksForOrg as any).mockResolvedValue([
        { id: 'l1', shortUrl: 'https://sh.rt/a', originalUrl: 'https://example.com/a', provider: 'bitly', createdAt: new Date() },
      ]);
      (service.getAggregatedClicks as any).mockResolvedValue([]);

      const result = await controller.getShortLinks(mockOrg);

      expect(result[0].clicks).toBe(0);
    });
  });

  describe('getShortLinkTimeseries', () => {
    it('returns daily click timeseries (routed through analytics service)', async () => {
      (service.getAggregatedClicks as any).mockResolvedValue([
        { date: new Date('2024-01-01T12:00:00.000Z'), clicks: 10, shortLink: { id: 'l1' } },
        { date: new Date('2024-01-01T12:00:00.000Z'), clicks: 5, shortLink: { id: 'l2' } },
        { date: new Date('2024-01-02T12:00:00.000Z'), clicks: 15, shortLink: { id: 'l1' } },
      ]);

      const result = await controller.getShortLinkTimeseries(mockOrg, '2024-01-01', '2024-01-07');

      expect(service.getAggregatedClicks).toHaveBeenCalledWith('test-org-id', expect.any(Date), expect.any(Date));
      expect(result).toEqual([
        { date: '2024-01-01', clicks: 15 },
        { date: '2024-01-02', clicks: 15 },
      ]);
    });

    it('returns empty array when no snapshots exist', async () => {
      (service.getAggregatedClicks as any).mockResolvedValue([]);

      const result = await controller.getShortLinkTimeseries(mockOrg);

      expect(result).toEqual([]);
    });
  });
});

describe('parseIntegrations', () => {
  it('returns empty array when undefined', () => {
    expect(parseIntegrations(undefined)).toEqual([]);
  });

  it('returns empty array when empty string', () => {
    expect(parseIntegrations('')).toEqual([]);
  });

  it('splits comma-separated string', () => {
    expect(parseIntegrations('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('filters out empty entries', () => {
    expect(parseIntegrations('a,,b')).toEqual(['a', 'b']);
  });
});

describe('parsePage', () => {
  it('returns 1 when undefined', () => {
    expect(parsePage(undefined)).toBe(1);
  });

  it('returns 1 when 0', () => {
    // DTO validation with @Min(1) catches this before parsePage
    expect(parsePage(undefined)).toBe(1);
  });
});

describe('parseLimit', () => {
  it('returns 20 when undefined', () => {
    expect(parseLimit(undefined)).toBe(20);
  });

  it('caps at 100', () => {
    expect(parseLimit(200)).toBe(100);
  });

  it('returns value when within bounds', () => {
    expect(parseLimit(50)).toBe(50);
  });

  it('accepts 1', () => {
    expect(parseLimit(1)).toBe(1);
  });
});

describe('parseCompare', () => {
  it('returns false when undefined', () => {
    expect(parseCompare(undefined)).toBe(false);
  });

  it('returns true for "true"', () => {
    expect(parseCompare('true')).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(parseCompare('false')).toBe(false);
  });
});

describe('validateDateRange', () => {
  it('throws when from is empty', () => {
    expect(() => validateDateRange('', '2024-01-07')).toThrow(BadRequestException);
  });

  it('throws when to is empty', () => {
    expect(() => validateDateRange('2024-01-01', '')).toThrow(BadRequestException);
  });

  it('throws when from is not a valid date', () => {
    expect(() => validateDateRange('not-a-date', '2024-01-07')).toThrow(BadRequestException);
  });

  it('throws when to is not a valid date', () => {
    expect(() => validateDateRange('2024-01-01', 'bad-date')).toThrow(BadRequestException);
  });
});

describe('validateToGteFrom', () => {
  it('throws when to is before from', () => {
    expect(() => validateToGteFrom('2024-01-07', '2024-01-01')).toThrow(BadRequestException);
  });

  it('passes when to equals from', () => {
    expect(() => validateToGteFrom('2024-01-01', '2024-01-01')).not.toThrow();
  });

  it('passes when to is after from', () => {
    expect(() => validateToGteFrom('2024-01-01', '2024-01-07')).not.toThrow();
  });
});

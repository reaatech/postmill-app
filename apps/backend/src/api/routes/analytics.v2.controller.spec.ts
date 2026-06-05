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
  },
}));

import {
  AnalyticsV2Controller,
  parseIntegrations,
  parsePage,
  parseLimit,
  parseCompare,
  parseFormat,
  validateDateRange,
} from './analytics.v2.controller';
import { AnalyticsService } from '@gitroom/nestjs-libraries/analytics/analytics.service';

const mockOrg = { id: 'test-org-id', name: 'Test Org' } as any;

function mockResponse() {
  return { setHeader: vi.fn().mockReturnThis() };
}

describe('AnalyticsV2Controller', () => {
  let controller: AnalyticsV2Controller;
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new (AnalyticsService as any)();
    controller = new AnalyticsV2Controller(service as unknown as AnalyticsService);
  });

  it('getOverview delegates and parses integrations param', async () => {
    const mockResult: Record<string, any> = { kpis: [] };
    (service.getOverview as any).mockResolvedValue(mockResult);

    const result = await controller.getOverview(mockOrg, '2024-01-01', '2024-01-07', 'i1,i2', 'true');

    expect(service.getOverview).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', ['i1', 'i2'], true);
    expect(result).toBe(mockResult);
  });

  it('getOverview passes empty array when integrations param missing', async () => {
    (service.getOverview as any).mockResolvedValue({ kpis: [] });

    await controller.getOverview(mockOrg, '2024-01-01', '2024-01-07', undefined, undefined);

    expect(service.getOverview).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], false);
  });

  it('getChannel delegates correctly', async () => {
    (service.getChannel as any).mockResolvedValue({ kpis: [] });

    await controller.getChannel(mockOrg, 'ch1', '2024-01-01', '2024-01-07', 'true');

    expect(service.getChannel).toHaveBeenCalledWith(mockOrg, 'ch1', '2024-01-01', '2024-01-07', true);
  });

  it('getPosts delegates with default pagination', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, '2024-01-01', '2024-01-07', 'i1', 'impressions', 'desc', undefined, undefined);

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', ['i1'], 'impressions', 'desc', 1, 25);
  });

  it('getMetric delegates correctly', async () => {
    (service.getMetricDetail as any).mockResolvedValue({ metric: 'impressions' });

    await controller.getMetric(mockOrg, 'impressions', '2024-01-01', '2024-01-07', 'i1,i2', 'false');

    expect(service.getMetricDetail).toHaveBeenCalledWith(mockOrg, 'impressions', '2024-01-01', '2024-01-07', ['i1', 'i2'], false);
  });

  it('getDay delegates correctly', async () => {
    (service.getDayDetail as any).mockResolvedValue({ metric: 'impressions' });

    await controller.getDay(mockOrg, '2024-01-01', 'impressions', 'i1');

    expect(service.getDayDetail).toHaveBeenCalledWith(mockOrg, '2024-01-01', 'impressions', ['i1']);
  });

  it('getChannelMetric delegates correctly', async () => {
    (service.getChannelMetric as any).mockResolvedValue({ series: [] });

    await controller.getChannelMetric(mockOrg, 'ch1', 'impressions', '2024-01-01', '2024-01-07', 'true');

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
      controller.getOverview(mockOrg, '', '2024-01-07', undefined, undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview throws when to is missing', async () => {
    await expect(
      controller.getOverview(mockOrg, '2024-01-01', '', undefined, undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview throws when from is an invalid date', async () => {
    await expect(
      controller.getOverview(mockOrg, 'not-a-date', '2024-01-07', undefined, undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview throws when to is an invalid date', async () => {
    await expect(
      controller.getOverview(mockOrg, '2024-01-01', 'bad-date', undefined, undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('getOverview parses empty integrations string as empty array', async () => {
    (service.getOverview as any).mockResolvedValue({ kpis: [] });

    await controller.getOverview(mockOrg, '2024-01-01', '2024-01-07', '', undefined);

    expect(service.getOverview).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], false);
  });

  it('getPosts uses defaults when no sort/dir/page/limit provided', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, '2024-01-01', '2024-01-07', undefined, undefined, undefined, undefined, undefined);

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], undefined, 'desc', 1, 25);
  });

  it('getPosts passes dir=asc when provided', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, '2024-01-01', '2024-01-07', undefined, undefined, 'asc', undefined, undefined);

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], undefined, 'asc', 1, 25);
  });

  it('getPosts delegates with explicit page and limit', async () => {
    (service.getPosts as any).mockResolvedValue({ posts: [], total: 0 });

    await controller.getPosts(mockOrg, '2024-01-01', '2024-01-07', 'i1', 'impressions', 'desc', '3', '10');

    expect(service.getPosts).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', ['i1'], 'impressions', 'desc', 3, 10);
  });

  it('exportData with csv format sets correct headers and returns data', async () => {
    const res = mockResponse();
    const csvData = 'col1,col2\nv1,v2';
    (service.exportData as any).mockResolvedValue({ contentType: 'text/csv', data: csvData });

    const result = await controller.exportData(mockOrg, '2024-01-01', '2024-01-07', undefined, 'csv', undefined, res as any);

    expect(service.exportData).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], 'csv', false);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="analytics-export.csv"');
    expect(result).toBe(csvData);
  });

  it('exportData with json format sets correct headers and returns data', async () => {
    const res = mockResponse();
    const jsonData = { key: 'value' };
    (service.exportData as any).mockResolvedValue({ contentType: 'application/json', data: jsonData });

    const result = await controller.exportData(mockOrg, '2024-01-01', '2024-01-07', undefined, 'json', undefined, res as any);

    expect(service.exportData).toHaveBeenCalledWith(mockOrg, '2024-01-01', '2024-01-07', [], 'json', false);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="analytics-export.json"');
    expect(result).toBe(jsonData);
  });

  it('exportData throws when format is invalid', async () => {
    const res = mockResponse();

    await expect(
      controller.exportData(mockOrg, '2024-01-01', '2024-01-07', undefined, 'pdf', undefined, res as any)
    ).rejects.toThrow(BadRequestException);
  });

  it('exportData throws when from is missing', async () => {
    const res = mockResponse();

    await expect(
      controller.exportData(mockOrg, '', '2024-01-07', undefined, 'json', undefined, res as any)
    ).rejects.toThrow(BadRequestException);
  });

  it('getChannel throws when from is missing', async () => {
    await expect(
      controller.getChannel(mockOrg, 'ch1', '', '2024-01-07', undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('getMetricDetail throws when from is missing', async () => {
    await expect(
      controller.getMetric(mockOrg, 'impressions', '', '2024-01-07', undefined, undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('getChannelMetric throws when from is missing', async () => {
    await expect(
      controller.getChannelMetric(mockOrg, 'ch1', 'impressions', '', '2024-01-07', undefined)
    ).rejects.toThrow(BadRequestException);
  });

  it('getPosts throws when from is missing', async () => {
    await expect(
      controller.getPosts(mockOrg, '', '2024-01-07', undefined, undefined, undefined, undefined, undefined)
    ).rejects.toThrow(BadRequestException);
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

  it('parses valid number string', () => {
    expect(parsePage('5')).toBe(5);
  });

  it('returns 1 when zero', () => {
    expect(parsePage('0')).toBe(1);
  });

  it('returns 1 when negative', () => {
    expect(parsePage('-1')).toBe(1);
  });

  it('returns 1 when NaN', () => {
    expect(parsePage('abc')).toBe(1);
  });
});

describe('parseLimit', () => {
  it('returns 25 when undefined', () => {
    expect(parseLimit(undefined)).toBe(25);
  });

  it('parses valid number string', () => {
    expect(parseLimit('50')).toBe(50);
  });

  it('returns 25 when zero', () => {
    expect(parseLimit('0')).toBe(25);
  });

  it('returns 25 when negative', () => {
    expect(parseLimit('-1')).toBe(25);
  });

  it('returns 25 when NaN', () => {
    expect(parseLimit('abc')).toBe(25);
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

describe('parseFormat', () => {
  it('returns "json" when undefined', () => {
    expect(parseFormat(undefined)).toBe('json');
  });

  it('returns "json" when format is "json"', () => {
    expect(parseFormat('json')).toBe('json');
  });

  it('returns "csv" when format is "csv"', () => {
    expect(parseFormat('csv')).toBe('csv');
  });

  it('throws BadRequestException when format is invalid', () => {
    expect(() => parseFormat('invalid')).toThrow(BadRequestException);
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

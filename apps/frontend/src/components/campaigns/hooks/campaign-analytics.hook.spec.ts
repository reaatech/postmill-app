import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';

const mockFetch = vi.fn();
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));

import {
  useCampaignAnalytics,
  resolveCampaignAnalyticsRange,
  CAMPAIGN_SNAPSHOT_WINDOW_DAYS,
} from './campaign.hooks';

describe('resolveCampaignAnalyticsRange', () => {
  const today = dayjs().format('YYYY-MM-DD');

  it('ongoing campaign (no endDate) → last 30 days', () => {
    const { from, to } = resolveCampaignAnalyticsRange('2020-01-01', null);
    expect(to).toBe(today);
    expect(from).toBe(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  });

  it('clamps a start earlier than the 90-day snapshot window to the floor', () => {
    const { from } = resolveCampaignAnalyticsRange('2000-01-01', dayjs().add(5, 'day').format('YYYY-MM-DD'));
    expect(from).toBe(dayjs().subtract(CAMPAIGN_SNAPSHOT_WINDOW_DAYS, 'day').format('YYYY-MM-DD'));
  });

  it('clamps an end in the future down to today', () => {
    const { to } = resolveCampaignAnalyticsRange(
      dayjs().subtract(10, 'day').format('YYYY-MM-DD'),
      dayjs().add(30, 'day').format('YYYY-MM-DD')
    );
    expect(to).toBe(today);
  });

  it('keeps an in-window start/end unchanged', () => {
    const start = dayjs().subtract(20, 'day').format('YYYY-MM-DD');
    const end = dayjs().subtract(2, 'day').format('YYYY-MM-DD');
    const { from, to } = resolveCampaignAnalyticsRange(start, end);
    expect(from).toBe(start);
    expect(to).toBe(end);
  });
});

describe('useCampaignAnalytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the campaign analytics endpoint with from/to and returns the data', async () => {
    const payload = { range: { from: '2024-01-01', to: '2024-01-07' }, kpis: [], series: {}, byChannel: [] };
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });

    const { result } = renderHook(() =>
      useCampaignAnalytics('c1', '2024-01-01', '2024-01-07')
    );

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(mockFetch).toHaveBeenCalledWith(
      '/campaigns/c1/analytics?from=2024-01-01&to=2024-01-07'
    );
  });

  it('omits the query string when no range is passed', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ series: {} }) });
    const { result } = renderHook(() => useCampaignAnalytics('c2'));
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledWith('/campaigns/c2/analytics');
  });

  it('does not fetch when no campaignId is given', () => {
    renderHook(() => useCampaignAnalytics(undefined));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

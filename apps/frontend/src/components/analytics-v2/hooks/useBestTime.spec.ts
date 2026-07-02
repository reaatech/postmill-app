import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockFetchFn = vi.fn();
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetchFn,
}));
vi.mock('swr', () => ({ default: vi.fn() }));

import useSWR from 'swr';
import { useBestTime } from './useBestTime';

const mockUseSWR = vi.mocked(useSWR);

describe('useBestTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false } as any);
  });

  it('keys SWR by the integrations filter and exposes label catalogs', () => {
    const { result } = renderHook(() => useBestTime(['i1', 'i2']));
    expect(mockUseSWR.mock.calls[0][0]).toContain('integrations=i1%2Ci2');
    expect(result.current.DAY_LABELS).toHaveLength(7);
    expect(result.current.HOUR_LABELS).toHaveLength(24);
    expect(result.current.HOUR_LABELS[0]).toBe('12a');
    expect(result.current.HOUR_LABELS[12]).toBe('12p');
  });

  it('load fetcher hits the best-time endpoint and throws on failure', async () => {
    renderHook(() => useBestTime());
    const load = mockUseSWR.mock.calls[0][1] as () => Promise<any>;

    mockFetchFn.mockResolvedValueOnce({ ok: true, json: async () => ({ heatmap: [] }) });
    expect(await load()).toEqual({ heatmap: [] });
    expect(mockFetchFn.mock.calls[0][0]).toContain('/analytics/v2/best-time');

    mockFetchFn.mockResolvedValueOnce({ ok: false });
    await expect(load()).rejects.toThrow('Failed to load best time');
  });
});

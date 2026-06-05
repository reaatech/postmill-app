'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { DayDetailResponse } from '../utils';

interface DayDrillParams {
  date: string;
  metric: string;
  integrations: string[];
}

function serializeParams(p: DayDrillParams): string {
  const params = new URLSearchParams({
    date: p.date,
    metric: p.metric,
    integrations: p.integrations.join(','),
  });
  return `/analytics/v2/day?${params.toString()}`;
}

export const useDayDrill = (params: DayDrillParams) => {
  const fetch = useFetch();

  const load = useCallback(async (path: string) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to fetch day drill');
    return res.json() as Promise<DayDetailResponse>;
  }, [fetch]);

  const key = serializeParams(params);

  return useSWR(params.date && params.metric ? key : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useCallback } from 'react';

export interface BestTimeEntry {
  day: number;
  hour: number;
  engagement: number;
  postCount: number;
  avgEngagement: number;
}

export interface BestTimeResponse {
  heatmap: BestTimeEntry[];
  bestSlots: { day: number; hour: number; avgEngagement: number }[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`
);

export const useBestTime = (integrations?: string[]) => {
  const fetch = useFetch();
  const params = new URLSearchParams();
  if (integrations?.length) {
    params.set('integrations', integrations.join(','));
  }

  const load = useCallback(async () => {
    const res = await fetch(`/analytics/v2/best-time?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load best time data');
    return res.json();
  }, [fetch, params.toString()]);

  const { data, error, isLoading } = useSWR<BestTimeResponse>(
    `best-time-${params.toString()}`,
    load,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  return { data, error, isLoading, DAY_LABELS, HOUR_LABELS };
};

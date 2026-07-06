'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface DailyBriefResponse {
  brief: string;
  generatedAt: string;
}

export interface DailyBriefEmpty {
  cached: false;
}

export const useDailyBrief = () => {
  const fetch = useFetch();
  const load = useCallback(
    async (url: string): Promise<DailyBriefResponse | DailyBriefEmpty> => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load brief');
      }
      return res.json();
    },
    [fetch]
  );

  const { data, error, isLoading, mutate } = useSWR<DailyBriefResponse | DailyBriefEmpty>(
    '/dashboard/brief',
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const generate = useCallback(async (): Promise<DailyBriefResponse> => {
    const res = await fetch('/dashboard/brief', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `Brief generation failed (${res.status})`) as any;
      err.status = res.status;
      throw err;
    }
    const result: DailyBriefResponse = await res.json();
    await mutate(result, false);
    return result;
  }, [fetch, mutate]);

  return {
    data,
    error,
    isLoading,
    generate,
  };
};

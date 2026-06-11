'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useCallback } from 'react';

export const useDashboardSummary = () => {
  const fetch = useFetch();
  const load = useCallback(async (url: string) => {
    return await (await fetch(url)).json();
  }, [fetch]);
  return useSWR('/dashboard/summary', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};

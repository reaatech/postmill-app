'use client';

import { useCallback } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { AttentionItemDto, AttentionResponseDto } from '@gitroom/nestjs-libraries/dtos/dashboard/attention.dto';

export type { AttentionItemDto, AttentionResponseDto };

export const useAttention = () => {
  const fetch = useFetch();
  const load = useCallback(
    async (url: string): Promise<AttentionResponseDto> => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load attention');
      }
      return res.json();
    },
    [fetch]
  );

  const { data, error, isLoading, mutate } = useSWR<AttentionResponseDto>(
    '/dashboard/attention',
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 60_000,
    }
  );

  const retryPost = useCallback(
    async (postId: string): Promise<void> => {
      const res = await fetch(`/posts/${postId}/retry`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Retry failed (${res.status})`);
      }
      await mutate();
      await globalMutate('/dashboard/summary');
    },
    [fetch, mutate]
  );

  const dismissAnomaly = useCallback(
    async (anomalyId: string): Promise<void> => {
      const res = await fetch(`/analytics/v2/anomalies/${anomalyId}/dismiss`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Dismiss failed (${res.status})`);
      }
      await mutate();
    },
    [fetch, mutate]
  );

  return {
    data,
    error,
    isLoading,
    mutate,
    retryPost,
    dismissAnomaly,
  };
};

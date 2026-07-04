'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

export interface PostShortlinkClick {
  short: string;
  original: string;
  clicks: number;
}

export interface PostShortlinkStats {
  clicks: PostShortlinkClick[];
}

// Per-post short-link click stats: GET /posts/:id/statistics.
// Preserved from the retired StatisticsModal (launches/statistics.tsx).
export const usePostShortlinkStats = (postId: string) => {
  const fetch = useFetch();

  const load = useCallback(
    async (path: string) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error('Failed to fetch short-link statistics');
      return res.json() as Promise<PostShortlinkStats>;
    },
    [fetch]
  );

  return useSWR(postId ? `/posts/${postId}/statistics` : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

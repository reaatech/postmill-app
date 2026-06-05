'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { PostDetail } from '../utils';

export const usePostDetail = (postId: string) => {
  const fetch = useFetch();

  const load = useCallback(async (path: string) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to fetch post detail');
    return res.json() as Promise<PostDetail>;
  }, [fetch]);

  return useSWR(postId ? `/analytics/v2/post/${postId}` : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

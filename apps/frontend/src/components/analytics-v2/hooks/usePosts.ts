'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { PostsResponse } from '../utils';

interface PostsParams {
  from: string;
  to: string;
  integrations: string[];
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
  limit: number;
}

function serializeParams(p: PostsParams): string {
  const params = new URLSearchParams({
    from: p.from,
    to: p.to,
    integrations: p.integrations.join(','),
    sort: p.sort,
    dir: p.dir,
    page: String(p.page),
    limit: String(p.limit),
  });
  return `/analytics/v2/posts?${params.toString()}`;
}

export const usePosts = (params?: PostsParams) => {
  const fetch = useFetch();

  const load = useCallback(async (path: string) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to fetch posts');
    return res.json() as Promise<PostsResponse>;
  }, [fetch]);

  const key = params ? serializeParams(params) : null;

  return useSWR(key, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

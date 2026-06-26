'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

export interface ContentPackProviderInfo {
  identifier: string;
  name: string;
  capabilities: string[];
  isConfigured: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ContentPackConfigResponse {
  active: {
    identifier: string;
    name: string;
    capabilities: string[];
  } | null;
  providers: ContentPackProviderInfo[];
}

export const useContentPacksConfig = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/content-packs/config');
    if (!res.ok) throw new Error('Failed to load content pack settings');
    return res.json();
  }, [fetch]);
  return useSWR<ContentPackConfigResponse>('org-content-packs-config', load, {
    revalidateOnFocus: false,
  });
};

export const useContentPackProviders = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/content-packs/providers');
    if (!res.ok) throw new Error('Failed to load content pack providers');
    return res.json();
  }, [fetch]);
  return useSWR<ContentPackProviderInfo[]>('org-content-packs-providers', load, {
    revalidateOnFocus: false,
  });
};

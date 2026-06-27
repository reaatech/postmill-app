'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Campaign, CampaignRef } from '@gitroom/frontend/components/campaigns/campaign-types';

// One hook per resource (rules-of-hooks). Loaders throw on !res.ok (repo convention).

export const useCampaigns = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const r = await fetch('/campaigns');
    if (!r.ok) throw new Error('Failed to load campaigns');
    return r.json();
  }, [fetch]);
  return useSWR<Campaign[]>('/campaigns', loader, { revalidateOnFocus: false });
};

export const useCampaign = (id: string) => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const r = await fetch(`/campaigns/${id}`);
    if (!r.ok) throw new Error('Failed to load campaign');
    return r.json();
  }, [fetch, id]);
  return useSWR<Campaign>(id ? `campaign-${id}` : null, loader, { revalidateOnFocus: false });
};

// Reverse lookup: which campaigns is this entity tagged on (for the selector).
export const useCampaignsForEntity = (entityType: string, entityId?: string) => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const r = await fetch(`/campaigns/for/${entityType}/${entityId}`);
    if (!r.ok) throw new Error('Failed to load campaign tags');
    return r.json();
  }, [fetch, entityType, entityId]);
  return useSWR<CampaignRef[]>(
    entityId ? `campaigns-for-${entityType}-${entityId}` : null,
    loader,
    { revalidateOnFocus: false }
  );
};

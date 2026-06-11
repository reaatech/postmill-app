'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';
import type { Column } from '@gitroom/frontend/components/ui/data-table';

interface ProviderCapability {
  analytics: boolean;
  comments: boolean;
  firstComment: boolean;
  poll: boolean;
  video: boolean;
  carousel: boolean;
  altText: boolean;
  maxMedia: number;
  linkPreview: boolean;
  refreshToken: boolean;
  watchlist: boolean;
}

const CAPABILITY_LABELS: Record<keyof ProviderCapability, string> = {
  analytics: 'Analytics',
  comments: 'Comments',
  firstComment: 'First Comment',
  poll: 'Polls',
  video: 'Video',
  carousel: 'Carousel',
  altText: 'Alt Text',
  maxMedia: 'Max Media',
  linkPreview: 'Link Preview',
  refreshToken: 'Refresh Token',
  watchlist: 'Watchlist',
};

export const ProviderCapabilityMatrix = () => {
  const { t } = useTranslation();
  const fetch = useFetch();

  const load = useCallback(async () => {
    const res = await fetch('/admin/provider-capabilities');
    if (!res.ok) throw new Error('Failed to load capabilities');
    return res.json() as Promise<Record<string, ProviderCapability>>;
  }, [fetch]);

  const { data, error } = useSWR('/admin/provider-capabilities', load);

  const columns: Column<[string, ProviderCapability]>[] = useMemo(() => {
    const capabilities = Object.keys(CAPABILITY_LABELS) as (keyof ProviderCapability)[];
    const cols: Column<[string, ProviderCapability]>[] = [
      { key: 'provider', header: t('provider', 'Provider'), render: ([name]: [string, ProviderCapability]) => name },
    ];
    capabilities.forEach((cap) => {
      cols.push({
        key: cap,
        header: t(`capability_${cap}`, CAPABILITY_LABELS[cap]),
        align: 'center',
        render: ([_name, caps]: [string, ProviderCapability]) => {
          if (cap === 'maxMedia') return String(caps[cap]);
          return caps[cap] ? <span className="text-green-500">✓</span> : <span className="text-red-500">✗</span>;
        },
      });
    });
    return cols;
  }, [t]);

  if (error) {
    return (
      <div className="text-red-500 p-[16px]">
        {t('failed_to_load_capabilities', 'Failed to load provider capabilities')}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-[16px] text-textColor">
        {t('loading', 'Loading...')}
      </div>
    );
  }

  const providers = Object.entries(data);

  return (
    <div className="overflow-auto p-[16px]">
      <h2 className="text-[20px] font-bold mb-[16px] text-textColor">
        {t('provider_capability_matrix', 'Provider Capability Matrix')}
      </h2>
      <DataTable
        columns={columns}
        data={providers}
        keyExtractor={([name]: [string, ProviderCapability]) => name}
        className="!rounded-none"
      />
    </div>
  );
};

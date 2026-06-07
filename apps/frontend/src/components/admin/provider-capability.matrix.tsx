'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';

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
  const capabilities = Object.keys(CAPABILITY_LABELS) as (keyof ProviderCapability)[];

  return (
    <div className="overflow-auto p-[16px]">
      <h2 className="text-[20px] font-bold mb-[16px] text-textColor">
        {t('provider_capability_matrix', 'Provider Capability Matrix')}
      </h2>
      <table className="w-full border-collapse border border-tableBorder text-[13px]">
        <thead>
          <tr className="bg-forth">
            <th className="border border-tableBorder p-[8px] text-left text-textColor sticky left-0 bg-forth z-10">
              {t('provider', 'Provider')}
            </th>
            {capabilities.map((cap) => (
              <th
                key={cap}
                className="border border-tableBorder p-[8px] text-center text-textColor min-w-[100px]"
              >
                {t(`capability_${cap}`, CAPABILITY_LABELS[cap])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {providers.map(([name, caps]) => (
            <tr key={name} className="hover:bg-fifth/30">
              <td className="border border-tableBorder p-[8px] font-medium text-textColor sticky left-0 bg-primary z-10">
                {name}
              </td>
              {capabilities.map((cap) => (
                <td
                  key={cap}
                  className={`border border-tableBorder p-[8px] text-center ${
                    cap === 'maxMedia'
                      ? 'text-textColor'
                      : caps[cap]
                        ? 'text-green-500'
                        : 'text-red-500'
                  }`}
                >
                  {cap === 'maxMedia' ? caps[cap] : caps[cap] ? '✓' : '✗'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

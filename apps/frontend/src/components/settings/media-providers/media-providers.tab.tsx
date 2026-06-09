'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ProviderCard } from '@gitroom/frontend/components/settings/media-providers/provider-card';
import { ProviderModal } from '@gitroom/frontend/components/settings/media-providers/provider-modal';

interface MediaProvider {
  identifier: string;
  name: string;
  type?: string;
  capabilities: string[];
  isConfigured: boolean;
  enabled: boolean;
  operations: string[];
  supportedOperations: string[];
  c2paAvailable: boolean;
}

const OPERATION_LABELS: Record<string, string> = {
  image: 'Image Generation',
  video: 'Video Generation',
  tts: 'Text-to-Speech',
  stt: 'Speech-to-Text',
  upscale: 'Image Upscale',
  'bg-remove': 'Background Removal',
  inpaint: 'Inpainting',
  embedding: 'Embeddings',
};

const ALL_OPERATIONS = ['image', 'video', 'tts', 'stt', 'upscale', 'bg-remove', 'inpaint'];

const useMediaProviders = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/admin/ai-settings/media-providers');
    if (!res.ok) throw new Error('Failed to load media providers');
    return res.json();
  }, [fetch]);
  return useSWR<MediaProvider[]>('admin-media-providers', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};

export const MediaProvidersTab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: providers, isLoading, error, mutate } = useMediaProviders();

  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);

  const handleToggle = useCallback(async (identifier: string, enabled: boolean) => {
    try {
      const res = await fetch(`/admin/ai-settings/media-providers/${identifier}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        toaster.show(t('toggle_failed', 'Failed to toggle provider'), 'warning');
        return;
      }
      mutate();
      toaster.show(
        enabled ? t('provider_enabled', 'Provider enabled') : t('provider_disabled', 'Provider disabled'),
        'success',
      );
    } catch {
      toaster.show(t('toggle_failed', 'Failed to toggle provider'), 'warning');
    }
  }, [fetch, mutate, toaster, t]);

  const handleConfigured = useCallback(() => {
    mutate();
  }, [mutate]);

  if (error) {
    return (
      <div className="flex flex-col">
        <h3 className="text-[20px] mb-[16px]">{t('media_providers', 'Media Providers')}</h3>
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">{t('failed_to_load_media_providers', 'Failed to load media providers')}</span>
          <button
            className="text-[13px] bg-forth border border-tableBorder rounded-[4px] px-[16px] py-[8px] hover:bg-boxHover transition-colors"
            onClick={() => window.location.reload()}
          >
            {t('try_again', 'Try again')}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <h3 className="text-[20px] mb-[16px]">{t('media_providers', 'Media Providers')}</h3>
        <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
          <div className="animate-pulse">{t('loading', 'Loading...')}</div>
        </div>
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="flex flex-col">
        <h3 className="text-[20px] mb-[16px]">{t('media_providers', 'Media Providers')}</h3>
        <div className="bg-sixth border-fifth border rounded-[4px] p-[24px]">
          <p className="text-[14px] text-customColor18">
            {t('no_media_providers', 'No media providers configured')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px] mb-[16px]">{t('media_providers', 'Media Providers')}</h3>

      {configuringProvider && (
        <ProviderModal
          identifier={configuringProvider}
          onClose={() => setConfiguringProvider(null)}
          onSaved={handleConfigured}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[12px] mb-[24px]">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.identifier}
            provider={provider}
            onConfigure={(id) => setConfiguringProvider(id)}
            onToggle={handleToggle}
          />
        ))}
      </div>

      <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
        <div className="text-[14px]">{t('operations_overview', 'Operations Overview')}</div>
        <div className="text-[12px] text-customColor18">
          {t('operations_overview_description', 'Which providers support each media operation')}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-tableBorder">
                <th className="text-left py-[8px] px-[8px] text-customColor18 font-medium">
                  {t('operation', 'Operation')}
                </th>
                {providers.map((p) => (
                  <th key={p.identifier} className="text-center py-[8px] px-[8px] text-customColor18 font-medium">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_OPERATIONS.map((op) => (
                <tr key={op} className="border-b border-tableBorder hover:bg-boxHover">
                  <td className="py-[8px] px-[8px] font-medium">
                    {OPERATION_LABELS[op] || op}
                  </td>
                  {providers.map((p) => {
                    const supports = p.supportedOperations.includes(op);
                    const configEnabled = p.enabled && p.isConfigured;
                    return (
                      <td key={p.identifier} className="text-center py-[8px] px-[8px]">
                        {supports ? (
                          configEnabled ? (
                            <span className="text-green-500 text-[16px]">✓</span>
                          ) : (
                            <span className="text-yellow-500 text-[16px]">○</span>
                          )
                        ) : (
                          <span className="text-customColor18 text-[16px]">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-[16px] text-[12px] text-customColor18">
          <span className="flex items-center gap-[4px]">
            <span className="text-green-500">✓</span> {t('available', 'Available & Enabled')}
          </span>
          <span className="flex items-center gap-[4px]">
            <span className="text-yellow-500">○</span> {t('configured_disabled', 'Configured but Disabled')}
          </span>
          <span className="flex items-center gap-[4px]">
            <span className="text-customColor18">—</span> {t('not_supported', 'Not Supported')}
          </span>
        </div>
      </div>

      <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[12px]">
        {ALL_OPERATIONS.map((op) => {
          const supported = providers.filter(
            (p) =>
              p.supportedOperations.includes(op) && p.enabled && p.isConfigured,
          );
          return (
            <div key={op} className="flex items-center gap-[12px]">
              <div className="w-[140px] shrink-0 text-[13px] font-medium">
                {OPERATION_LABELS[op] || op}
              </div>
              <div className="flex gap-[6px] flex-wrap">
                {supported.length > 0 ? (
                  supported.map((p) => (
                    <span
                      key={p.identifier}
                      className="bg-fifth border border-tableBorder rounded-[4px] px-[8px] py-[3px] text-[12px]"
                    >
                      {p.name}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-customColor18">
                    {t('no_provider_available', 'No provider available')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ProviderCard } from '@gitroom/frontend/components/settings/media-providers/provider-card';
import { ProviderModal } from '@gitroom/frontend/components/settings/media-providers/provider-modal';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';
import type { Column } from '@gitroom/frontend/components/ui/data-table';

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

interface AiMediaProviderSummary {
  identifier: string;
  name: string;
  type?: string;
  capabilities: string[];
  configured: boolean;
  enabled: boolean;
}

const useMediaProviders = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/ai/media-providers');
    if (!res.ok) throw new Error('Failed to load media providers');
    const data: AiMediaProviderSummary[] = await res.json();
    return data.map((p) => ({
      identifier: p.identifier,
      name: p.name,
      type: p.type,
      capabilities: p.capabilities || [],
      isConfigured: p.configured,
      enabled: p.enabled,
      operations: [],
      supportedOperations: p.capabilities || [],
      c2paAvailable: false,
    })) as MediaProvider[];
  }, [fetch]);
  return useSWR<MediaProvider[]>('media-providers', load, {
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
      const res = await fetch(`/ai/media-providers/${identifier}`, {
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
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">{t('failed_to_load_media_providers', 'Failed to load media providers')}</span>
          <button
            className="text-[13px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[16px] py-[8px] hover:bg-boxHover transition-colors"
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
        <div className="my-[16px] bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px]">
          <div className="animate-pulse">{t('loading', 'Loading...')}</div>
        </div>
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="flex flex-col">
        <h3 className="text-[20px] mb-[16px]">{t('media_providers', 'Media Providers')}</h3>
        <div className="bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px]">
          <p className="text-[14px] text-newTableText">
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

      <div className="bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px] flex flex-col gap-[16px]">
        <div className="text-[14px]">{t('operations_overview', 'Operations Overview')}</div>
        <div className="text-[12px] text-newTableText">
          {t('operations_overview_description', 'Which providers support each media operation')}
        </div>

        <DataTable
          columns={[
            { key: 'operation', header: t('operation', 'Operation'), render: (row: any) => <span className="font-medium">{OPERATION_LABELS[row.op] || row.op}</span> },
            ...providers.map((p) => ({
              key: p.identifier,
              header: p.name,
              align: 'center' as const,
              render: (row: any) => {
                const supports = row.supportedMap[p.identifier];
                const configEnabled = p.enabled && p.isConfigured;
                if (supports) {
                  return configEnabled
                    ? <span className="text-green-500 text-[16px]">✓</span>
                    : <span className="text-yellow-500 text-[16px]">○</span>;
                }
                return <span className="text-newTableText text-[16px]">—</span>;
              },
            })),
          ]}
          data={ALL_OPERATIONS.map((op) => ({
            op,
            supportedMap: Object.fromEntries(
              providers.map((p) => [p.identifier, p.supportedOperations.includes(op)])
            ),
          }))}
          keyExtractor={(row: any) => row.op}
        />

        <div className="flex items-center gap-[16px] text-[12px] text-newTableText">
          <span className="flex items-center gap-[4px]">
            <span className="text-green-500">✓</span> {t('available', 'Available & Enabled')}
          </span>
          <span className="flex items-center gap-[4px]">
            <span className="text-yellow-500">○</span> {t('configured_disabled', 'Configured but Disabled')}
          </span>
          <span className="flex items-center gap-[4px]">
            <span className="text-newTableText">—</span> {t('not_supported', 'Not Supported')}
          </span>
        </div>
      </div>

      <div className="bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px] flex flex-col gap-[12px]">
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
                      className="bg-newTableHeader border border-newTableBorder rounded-[4px] px-[8px] py-[3px] text-[12px]"
                    >
                      {p.name}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-newTableText">
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

'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ProviderModal } from '@gitroom/frontend/components/settings/media-providers/provider-modal';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';

interface MediaProvider {
  identifier: string;
  name: string;
  capabilities: string[];
  isConfigured: boolean;
  enabled: boolean;
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

const OPERATION_SHORT_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  tts: 'TTS',
  stt: 'STT',
  upscale: 'Upscale',
  'bg-remove': 'Bg Remove',
  inpaint: 'Inpaint',
  embedding: 'Embedding',
};

const OPERATION_COLORS: Record<string, string> = {
  image: 'bg-blue-500/20 text-blue-400',
  video: 'bg-red-500/20 text-red-400',
  tts: 'bg-green-500/20 text-green-400',
  stt: 'bg-emerald-500/20 text-emerald-400',
  upscale: 'bg-orange-500/20 text-orange-400',
  'bg-remove': 'bg-pink-500/20 text-pink-400',
  inpaint: 'bg-cyan-500/20 text-cyan-400',
  embedding: 'bg-yellow-500/20 text-yellow-400',
};

const ALL_OPERATIONS = ['image', 'video', 'tts', 'stt', 'upscale', 'bg-remove', 'inpaint'];

interface MediaProviderConfig {
  identifier: string;
  isConfigured: boolean;
  enabled: boolean;
}

interface OperationRow {
  op: string;
  supportedMap: Record<string, boolean>;
}

const useMediaProviders = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const [providersRes, configRes] = await Promise.all([
      fetch('/settings/media/providers'),
      fetch('/settings/media/config'),
    ]);
    if (!providersRes.ok) throw new Error('Failed to load media providers');
    const providers: { identifier: string; name: string; capabilities: { image: boolean; video: boolean; audio: boolean; avatar: boolean } }[] = await providersRes.json();
    const configData: { providers?: MediaProviderConfig[] } = configRes.ok
      ? await configRes.json()
      : { providers: [] };
    const configs: Record<string, MediaProviderConfig> = {};
    for (const cfg of configData.providers || []) {
      configs[cfg.identifier] = cfg;
    }
    return providers.map((p) => {
      const cfg = configs[p.identifier];
      const caps: string[] = [];
      if (p.capabilities.image) caps.push('image');
      if (p.capabilities.video) caps.push('video');
      if (p.capabilities.audio) caps.push('audio');
      if (p.capabilities.avatar) caps.push('avatar');
      return {
        identifier: p.identifier,
        name: p.name,
        capabilities: caps,
        isConfigured: cfg?.isConfigured || false,
        enabled: cfg?.enabled || false,
      } as MediaProvider;
    });
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
      const res = enabled
        ? await fetch(`/settings/media/config/${identifier}/set-active`, { method: 'POST' })
        : await fetch(`/settings/media/config/${identifier}`, { method: 'DELETE' });
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

  const title = t('media_providers', 'Media Providers');

  if (error) {
    return (
      <div className="flex flex-col">
        <h3 className="text-[20px] mb-[16px]">{title}</h3>
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
        <h3 className="text-[20px] mb-[16px]">{title}</h3>
        <div className="my-[16px] bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px]">
          <div className="animate-pulse">{t('loading', 'Loading...')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">

      {configuringProvider && (
        <ProviderModal
          identifier={configuringProvider}
          onClose={() => setConfiguringProvider(null)}
          onSaved={handleConfigured}
        />
      )}

      <ProviderListShell
        title={title}
        providers={(providers || []).map((p) => ({
          id: p.identifier,
          identifier: p.identifier,
          name: p.name,
          enabled: p.enabled && p.isConfigured,
          isActive: p.enabled && p.isConfigured,
          isConfigured: p.isConfigured,
          capabilities: p.capabilities,
        }))}
        onConfigure={(id) => setConfiguringProvider(id)}
        onRemove={(id) => handleToggle(id, false)}
        onToggle={(id, enabled) => handleToggle(id, enabled)}
        ProviderIconComponent={ProviderIcon}
        renderBadges={(provider) => {
          const caps = provider.capabilities || [];
          if (caps.length === 0) return null;
          return (
            <div className="flex gap-[4px] mt-[4px] flex-wrap">
              {caps.map((cap) => (
                <span
                  key={cap}
                  className={`text-[10px] rounded-[4px] px-[6px] py-[2px] ${
                    OPERATION_COLORS[cap] || 'bg-newTableHeader text-newTableText'
                  }`}
                >
                  {OPERATION_SHORT_LABELS[cap] || cap}
                </span>
              ))}
            </div>
          );
        }}
      />

      {providers && providers.length > 0 && (
        <>
          <div className="bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px] flex flex-col gap-[16px] mt-[24px]">
            <div className="text-[14px]">{t('operations_overview', 'Operations Overview')}</div>
            <div className="text-[12px] text-newTableText">
              {t('operations_overview_description', 'Which providers support each media operation')}
            </div>

            <DataTable
              columns={[
                { key: 'operation', header: t('operation', 'Operation'), render: (row: OperationRow) => <span className="font-medium">{OPERATION_LABELS[row.op] || row.op}</span> },
                ...providers.map((p) => ({
                  key: p.identifier,
                  header: p.name,
                  align: 'center' as const,
                  render: (row: OperationRow) => {
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
                  providers.map((p) => [p.identifier, p.capabilities.includes(op)])
                ),
              }))}
              keyExtractor={(row: OperationRow) => row.op}
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

          <div className="bg-newBgColorInner border-newTableBorder border rounded-[12px] p-[24px] flex flex-col gap-[12px] mt-[16px]">
            {ALL_OPERATIONS.map((op) => {
              const supported = providers.filter(
                (p) =>
                  p.capabilities.includes(op) && p.enabled && p.isConfigured,
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
        </>
      )}
    </div>
  );
};

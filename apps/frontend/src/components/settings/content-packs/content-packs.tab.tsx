'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';
import { useContentPacksConfig } from './hooks/useContentPacksConfig';
import { ContentPackForm } from './content-pack-form';

export const ContentPacksTab: React.FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: config, isLoading, error, mutate } = useContentPacksConfig();
  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleSetActive = useCallback(
    async (identifier: string) => {
      const res = await fetch(`/settings/content-packs/config/${identifier}/set-active`, {
        method: 'POST',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Failed to set active provider');
        toaster.show(text, 'warning');
        return;
      }
      toaster.show(t('provider_activated', 'Content pack activated'), 'success');
      refresh();
    },
    [fetch, refresh, toaster, t]
  );

  const handleDeactivate = useCallback(async () => {
    const res = await fetch('/settings/content-packs/deactivate', { method: 'POST' });
    if (!res.ok) {
      toaster.show(t('deactivate_failed', 'Failed to deactivate'), 'warning');
      return;
    }
    toaster.show(t('deactivated', 'Content pack deactivated'), 'success');
    refresh();
  }, [fetch, refresh, toaster, t]);

  const handleDelete = useCallback(
    async (identifier: string) => {
      if (!confirm(t('confirm_remove', 'Are you sure you want to remove this configuration?'))) {
        return;
      }
      const res = await fetch(`/settings/content-packs/config/${identifier}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toaster.show(t('delete_failed', 'Failed to delete'), 'warning');
        return;
      }
      toaster.show(t('deleted', 'Configuration deleted'), 'success');
      refresh();
    },
    [fetch, refresh, toaster, t]
  );

  const capabilityChips = (capabilities: string[]) =>
    capabilities.map((cap) => {
      switch (cap) {
        case 'photos':
          return t('photos', 'Photos');
        case 'videos':
          return t('videos', 'Videos');
        case 'vectors':
          return t('vectors', 'Vectors');
        case 'icons':
          return t('icons', 'Icons');
        case 'audio':
          return t('audio', 'Audio');
        case 'stickers':
          return t('stickers', 'Stickers');
        default:
          return cap;
      }
    });

  return (
    <div className="flex flex-col gap-[16px]">
      <h3 className="text-[20px]">{t('content_packs', 'Content Packs')}</h3>

      {error && (
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">
            {t('failed_to_load', 'Failed to load content pack settings')}
          </span>
          <button
            className="text-[13px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[16px] py-[8px] hover:bg-boxHover transition-colors"
            onClick={() => window.location.reload()}
          >
            {t('try_again', 'Try again')}
          </button>
        </div>
      )}

      {!error && configuringProvider ? (
        <ContentPackForm
          identifier={configuringProvider}
          onClose={() => setConfiguringProvider(null)}
          onSaved={() => {
            setConfiguringProvider(null);
            refresh();
          }}
        />
      ) : (
        <>
          <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[24px]">
            <div className="mt-[4px]">{t('active_provider', 'Active Provider')}</div>
            {isLoading ? (
              <div className="animate-pulse">{t('loading', 'Loading...')}</div>
            ) : config?.active ? (
              <div className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px] flex items-center gap-[12px]">
                <ProviderIcon
                  identifier={config.active.identifier}
                  name={config.active.identifier}
                  size={32}
                />
                <div className="flex flex-col gap-[4px] flex-1">
                  <span className="text-[14px] font-semibold">
                    {config.active.name ||
                      config.active.identifier.charAt(0).toUpperCase() +
                        config.active.identifier.slice(1)}
                  </span>
                  {config.active.capabilities.length > 0 && (
                    <div className="flex gap-[4px] flex-wrap">
                      {capabilityChips(config.active.capabilities).map((chip) => (
                        <span
                          key={chip}
                          className="text-[10px] bg-newTableText/20 text-newTableText rounded-[2px] px-[4px] py-[1px]"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[11px] bg-green-900/20 text-green-400 rounded-[4px] px-[8px] py-[2px]">
                  {t('active', 'Active')}
                </span>
                <button
                  className="text-[12px] text-red-500 hover:underline"
                  onClick={handleDeactivate}
                >
                  {t('deactivate', 'Deactivate')}
                </button>
              </div>
            ) : (
              <div className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px]">
                <span className="text-[13px] text-newTableText">
                  {t(
                    'no_active_content_pack',
                    'No content pack configured. Premium stock results will fall back to free providers.'
                  )}
                </span>
              </div>
            )}
          </div>

          <ProviderListShell
            title={t('all_providers', 'All Providers')}
            providers={(config?.providers || []).map((p) => ({
              id: p.identifier,
              identifier: p.identifier,
              name: p.name,
              enabled: true,
              isActive: p.isActive,
              isConfigured: p.isConfigured,
              capabilities: capabilityChips(p.capabilities),
            }))}
            onConfigure={(id) => setConfiguringProvider(id)}
            onSetActive={(id) => handleSetActive(id)}
            onRemove={(id) => handleDelete(id)}
            ProviderIconComponent={ProviderIcon}
            addProviderButton={
              <button
                onClick={() => {
                  const first = config?.providers?.[0];
                  if (first) setConfiguringProvider(first.identifier);
                }}
                className="px-[12px] py-[6px] rounded-[6px] bg-btnPrimary text-white text-[12px] font-medium hover:bg-btnPrimary/80 transition-colors"
              >
                {t('add_provider', 'Add Provider')}
              </button>
            }
            renderActions={(provider) => {
              const p = config?.providers?.find((pr) => pr.identifier === provider.identifier);
              if (!p) return null;
              return (
                <>
                  <button
                    className="text-[12px] text-btnPrimary hover:underline"
                    onClick={() => setConfiguringProvider(p.identifier)}
                  >
                    {p.isConfigured ? t('edit', 'Edit') : t('configure', 'Configure')}
                  </button>
                  {!p.isActive && p.isConfigured && (
                    <button
                      className="text-[12px] text-btnPrimary hover:underline"
                      onClick={() => handleSetActive(p.identifier)}
                    >
                      {t('set_active', 'Set Active')}
                    </button>
                  )}
                  {p.isConfigured && (
                    <button
                      className="text-[12px] text-red-500 hover:underline"
                      onClick={() => handleDelete(p.identifier)}
                    >
                      {t('remove', 'Remove')}
                    </button>
                  )}
                </>
              );
            }}
          />
        </>
      )}
    </div>
  );
};

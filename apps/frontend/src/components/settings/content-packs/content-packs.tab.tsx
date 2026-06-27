'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';
import { useContentPacksConfig } from './hooks/useContentPacksConfig';
import { ContentPackForm } from './content-pack-form';

// Postmill's built-in free stock pack — the default that is enabled whenever no
// premium pack is active. It covers every capability via the free providers.
const POSTMILL_IDENTIFIER = 'postmill';
const POSTMILL_CAPABILITIES = ['photos', 'videos', 'vectors', 'stickers', 'audio', 'icons'];

export const ContentPacksTab: React.FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: config, error, mutate } = useContentPacksConfig();
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
      <div className="flex flex-col gap-[4px]">
        <h3 className="text-[18px] font-semibold text-textColor">{t('content_packs', 'Content Packs')}</h3>
        <p className="text-[13px] text-newTableText max-w-[640px]">
          {t(
            'content_packs_description',
            'A content pack is the stock media library that powers searches for photos, videos, vectors, stickers, icons and audio across the app. Postmill ships with a free default pack; connect a premium provider for higher-quality, licensed content. You can configure several, but only one pack is enabled at a time — anything it doesn’t cover falls back to the free default.'
          )}
        </p>
      </div>

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
        <ProviderListShell
          title=""
          providers={[
            // Postmill's built-in free pack — always available, enabled by
            // default. A null backend `active` means free providers are in use,
            // which is exactly the Postmill default. Pinned to the top; the
            // configurable premium packs sort alphabetically below it.
            {
              id: POSTMILL_IDENTIFIER,
              identifier: POSTMILL_IDENTIFIER,
              name: t('postmill_default', 'Postmill (Default)'),
              enabled: !config?.active,
              isActive: !config?.active,
              isConfigured: true,
              capabilities: capabilityChips(POSTMILL_CAPABILITIES),
            },
            ...(config?.providers || [])
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => ({
                id: p.identifier,
                identifier: p.identifier,
                name: p.name,
                enabled: true,
                isActive: p.isActive,
                isConfigured: p.isConfigured,
                capabilities: capabilityChips(p.capabilities),
              })),
          ]}
          onConfigure={(id) => setConfiguringProvider(id)}
          onSetActive={(id) => handleSetActive(id)}
          onRemove={(id) => handleDelete(id)}
          ProviderIconComponent={ProviderIcon}
          renderActions={(provider) => {
            // Postmill default: only one pack can be enabled, so enabling it
            // just deactivates any premium pack (back to free providers).
            if (provider.identifier === POSTMILL_IDENTIFIER) {
              if (provider.isActive) return null;
              return (
                <button
                  className="text-[12px] text-btnPrimary hover:underline"
                  onClick={handleDeactivate}
                >
                  {t('enable', 'Enable')}
                </button>
              );
            }
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
                    {t('enable', 'Enable')}
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
      )}
    </div>
  );
};

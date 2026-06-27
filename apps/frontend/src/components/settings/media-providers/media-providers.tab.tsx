'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ProviderModal } from '@gitroom/frontend/components/settings/media-providers/provider-modal';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';

// Most media studio routes match the provider identifier (/media/<id>); these two differ.
const ROUTE_OVERRIDES: Record<string, string> = {
  google: 'google-ai',
  fal: 'kling',
};
const studioHref = (identifier: string) =>
  `/media/${ROUTE_OVERRIDES[identifier] || identifier}`;

// Capability filter chips. A provider matches if it has ANY of the selected
// capabilities (faceted-OR), so "Image + Video" widens to either.
const CAPABILITY_FILTERS: { key: string; label: string; active: string }[] = [
  { key: 'image', label: 'Image', active: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  { key: 'video', label: 'Video', active: 'bg-red-500/20 text-red-400 border-red-500/40' },
  { key: 'audio', label: 'Audio', active: 'bg-green-500/20 text-green-400 border-green-500/40' },
];

interface MediaProvider {
  identifier: string;
  name: string;
  capabilities: string[];
  isConfigured: boolean;
  enabled: boolean;
}

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

interface MediaProviderConfig {
  identifier: string;
  isConfigured: boolean;
  enabled: boolean;
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

  // Seed the filter from ?search= so a studio's "Configure" CTA deep-links straight to its provider.
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);

  const toggleCap = useCallback((cap: string) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  }, []);

  // Configured providers pinned to the top, everything else alphabetical by name.
  const sortedProviders = useMemo(() => {
    return [...(providers || [])].sort((a, b) => {
      if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [providers]);

  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedProviders.filter((p) => {
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.identifier.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (
        selectedCaps.length &&
        !selectedCaps.some((c) => p.capabilities.includes(c))
      ) {
        return false;
      }
      return true;
    });
  }, [sortedProviders, search, selectedCaps]);

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

  const title = t('ai_media', 'AI Media');

  if (error) {
    return (
      <div className="flex flex-col">
        <h3 className="text-[18px] mb-[16px] font-semibold text-textColor">{title}</h3>
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
        <h3 className="text-[18px] mb-[16px] font-semibold text-textColor">{title}</h3>
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
        description={t(
          'ai_media_settings_description',
          'Connect tools that generate images, videos, and audio for your posts.'
        )}
        toolbar={
          <div className="flex items-center gap-[12px] mobile:flex-col mobile:items-stretch">
            <div className="flex-1 relative">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_providers', 'Search providers...')}
                className="w-full px-[12px] py-[8px] pr-[36px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none [&::-webkit-search-cancel-button]:appearance-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t('clear_search', 'Clear search')}
                  className="absolute right-[8px] top-1/2 -translate-y-1/2 w-[20px] h-[20px] flex items-center justify-center rounded-full text-newTableText hover:text-textColor hover:bg-boxHover transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-[8px]">
              {CAPABILITY_FILTERS.map((f) => {
                const active = selectedCaps.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleCap(f.key)}
                    aria-pressed={active}
                    className={`text-[13px] px-[12px] py-[8px] rounded-[8px] border transition-colors ${
                      active
                        ? f.active
                        : 'bg-newBgColor border-newTableBorder text-newTableText hover:bg-boxHover'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
        providers={filteredProviders.map((p) => ({
          id: p.identifier,
          identifier: p.identifier,
          name: p.name,
          enabled: p.enabled && p.isConfigured,
          isActive: p.enabled && p.isConfigured,
          isConfigured: p.isConfigured,
          capabilities: p.capabilities,
        }))}
        getProviderHref={(provider) => studioHref(provider.identifier)}
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
    </div>
  );
};

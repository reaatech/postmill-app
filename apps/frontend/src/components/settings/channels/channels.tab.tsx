'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ChannelConfigForm } from './channel-edit.modal';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

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

type CapabilityKey = keyof ProviderCapability;

interface ProviderCatalogItem {
  identifier: string;
  name: string;
  description: string;
  scopes: string;
  capabilities: ProviderCapability | null;
}

interface ChannelConfigItem {
  id: string;
  identifier: string;
  name: string;
  enabled: boolean;
  isConfigured: boolean;
  scopes: string | null;
  redirectUri: string | null;
  setupNotes: string | null;
  updatedAt: string | null;
  capabilities: ProviderCapability | null;
}

const CAPABILITY_KEYS: CapabilityKey[] = [
  'analytics',
  'comments',
  'firstComment',
  'poll',
  'video',
  'carousel',
  'altText',
  'linkPreview',
  'refreshToken',
  'watchlist',
];

const CAPABILITY_FILTERS: { key: CapabilityKey; label: string }[] = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'comments', label: 'Comments' },
  { key: 'firstComment', label: 'First Comment' },
  { key: 'poll', label: 'Polls' },
  { key: 'video', label: 'Video' },
  { key: 'carousel', label: 'Carousel' },
  { key: 'altText', label: 'Alt Text' },
  { key: 'linkPreview', label: 'Link Preview' },
  { key: 'refreshToken', label: 'Refresh Token' },
  { key: 'watchlist', label: 'Watchlist' },
];

const CAPABILITY_COLORS: Record<string, string> = {
  analytics: 'bg-blue-500/20 text-blue-400',
  comments: 'bg-purple-500/20 text-purple-400',
  firstComment: 'bg-amber-500/20 text-amber-400',
  poll: 'bg-emerald-500/20 text-emerald-400',
  video: 'bg-red-500/20 text-red-400',
  carousel: 'bg-pink-500/20 text-pink-400',
  altText: 'bg-cyan-500/20 text-cyan-400',
  linkPreview: 'bg-indigo-500/20 text-indigo-400',
  refreshToken: 'bg-teal-500/20 text-teal-400',
  watchlist: 'bg-orange-500/20 text-orange-400',
};

const useConfigs = () => {
  const fetch = useFetch();
  return useSWR<ChannelConfigItem[]>('/channels/config', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useProviders = () => {
  const fetch = useFetch();
  return useSWR<ProviderCatalogItem[]>('/channels/config/providers', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const ChannelProviderIcon: FC<{ identifier: string; name: string; size?: number }> = ({
  identifier,
  name,
  size = 40,
}) => {
  const src = identifier === 'youtube'
    ? '/icons/platforms/youtube.svg'
    : `/icons/platforms/${identifier}.png`;

  return (
    <SafeImage
      className="rounded-full"
      style={{ width: size, height: size }}
      src={src}
      alt={name}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
};

// Single dropdown of capability checkboxes (replaces the row of filter buttons).
const CapabilityFilter: FC<{
  selected: CapabilityKey[];
  onToggle: (cap: CapabilityKey) => void;
  onClear: () => void;
}> = ({ selected, onToggle, onClear }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-[8px] text-[13px] px-[12px] py-[8px] rounded-[8px] border border-newTableBorder bg-newBgColor text-newTableText hover:bg-boxHover transition-colors"
      >
        {t('capabilities', 'Capabilities')}
        {selected.length > 0 && (
          <span className="text-[11px] bg-btnPrimary text-white rounded-full px-[6px] py-[1px]">
            {selected.length}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mobile:right-auto mobile:left-0 top-[42px] z-[300] w-[220px] bg-newBgColorInner border border-newTableBorder rounded-[8px] shadow-lg py-[6px]">
          {CAPABILITY_FILTERS.map((f) => {
            const checked = selected.includes(f.key);
            return (
              <label
                key={f.key}
                className="flex items-center gap-[8px] px-[12px] py-[6px] text-[13px] text-textColor hover:bg-boxHover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(f.key)}
                  className="accent-btnPrimary w-[14px] h-[14px]"
                />
                {f.label}
              </label>
            );
          })}
          {selected.length > 0 && (
            <div className="border-t border-newTableBorder mt-[4px] pt-[4px] px-[12px]">
              <button
                type="button"
                onClick={onClear}
                className="text-[12px] text-textColor hover:underline"
              >
                {t('clear_all', 'Clear all')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Provider picker used by "Add channel" — choose a provider, then configure it.
const ProviderPicker: FC<{
  providers: ProviderCatalogItem[];
  onPick: (provider: ProviderCatalogItem) => void;
}> = ({ providers, onPick }) => {
  const t = useT();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) => p.name.toLowerCase().includes(q) || p.identifier.toLowerCase().includes(q)
    );
  }, [providers, search]);

  return (
    <div className="flex flex-col gap-[12px] min-w-[420px] mobile:min-w-0">
      <input
        type="search"
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('search_providers', 'Search providers...')}
        className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
      />
      <div className="flex flex-col gap-[4px] max-h-[420px] overflow-y-auto">
        {filtered.map((p) => (
          <button
            key={p.identifier}
            type="button"
            onClick={() => onPick(p)}
            className="flex items-center gap-[12px] p-[10px] rounded-[8px] border border-newTableBorder hover:bg-boxHover text-start"
          >
            <ChannelProviderIcon identifier={p.identifier} name={p.name} size={32} />
            <span className="text-[14px] font-[500] text-textColor">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const ChannelsTab: FC = () => {
  const t = useT();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: configs, isLoading, error } = useConfigs();
  const { data: providers } = useProviders();
  const modals = useModals();
  const toaster = useToaster();

  const [search, setSearch] = useState('');
  const [selectedCaps, setSelectedCaps] = useState<CapabilityKey[]>([]);

  const providerName = useCallback(
    (identifier: string) =>
      providers?.find((p) => p.identifier === identifier)?.name || identifier,
    [providers]
  );

  const refresh = useCallback(() => globalMutate('/channels/config'), [globalMutate]);

  const openConfig = useCallback(
    (identifier: string, config?: ChannelConfigItem) => {
      const provider = providers?.find((p) => p.identifier === identifier);
      modals.openModal({
        title: config
          ? t('edit_channel', 'Edit channel')
          : `${t('configure', 'Configure')} ${providerName(identifier)}`,
        children: (close) => (
          <ChannelConfigForm
            identifier={identifier}
            providerName={providerName(identifier)}
            defaultScopes={provider?.scopes || ''}
            config={
              config
                ? {
                    id: config.id,
                    name: config.name,
                    enabled: config.enabled,
                    scopes: config.scopes || '',
                    redirectUri: config.redirectUri || '',
                    setupNotes: config.setupNotes || '',
                    isConfigured: config.isConfigured,
                  }
                : undefined
            }
            onClose={close}
            onSaved={refresh}
          />
        ),
      });
    },
    [providers, modals, t, providerName, refresh]
  );

  const openPicker = useCallback(() => {
    if (!providers?.length) {
      toaster.show(t('providers_loading', 'Providers are still loading'), 'warning');
      return;
    }
    modals.openModal({
      title: t('add_channel', 'Add channel'),
      children: (close) => (
        <ProviderPicker
          providers={providers}
          onPick={(p) => {
            close();
            openConfig(p.identifier);
          }}
        />
      ),
    });
  }, [providers, modals, t, toaster, openConfig]);

  const toggleCap = useCallback((cap: CapabilityKey) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }, []);

  const filteredConfigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(configs || [])]
      .filter((c) => {
        if (
          q &&
          !c.name.toLowerCase().includes(q) &&
          !c.identifier.toLowerCase().includes(q) &&
          !providerName(c.identifier).toLowerCase().includes(q)
        ) {
          return false;
        }
        if (selectedCaps.length && !selectedCaps.some((cap) => c.capabilities?.[cap])) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [configs, search, selectedCaps, providerName]);

  const shellProviders = useMemo(
    () =>
      filteredConfigs.map((c) => ({
        id: c.id,
        identifier: c.identifier,
        name: c.name,
        enabled: c.enabled && c.isConfigured,
        isActive: c.enabled && c.isConfigured,
        isConfigured: c.isConfigured,
        capabilities: CAPABILITY_KEYS.filter((cap) => c.capabilities?.[cap]),
      })),
    [filteredConfigs]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center gap-[12px] py-[40px]">
        <div className="text-red-500 text-[14px]">
          {t('channels_load_failed', 'Failed to load channels')}: {error.message || 'Unknown error'}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-textColor text-[14px] py-[40px] text-center">
        {t('loading_channels', 'Loading channels...')}
      </div>
    );
  }

  return (
    <ProviderListShell
      title=""
      providers={shellProviders}
      onConfigure={() => undefined}
      onRemove={() => undefined}
      ProviderIconComponent={ChannelProviderIcon}
      toolbar={
        <div className="flex items-center gap-[12px] mobile:flex-col mobile:items-stretch">
          <div className="flex-1 relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_channels', 'Search channels...')}
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
          <CapabilityFilter
            selected={selectedCaps}
            onToggle={toggleCap}
            onClear={() => setSelectedCaps([])}
          />
          <button
            type="button"
            onClick={openPicker}
            className="text-[13px] px-[16px] py-[8px] rounded-[8px] bg-btnPrimary text-white hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            + {t('add_channel', 'Add channel')}
          </button>
        </div>
      }
      renderBadges={(provider) => {
        const caps = (provider.capabilities || []).filter((cap): cap is CapabilityKey =>
          CAPABILITY_KEYS.includes(cap as CapabilityKey)
        );
        return (
          <div className="flex gap-[4px] mt-[4px] flex-wrap items-center">
            <span className="text-[11px] text-newTableText">
              {providerName(provider.identifier)}
            </span>
            {caps.map((cap) => (
              <span
                key={cap}
                className={`text-[10px] rounded-[4px] px-[6px] py-[2px] ${
                  CAPABILITY_COLORS[cap] || 'bg-newTableHeader text-newTableText'
                }`}
              >
                {CAPABILITY_FILTERS.find((f) => f.key === cap)?.label || cap}
              </span>
            ))}
          </div>
        );
      }}
      renderActions={(provider) => {
        const config = filteredConfigs.find((c) => c.id === provider.id);
        if (!config) return null;
        return (
          <button
            className="text-[12px] text-textColor hover:underline"
            onClick={() => openConfig(config.identifier, config)}
          >
            {t('edit', 'Edit')}
          </button>
        );
      }}
    />
  );
};

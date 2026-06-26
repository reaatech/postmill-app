'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ChannelEditModal } from './channel-edit.modal';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';
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

interface ProviderConfigItem {
  identifier: string;
  name: string;
  description: string;
  enabled: boolean;
  isConfigured: boolean;
  setupNotes: string;
  isExternal: boolean;
  isWeb3: boolean;
  isChromeExtension: boolean;
  customFields: boolean;
  scopes: string;
  redirectUri: string;
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

const CAPABILITY_FILTERS: { key: CapabilityKey; label: string; active: string }[] = [
  { key: 'analytics', label: 'Analytics', active: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  { key: 'comments', label: 'Comments', active: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  { key: 'firstComment', label: 'First Comment', active: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  { key: 'poll', label: 'Polls', active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  { key: 'video', label: 'Video', active: 'bg-red-500/20 text-red-400 border-red-500/40' },
  { key: 'carousel', label: 'Carousel', active: 'bg-pink-500/20 text-pink-400 border-pink-500/40' },
  { key: 'altText', label: 'Alt Text', active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' },
  { key: 'linkPreview', label: 'Link Preview', active: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' },
  { key: 'refreshToken', label: 'Refresh Token', active: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
  { key: 'watchlist', label: 'Watchlist', active: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
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
  return useSWR<ProviderConfigItem[]>('/channels/config', (url: string) =>
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

export const ChannelsTab: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: configs, isLoading, error, mutate } = useConfigs();
  const [editingIdentifier, setEditingIdentifier] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCaps, setSelectedCaps] = useState<CapabilityKey[]>([]);

  const handleDelete = useCallback(async (identifier: string) => {
    try {
      const res = await fetch(`/channels/config/${identifier}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear credentials');
      toaster.show('Credentials cleared', 'success');
      globalMutate('/channels/config');
      if (editingIdentifier === identifier) {
        setEditingIdentifier(null);
      }
    } catch {
      toaster.show('Failed to clear credentials', 'warning');
    }
  }, [fetch, toaster, globalMutate, editingIdentifier]);

  const handleSave = useCallback(async (identifier: string, data: Record<string, any>) => {
    try {
      const res = await fetch(`/channels/config/${identifier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toaster.show('Channel credentials saved', 'success');
        globalMutate('/channels/config');
        setEditingIdentifier(null);
        return true;
      }
      const errBody = await res.json().catch(() => ({}));
      toaster.show(errBody.message || 'Failed to save credentials', 'warning');
      return false;
    } catch {
      toaster.show('Network error while saving', 'warning');
      return false;
    }
  }, [fetch, toaster, globalMutate]);

  const handleTestConnection = useCallback(async (identifier: string) => {
    try {
      const res = await fetch(`/channels/config/${identifier}/test`, { method: 'POST' });
      if (!res.ok) throw new Error('Test failed');
      const result = await res.json();
      if (result.success && result.authUrl) {
        toaster.show('Configuration valid - auth URL generated', 'success');
      } else {
        toaster.show(result.error || 'Test failed', 'warning');
      }
    } catch {
      toaster.show('Test connection failed', 'warning');
    }
  }, [fetch, toaster]);

  const toggleCap = useCallback((cap: CapabilityKey) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }, []);

  const sortedProviders = useMemo(() => {
    return [...(configs || [])].sort((a, b) => {
      if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [configs]);

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
        !selectedCaps.some((c) => p.capabilities?.[c])
      ) {
        return false;
      }
      return true;
    });
  }, [sortedProviders, search, selectedCaps]);

  const shellProviders = useMemo(
    () =>
      filteredProviders.map((p) => ({
        id: p.identifier,
        identifier: p.identifier,
        name: p.name,
        enabled: p.enabled && p.isConfigured,
        isActive: p.enabled && p.isConfigured,
        isConfigured: p.isConfigured,
        capabilities: CAPABILITY_KEYS.filter((c) => p.capabilities?.[c]),
      })),
    [filteredProviders]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center gap-[12px] py-[40px]">
        <div className="text-red-500 text-[14px]">
          Failed to load channel configurations: {error.message || 'Unknown error'}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-textColor text-[14px] py-[40px] text-center">
        Loading channel configurations...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      {editingIdentifier && (
        <ChannelEditModal
          identifier={editingIdentifier}
          name={filteredProviders.find((p) => p.identifier === editingIdentifier)?.name || editingIdentifier}
          enabled={filteredProviders.find((p) => p.identifier === editingIdentifier)?.enabled || false}
          scopes={filteredProviders.find((p) => p.identifier === editingIdentifier)?.scopes || ''}
          redirectUri={filteredProviders.find((p) => p.identifier === editingIdentifier)?.redirectUri || ''}
          setupNotes={filteredProviders.find((p) => p.identifier === editingIdentifier)?.setupNotes || ''}
          isConfigured={filteredProviders.find((p) => p.identifier === editingIdentifier)?.isConfigured || false}
          onSave={handleSave}
          onDelete={handleDelete}
          onTest={handleTestConnection}
          onClose={() => setEditingIdentifier(null)}
        />
      )}

      <ProviderListShell
        title={t('channels', 'Channels')}
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
        providers={shellProviders}
        onConfigure={(id) => setEditingIdentifier(id)}
        onRemove={(id) => handleDelete(id)}
        ProviderIconComponent={ChannelProviderIcon}
        renderBadges={(provider) => {
          const caps = (provider.capabilities || []).filter((cap): cap is CapabilityKey =>
            CAPABILITY_KEYS.includes(cap as CapabilityKey)
          );
          if (caps.length === 0) return null;
          return (
            <div className="flex gap-[4px] mt-[4px] flex-wrap">
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
          const p = filteredProviders.find((pr) => pr.identifier === provider.identifier);
          return (
            <>
              <button
                className="text-[12px] text-textColor hover:underline"
                onClick={() => setEditingIdentifier(provider.identifier)}
              >
                {p?.isConfigured ? t('edit', 'Edit') : t('configure', 'Configure')}
              </button>
            </>
          );
        }}
      />
    </div>
  );
};

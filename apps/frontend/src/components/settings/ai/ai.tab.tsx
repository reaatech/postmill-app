'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  PromptTemplatesSection,
  PromptLibrarySection,
} from '@gitroom/frontend/components/settings/brand-ai.settings';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { ProviderForm } from '@gitroom/frontend/components/settings/ai/provider-form';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';
import { BrandTab } from '@gitroom/frontend/components/settings/brand/brand.tab';

interface AICapabilities {
  text: boolean;
  image: boolean;
  vision: boolean;
  embeddings: boolean;
  speech: boolean;
  tools: boolean;
}

interface OrgProviderInfo {
  identifier: string;
  name: string;
  type: 'direct' | 'hub';
  enabled: boolean;
  isActive: boolean;
  isConfigured: boolean;
  defaultModel: string;
  reasoningModel: string;
  capabilities: AICapabilities;
}

interface OrgConfigResponse {
  active: {
    identifier: string;
    name: string;
    type: string;
    defaultModel: string;
    reasoningModel: string;
    credentials?: Record<string, string>;
  } | null;
  providers: OrgProviderInfo[];
}

const useOrgConfig = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/ai/config');
    if (!res.ok) throw new Error('Failed to load AI config');
    return res.json();
  }, [fetch]);
  return useSWR<OrgConfigResponse>('org-ai-config', load, {
    revalidateOnFocus: false,
  });
};

type AICapabilityKey = keyof AICapabilities;

const CAPABILITY_KEYS: AICapabilityKey[] = [
  'text',
  'image',
  'vision',
  'embeddings',
  'speech',
  'tools',
];

const CAPABILITY_FILTERS: {
  key: AICapabilityKey;
  label: string;
  active: string;
}[] = [
  { key: 'text', label: 'Text', active: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  { key: 'image', label: 'Image', active: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  { key: 'vision', label: 'Vision', active: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  { key: 'embeddings', label: 'Embeddings', active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  { key: 'speech', label: 'Speech', active: 'bg-pink-500/20 text-pink-400 border-pink-500/40' },
  { key: 'tools', label: 'Tools', active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' },
];

const CAPABILITY_COLORS: Record<string, string> = {
  text: 'bg-blue-500/20 text-blue-400',
  image: 'bg-purple-500/20 text-purple-400',
  vision: 'bg-amber-500/20 text-amber-400',
  embeddings: 'bg-emerald-500/20 text-emerald-400',
  speech: 'bg-pink-500/20 text-pink-400',
  tools: 'bg-cyan-500/20 text-cyan-400',
};

type SubTab = 'provider' | 'brands' | 'templates' | 'library';

export const AITab = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const toaster = useToaster();
  const { data: config, isLoading, error, mutate } = useOrgConfig();
  const [subTab, setSubTab] = useState<SubTab>('provider');
  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCaps, setSelectedCaps] = useState<AICapabilityKey[]>([]);

  const handleSetActive = useCallback(async (identifier: string) => {
    const res = await fetch(`/settings/ai/config/${identifier}/set-active`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.text();
      toaster.show(err || t('set_active_failed', 'Failed to set active provider'), 'warning');
      return;
    }
    toaster.show(t('provider_activated', 'Provider activated'), 'success');
    mutate();
  }, [fetch, mutate, toaster, t]);

  const handleDelete = useCallback(async (identifier: string) => {
    const res = await fetch(`/settings/ai/config/${identifier}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toaster.show(t('delete_failed', 'Failed to delete'), 'warning');
      return;
    }
    toaster.show(t('deleted', 'Provider configuration deleted'), 'success');
    mutate();
  }, [fetch, mutate, toaster, t]);

  const toggleCap = useCallback((cap: AICapabilityKey) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }, []);

  const sortedProviders = useMemo(() => {
    return [...(config?.providers || [])].sort((a, b) => {
      if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [config?.providers]);

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

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'provider', label: t('llm_providers', 'LLM Providers') },
    ...(user?.tier?.current !== 'FREE'
      ? [{ key: 'brands' as SubTab, label: t('brands', 'Brands') }]
      : []),
    { key: 'templates', label: t('prompt_templates', 'Prompt Templates') },
    { key: 'library', label: t('prompt_library', 'Prompt Library') },
  ];

  const shellProviders = useMemo(
    () =>
      filteredProviders.map((p) => ({
        id: p.identifier,
        identifier: p.identifier,
        name: p.name,
        enabled: p.enabled && p.isConfigured,
        isActive: p.isActive,
        isConfigured: p.isConfigured,
        type: p.type,
        capabilities: CAPABILITY_KEYS.filter((c) => p.capabilities?.[c]),
      })),
    [filteredProviders]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex gap-[8px] border-b border-newTableBorder pb-[8px]">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            className={`text-[13px] px-[16px] py-[8px] rounded-t-[4px] transition-colors ${
              subTab === tab.key
                ? 'bg-newBgColorInner border border-newTableBorder border-b-transparent text-textColor'
                : 'text-newTableText hover:text-textColor'
            }`}
            onClick={() => {
              setSubTab(tab.key);
              setConfiguringProvider(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">{t('failed_to_load_ai_settings', 'Failed to load AI settings')}</span>
          <button
            className="text-[13px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[16px] py-[8px] hover:bg-boxHover transition-colors"
            onClick={() => window.location.reload()}
          >
            {t('try_again', 'Try again')}
          </button>
        </div>
      )}

      {!error && subTab === 'brands' && <BrandTab />}

      {!error && subTab === 'provider' && (
        <div className="flex flex-col gap-[24px]">
          {configuringProvider ? (
            <ProviderForm
              identifier={configuringProvider}
              onClose={() => setConfiguringProvider(null)}
              onSaved={() => {
                setConfiguringProvider(null);
                mutate();
              }}
            />
          ) : (
            <ProviderListShell
              title={t('llm_providers', 'LLM Providers')}
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
              onConfigure={(id) => setConfiguringProvider(id)}
              onSetActive={(id) => handleSetActive(id)}
              onRemove={(id) => handleDelete(id)}
              ProviderIconComponent={ProviderIcon}
              renderBadges={(provider) => {
                const p = filteredProviders.find(
                  (pr) => pr.identifier === provider.identifier
                );
                if (!p) return null;
                const caps = CAPABILITY_KEYS.filter((c) => p.capabilities?.[c]);
                return (
                  <div className="flex gap-[4px] mt-[4px] flex-wrap items-center">
                    {p.type === 'hub' && (
                      <span className="text-[10px] rounded-[4px] px-[6px] py-[2px] bg-newTableText/20 text-newTableText">
                        {t('hub', 'Hub')}
                      </span>
                    )}
                    {caps.map((cap) => (
                      <span
                        key={cap}
                        className={`text-[10px] rounded-[4px] px-[6px] py-[2px] ${
                          CAPABILITY_COLORS[cap] || 'bg-newTableHeader text-newTableText'
                        }`}
                      >
                        {cap.charAt(0).toUpperCase() + cap.slice(1)}
                      </span>
                    ))}
                  </div>
                );
              }}
              renderActions={(provider) => {
                const p = filteredProviders.find(
                  (pr) => pr.identifier === provider.identifier
                );
                return (
                  <>
                    <button
                      className="text-[12px] text-textColor hover:underline"
                      onClick={() => setConfiguringProvider(provider.identifier)}
                    >
                      {p?.isConfigured ? t('edit', 'Edit') : t('configure', 'Configure')}
                    </button>
                    {!p?.isActive && p?.isConfigured && (
                      <button
                        className="text-[12px] text-textColor hover:underline"
                        onClick={() => handleSetActive(provider.identifier)}
                      >
                        {t('set_active', 'Set Active')}
                      </button>
                    )}
                  </>
                );
              }}
            />
          )}
        </div>
      )}

      {!error && subTab === 'templates' && <PromptTemplatesSection />}

      {!error && subTab === 'library' && <PromptLibrarySection />}
    </div>
  );
};

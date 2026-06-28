'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ShortlinkProviderForm } from '@gitroom/frontend/components/settings/shortlinks/shortlink-provider-form';
import {
  useShortlinksConfig,
  ShortlinkProviderInfo,
} from '@gitroom/frontend/components/settings/shortlinks/hooks/useShortlinksConfig';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';
import { useProviderCatalog } from '@gitroom/frontend/components/settings/shared/use-provider-catalog';

const CAPABILITY_LABELS: Record<string, string> = {
  create: 'Create links',
  expand: 'Expand links',
  statistics: 'Stats',
  bulkStatistics: 'Bulk stats',
  customDomain: 'Custom domain',
};

const CAPABILITY_COLORS: Record<string, string> = {
  create: 'bg-blue-500/20 text-blue-400',
  expand: 'bg-indigo-500/20 text-indigo-400',
  statistics: 'bg-purple-500/20 text-purple-400',
  bulkStatistics: 'bg-amber-500/20 text-amber-400',
  customDomain: 'bg-emerald-500/20 text-emerald-400',
};

export const ShortlinksTab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: config, isLoading, error, mutate } = useShortlinksConfig();
  const { data: catalog } = useProviderCatalog('shortlink');
  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [oauthProcessing, setOauthProcessing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state && !oauthProcessing) {
      setOauthProcessing(true);
      const storedIdentifier = sessionStorage.getItem('oauth_shortlink_provider');
      if (!storedIdentifier) {
        toaster.show(t('oauth_lost_context', 'Could not resume the connection — please retry.'), 'warning');
        setOauthProcessing(false);
        return;
      }
      const identifier = storedIdentifier;
      (async () => {
        try {
          const redirectUri = `${window.location.origin}/settings?tab=shortlinks`;
          const res = await fetch(`/settings/shortlinks/config/${identifier}/oauth/callback`, {
            method: 'POST',
            body: JSON.stringify({ code, state, redirectUri }),
          });
          if (res.ok) {
            toaster.show(t('oauth_success', 'Provider connected successfully'), 'success');
            mutate();
          } else {
            toaster.show(t('oauth_failure', 'OAuth connection failed'), 'warning');
          }
        } catch {
          toaster.show(t('oauth_failure', 'OAuth connection failed'), 'warning');
        } finally {
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          window.history.replaceState({}, '', url.toString());
          sessionStorage.removeItem('oauth_shortlink_provider');
          setOauthProcessing(false);
        }
      })();
    }
  }, [fetch, mutate, oauthProcessing, t, toaster]);

  const handleSetActive = useCallback(async (identifier: string) => {
    const res = await fetch(`/settings/shortlinks/config/${identifier}/set-active`, {
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
    if (!confirm(t('confirm_remove', 'Are you sure you want to remove this configuration?'))) return;
    const res = await fetch(`/settings/shortlinks/config/${identifier}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toaster.show(t('delete_failed', 'Failed to delete'), 'warning');
      return;
    }
    toaster.show(t('deleted', 'Configuration deleted'), 'success');
    mutate();
  }, [fetch, mutate, toaster, t]);

  const capabilityChips = (provider: ShortlinkProviderInfo) => {
    return Object.entries(provider.capabilities)
      .filter(([, supported]) => supported)
      .map(([key]) => CAPABILITY_LABELS[key] || key);
  };

  const sortedProviders = useMemo(() => {
    return [...(config?.providers || [])].sort((a, b) => {
      if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
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
      return true;
    });
  }, [sortedProviders, search]);

  const shellProviders = useMemo(
    () =>
      filteredProviders.map((p) => {
        const catalogEntry = catalog?.find(
          (e) => e.providerId === p.identifier && e.version === p.version
        );
        return {
          id: p.identifier,
          identifier: p.identifier,
          name: p.name,
          enabled: p.isConfigured,
          isActive: p.isActive,
          isConfigured: p.isConfigured,
          capabilities: capabilityChips(p),
          version: p.version,
          versionStatus: catalogEntry?.status ?? 'active',
          sunsetAt: catalogEntry?.sunsetAt,
        };
      }),
    [filteredProviders, catalog]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      {error && (
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">
            {t('failed_to_load', 'Failed to load shortlink settings')}
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
        <ShortlinkProviderForm
          identifier={configuringProvider}
          isConfigured={filteredProviders.find((p) => p.identifier === configuringProvider)?.isConfigured ?? false}
          initialVersion={filteredProviders.find((p) => p.identifier === configuringProvider)?.version}
          onClose={() => setConfiguringProvider(null)}
          onSaved={() => {
            setConfiguringProvider(null);
            mutate();
          }}
          onRemoved={() => {
            setConfiguringProvider(null);
            mutate();
          }}
        />
      ) : (
        <ProviderListShell
          title=""
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
            </div>
          }
          providers={shellProviders}
          onConfigure={(id) => setConfiguringProvider(id)}
          onSetActive={(id) => handleSetActive(id)}
          onRemove={(id) => handleDelete(id)}
          ProviderIconComponent={ProviderIcon}
          renderBadges={(provider) => {
            const p = filteredProviders.find((pr) => pr.identifier === provider.identifier);
            if (!p) return null;
            const chips = capabilityChips(p);
            return (
              <div className="flex gap-[4px] mt-[4px] flex-wrap items-center">
                {chips.map((cap) => {
                  const key = Object.keys(CAPABILITY_LABELS).find(
                    (k) => CAPABILITY_LABELS[k] === cap
                  ) || cap;
                  return (
                    <span
                      key={cap}
                      className={`text-[10px] rounded-[4px] px-[6px] py-[2px] ${
                        CAPABILITY_COLORS[key] || 'bg-newTableHeader text-newTableText'
                      }`}
                    >
                      {cap}
                    </span>
                  );
                })}
              </div>
            );
          }}
        />
      )}
    </div>
  );
};

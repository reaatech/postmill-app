'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ShortlinkProviderForm } from '@gitroom/frontend/components/settings/shortlinks/shortlink-provider-form';
import { useShortlinksConfig } from '@gitroom/frontend/components/settings/shortlinks/hooks/useShortlinksConfig';

export const ShortlinksTab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: config, isLoading, error, mutate } = useShortlinksConfig();
  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
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
            toaster.show(t('oauth_success', 'Bitly connected successfully'), 'success');
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
  }, []);

  const filteredProviders = useMemo(() => {
    const providers = config?.providers ?? [];
    if (!searchQuery) return providers;
    const q = searchQuery.toLowerCase();
    return providers.filter((p: any) =>
      p.name.toLowerCase().includes(q) || p.identifier.toLowerCase().includes(q)
    );
  }, [config, searchQuery]);

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
    if (!confirm(t('confirm_remove', 'Are you sure you want to remove this provider?'))) return;
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

  const capabilityChips = (provider: any) => {
    const chips = [];
    if (provider.capabilities.statistics) chips.push(t('stats', 'Stats'));
    if (provider.capabilities.customDomain) chips.push(t('custom_domain', 'Custom domain'));
    if (!provider.capabilities.create) chips.push(t('read_only', 'Read-only'));
    if (provider.capabilities.create && !provider.capabilities.statistics) chips.push(t('no_stats', 'No stats'));
    return chips;
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <h3 className="text-[20px]">{t('shortlinks', 'Shortlinks')}</h3>

      {error && (
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">{t('failed_to_load', 'Failed to load shortlink settings')}</span>
          <button
            className="text-[13px] bg-forth border border-tableBorder rounded-[4px] px-[16px] py-[8px] hover:bg-boxHover transition-colors"
            onClick={() => window.location.reload()}
          >
            {t('try_again', 'Try again')}
          </button>
        </div>
      )}

      {!error && configuringProvider ? (
        <ShortlinkProviderForm
          identifier={configuringProvider}
          onClose={() => setConfiguringProvider(null)}
          onSaved={() => {
            setConfiguringProvider(null);
            mutate();
          }}
        />
      ) : (
        <>
          {/* Active Provider Card */}
          <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col gap-[24px]">
            <div className="mt-[4px]">{t('active_provider', 'Active Provider')}</div>
            {isLoading ? (
              <div className="animate-pulse">{t('loading', 'Loading...')}</div>
            ) : config?.active ? (
              <div className="bg-forth border border-tableBorder rounded-[4px] p-[16px] flex items-center justify-between">
                <div className="flex flex-col gap-[4px]">
                  <span className="text-[14px] font-semibold">{config.active.name}</span>
                    {config.active.customDomain && (
                    <span className="text-[12px] text-newTableText">
                      {config.active.customDomain}
                    </span>
                  )}
                </div>
                <span className="text-[11px] bg-green-900/20 text-green-400 rounded-[4px] px-[8px] py-[2px]">
                  {t('active', 'Active')}
                </span>
              </div>
            ) : (
              <div className="bg-forth border border-tableBorder rounded-[4px] p-[16px]">
                <span className="text-[13px] text-newTableText">
                  {t('no_active_provider', 'No provider configured. Search and configure a provider below.')}
                </span>
              </div>
            )}
          </div>

          {/* Searchable Provider Dropdown */}
          <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col gap-[24px]">
            <div className="mt-[4px]">{t('all_providers', 'All Providers')}</div>

            {/* Search input - native combobox */}
            <div className="relative">
              <input
                type="text"
                className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px] w-full"
                placeholder={t('search_providers', 'Search providers...')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              />
              {showDropdown && filteredProviders.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-[4px] bg-forth border border-tableBorder rounded-[4px] max-h-[300px] overflow-y-auto shadow-lg">
                  {filteredProviders.map((provider: any) => (
                    <button
                      key={provider.identifier}
                      className="w-full text-left px-[12px] py-[10px] hover:bg-boxHover flex items-center justify-between gap-[8px] border-b border-tableBorder last:border-b-0"
                      onMouseDown={() => {
                        setConfiguringProvider(provider.identifier);
                        setShowDropdown(false);
                        setSearchQuery('');
                      }}
                    >
                      <span className="text-[13px] font-medium">{provider.name}</span>
                      <div className="flex gap-[4px]">
                        {capabilityChips(provider).map((chip: string) => (
                          <span
                            key={chip}
                            className="text-[10px] bg-newTableText/20 text-newTableText rounded-[2px] px-[4px] py-[1px]"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Provider list */}
            {isLoading ? (
              <div className="animate-pulse">{t('loading', 'Loading...')}</div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {filteredProviders.map((provider: any) => (
                  <div
                    key={provider.identifier}
                    className="bg-forth border border-tableBorder rounded-[4px] p-[16px] flex items-center justify-between"
                  >
                    <div className="flex flex-col gap-[4px] flex-1">
                      <div className="flex items-center gap-[8px]">
                        <span className="text-[14px] font-semibold">{provider.name}</span>
                        {provider.isActive && (
                          <span className="text-[11px] bg-green-900/20 text-green-400 rounded-[4px] px-[8px] py-[2px]">
                            {t('active', 'Active')}
                          </span>
                        )}
                        {provider.isConfigured && !provider.isActive && (
                          <span className="text-[11px] bg-blue-900/20 text-blue-400 rounded-[4px] px-[8px] py-[2px]">
                            {t('configured', 'Configured')}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-[4px] mt-[4px]">
                        {capabilityChips(provider).map((chip: string) => (
                          <span
                            key={chip}
                            className="text-[10px] bg-newTableText/20 text-newTableText rounded-[2px] px-[4px] py-[1px]"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-[8px]">
                      <button
                        className="text-[12px] text-btnPrimary hover:underline"
                        onClick={() => setConfiguringProvider(provider.identifier)}
                      >
                        {provider.isConfigured ? t('edit', 'Edit') : t('configure', 'Configure')}
                      </button>
                      {!provider.isActive && provider.isConfigured && (
                        <button
                          className="text-[12px] text-btnPrimary hover:underline"
                          onClick={() => handleSetActive(provider.identifier)}
                        >
                          {t('set_active', 'Set Active')}
                        </button>
                      )}
                      {provider.isConfigured && (
                        <button
                          className="text-[12px] text-red-500 hover:underline"
                          onClick={() => handleDelete(provider.identifier)}
                        >
                          {t('remove', 'Remove')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredProviders.length === 0 && (
                  <div className="text-[12px] text-newTableText">
                    {t('no_providers', searchQuery ? 'No providers match your search' : 'No providers found')}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

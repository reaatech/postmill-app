'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ShortlinkProviderForm } from '@gitroom/frontend/components/settings/shortlinks/shortlink-provider-form';
import { useShortlinksConfig } from '@gitroom/frontend/components/settings/shortlinks/hooks/useShortlinksConfig';
import ShortlinkPreferenceComponent from '@gitroom/frontend/components/settings/shortlink-preference.component';

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

  const PROVIDER_BRANDS: Record<string, { color: string; shortName: string }> = {
    bitly: { color: '#EE6123', shortName: 'Bi' },
    blink: { color: '#1B73E8', shortName: 'BL' },
    tly: { color: '#4361EE', shortName: 'TL' },
    replug: { color: '#4361EE', shortName: 'Re' },
    owly: { color: '#00A86B', shortName: 'Ow' },
    dub: { color: '#18181B', shortName: 'Du' },
    shortio: { color: '#F97316', shortName: 'Sh' },
    linkly: { color: '#2563EB', shortName: 'Li' },
    isgd: { color: '#059669', shortName: 'is' },
    tinycc: { color: '#DC2626', shortName: 'TC' },
    sniply: { color: '#4361EE', shortName: 'Sn' },
    cleanuri: { color: '#0891B2', shortName: 'Cl' },
    rebrandly: { color: '#2563EB', shortName: 'Rb' },
    tinyurl: { color: '#0284C7', shortName: 'TU' },
    pixelme: { color: '#2563EB', shortName: 'Px' },
    t2m: { color: '#475569', shortName: 'T2' },
    vgd: { color: '#15803D', shortName: 'vg' },
    cuttly: { color: '#B45309', shortName: 'Cu' },
    switchy: { color: '#4361EE', shortName: 'Sw' },
  };

  const ProviderIcon = ({ identifier, name }: { identifier: string; name: string }) => {
    const [imgError, setImgError] = useState(false);
    const brand = PROVIDER_BRANDS[identifier];
    const src = `/icons/shortlinks/${identifier}.png`;
    if (!imgError) {
      return (
        <img
          className="w-[48px] h-[48px] rounded-[8px] object-contain"
          src={src}
          alt={name}
          onError={() => setImgError(true)}
        />
      );
    }
    if (brand) {
      return (
        <div
          className="w-[48px] h-[48px] rounded-[8px] flex items-center justify-center text-white text-[16px] font-semibold shrink-0"
          style={{ backgroundColor: brand.color }}
        >
          {brand.shortName}
        </div>
      );
    }
    return (
      <div className="w-[48px] h-[48px] rounded-[8px] bg-blue-500 flex items-center justify-center text-white text-[20px] font-semibold shrink-0">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

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

      <ShortlinkPreferenceComponent />

      {error && (
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">{t('failed_to_load', 'Failed to load shortlink settings')}</span>
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
          onClose={() => setConfiguringProvider(null)}
          onSaved={() => {
            setConfiguringProvider(null);
            mutate();
          }}
        />
      ) : (
        <>
          {/* Active Provider Card */}
          <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[24px]">
            <div className="mt-[4px]">{t('active_provider', 'Active Provider')}</div>
            {isLoading ? (
              <div className="animate-pulse">{t('loading', 'Loading...')}</div>
            ) : config?.active ? (
              <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px] flex items-center gap-[12px]">
                <ProviderIcon identifier={config.active.identifier} name={config.active.name} />
                <div className="flex flex-col gap-[4px] flex-1">
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
              <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px]">
                <span className="text-[13px] text-newTableText">
                  {t('no_active_provider', 'No provider configured. Search and configure a provider below.')}
                </span>
              </div>
            )}
          </div>

          {/* Searchable Provider Dropdown */}
          <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[24px]">
            <div className="mt-[4px]">{t('all_providers', 'All Providers')}</div>

            {/* Search input - native combobox */}
            <div className="relative">
              <input
                type="text"
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px] w-full"
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
                <div className="absolute z-50 top-full left-0 right-0 mt-[4px] bg-newBgColorInner border border-newTableBorder rounded-[8px] max-h-[300px] overflow-y-auto shadow-lg">
                  {filteredProviders.map((provider: any) => (
                    <button
                      key={provider.identifier}
                      className="w-full text-left px-[12px] py-[10px] hover:bg-boxHover flex items-center gap-[8px] border-b border-newTableBorder last:border-b-0"
                      onMouseDown={() => {
                        setConfiguringProvider(provider.identifier);
                        setShowDropdown(false);
                        setSearchQuery('');
                      }}
                    >
                      <ProviderIcon identifier={provider.identifier} name={provider.name} />
                      <span className="text-[13px] font-medium flex-1">{provider.name}</span>
                      <div className="flex gap-[4px] shrink-0">
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
                    className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px] flex items-center gap-[12px]"
                  >
                    <ProviderIcon identifier={provider.identifier} name={provider.name} />
                    <div className="flex flex-col gap-[4px] flex-1 min-w-0">
                      <div className="flex items-center gap-[8px]">
                        <span className="text-[14px] font-semibold truncate">{provider.name}</span>
                        {provider.isActive && (
                          <span className="text-[11px] bg-green-900/20 text-green-400 rounded-[4px] px-[8px] py-[2px] shrink-0">
                            {t('active', 'Active')}
                          </span>
                        )}
                        {provider.isConfigured && !provider.isActive && (
                          <span className="text-[11px] bg-blue-900/20 text-blue-400 rounded-[4px] px-[8px] py-[2px] shrink-0">
                            {t('configured', 'Configured')}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-[4px] mt-[4px] flex-wrap">
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
                    <div className="flex items-center gap-[8px] shrink-0">
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

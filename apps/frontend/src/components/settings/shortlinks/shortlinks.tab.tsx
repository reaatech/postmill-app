'use client';

import React, { useCallback, useEffect, useState } from 'react';
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

export const ShortlinksTab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: config, isLoading, error, mutate } = useShortlinksConfig();
  const [configuringProvider, setConfiguringProvider] = useState<{ identifier: string; configId?: string } | null>(null);
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

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t('confirm_remove', 'Are you sure you want to remove this configuration?'))) return;
    const res = await fetch(`/settings/shortlinks/config/${id}`, {
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
          identifier={configuringProvider.identifier}
          onClose={() => setConfiguringProvider(null)}
          onSaved={() => {
            setConfiguringProvider(null);
            mutate();
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
                <ProviderIcon identifier={config.active.identifier} name={config.active.name} size={32} />
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
              <div className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px]">
                <span className="text-[13px] text-newTableText">
                  {t('no_active_provider', 'No provider configured. Configure a provider below.')}
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
              enabled: p.enabled,
              isActive: p.isActive,
              isConfigured: p.isConfigured,
              capabilities: capabilityChips(p),
            }))}
            onConfigure={(id) => setConfiguringProvider({ identifier: id })}
            onSetActive={(id) => handleSetActive(id)}
            onRemove={(id) => {
              const p = (config?.providers || []).find((pr) => pr.identifier === id);
              if (p?.configs?.[0]?.id) {
                handleDelete(p.configs[0].id);
              }
            }}
            ProviderIconComponent={ProviderIcon}
            renderBadges={(provider) => {
              const p = (config?.providers || []).find((pr) => pr.identifier === provider.identifier);
              if (!p) return null;
              const chips = capabilityChips(p);
              return (
                <div className="flex flex-col gap-[4px]">
                  {chips.length > 0 && (
                    <div className="flex gap-[4px] flex-wrap">
                      {chips.map((chip: string) => (
                        <span
                          key={chip}
                          className="text-[10px] bg-newTableText/20 text-newTableText rounded-[2px] px-[4px] py-[1px]"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.configs?.length > 0 && (
                    <div className="flex flex-col gap-[4px] mt-[4px]">
                      {p.configs.map((cfg) => (
                        <div
                          key={cfg.id}
                          className="bg-newBgColorInner border border-newTableBorder/50 rounded-[6px] px-[12px] py-[6px] flex items-center justify-between"
                        >
                          <div className="flex items-center gap-[8px]">
                            <span className="text-[12px] text-textColor">
                              {cfg.name || p.name}
                            </span>
                            {cfg.isActive && (
                              <span className="text-[10px] bg-green-900/20 text-green-400 rounded-[2px] px-[4px] py-[1px]">
                                {t('active', 'Active')}
                              </span>
                            )}
                            {cfg.customDomain && (
                              <span className="text-[11px] text-newTableText">
                                {cfg.customDomain}
                              </span>
                            )}
                          </div>
                          <button
                            className="text-[11px] text-red-500 hover:underline"
                            onClick={() => handleDelete(cfg.id)}
                          >
                            {t('remove', 'Remove')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
            renderActions={(provider) => {
              const p = (config?.providers || []).find((pr) => pr.identifier === provider.identifier);
              if (!p) return null;
              return (
                <>
                  <button
                    className="text-[12px] text-btnPrimary hover:underline"
                    onClick={() => setConfiguringProvider({ identifier: p.identifier })}
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
                </>
              );
            }}
          />
        </>
      )}
    </div>
  );
};

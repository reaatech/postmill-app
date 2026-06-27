'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';
import ProviderListShell from '@gitroom/frontend/components/settings/shared/provider-list-shell';
import { useVpnConfig, VpnProviderInfo } from './hooks/useVpnConfig';
import { VpnProviderForm } from './vpn-provider-form';

const CAPABILITY_LABELS: Record<string, string> = {
  wireguard: 'WireGuard',
  openvpn: 'OpenVPN',
  ikev2: 'IKEv2',
  socks5: 'SOCKS5',
  multiHop: 'Multi-hop',
  killSwitch: 'Kill switch',
};

const CAPABILITY_COLORS: Record<string, string> = {
  wireguard: 'bg-cyan-500/20 text-cyan-400',
  openvpn: 'bg-blue-500/20 text-blue-400',
  ikev2: 'bg-indigo-500/20 text-indigo-400',
  socks5: 'bg-amber-500/20 text-amber-400',
  multiHop: 'bg-purple-500/20 text-purple-400',
  killSwitch: 'bg-emerald-500/20 text-emerald-400',
};

export const VpnTab = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: config, isLoading, error, mutate } = useVpnConfig();
  const [configuringProvider, setConfiguringProvider] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const handleDelete = useCallback(async (identifier: string) => {
    if (!confirm(t('confirm_remove', 'Are you sure you want to remove this configuration?'))) return;
    const res = await fetch(`/settings/vpn/config/${identifier}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toaster.show(t('delete_failed', 'Failed to delete'), 'warning');
      return;
    }
    toaster.show(t('deleted', 'Configuration deleted'), 'success');
    mutate();
  }, [fetch, mutate, toaster, t]);

  const capabilityChips = (provider: VpnProviderInfo) => {
    return Object.entries(provider.capabilities)
      .filter(([, supported]) => supported)
      .map(([key]) => CAPABILITY_LABELS[key] || key);
  };

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
      return true;
    });
  }, [sortedProviders, search]);

  const shellProviders = useMemo(
    () =>
      filteredProviders.map((p) => ({
        id: p.identifier,
        identifier: p.identifier,
        name: p.name,
        enabled: p.enabled && p.isConfigured,
        isConfigured: p.isConfigured,
        capabilities: capabilityChips(p),
      })),
    [filteredProviders]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      {error && (
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">
            {t('failed_to_load_vpn_settings', 'Failed to load VPN settings')}
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
        <VpnProviderForm
          identifier={configuringProvider}
          onClose={() => setConfiguringProvider(null)}
          onSaved={() => {
            setConfiguringProvider(null);
            mutate();
          }}
        />
      ) : (
        <ProviderListShell
          title={t('vpn_providers', 'VPN Providers')}
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
          renderActions={(provider) => {
            const p = filteredProviders.find((pr) => pr.identifier === provider.identifier);
            return (
              <button
                className="text-[12px] text-textColor hover:underline"
                onClick={() => setConfiguringProvider(provider.identifier)}
              >
                {p?.isConfigured ? t('edit', 'Edit') : t('configure', 'Configure')}
              </button>
            );
          }}
        />
      )}
    </div>
  );
};

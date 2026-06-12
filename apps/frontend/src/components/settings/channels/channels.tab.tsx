'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ChannelEditModal } from './channel-edit.modal';
import { ProviderCapabilitiesPanel } from './provider-capabilities.panel';
import { DataTable, StatusPill } from '@gitroom/frontend/components/ui/data-table';
import type { Column } from '@gitroom/frontend/components/ui/data-table';
import SafeImage from '@gitroom/react/helpers/safe.image';

interface ChannelHealthItem {
  id: string;
  name: string;
  provider: string;
  picture: string | null;
  disabled: boolean;
  configured: boolean;
  providerEnabled: boolean;
  tokenExpired: boolean;
  refreshNeeded: boolean;
}

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
}

const useConfigs = () => {
  const fetch = useFetch();
  return useSWR<ProviderConfigItem[]>('/channels/config', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const useHealth = () => {
  const fetch = useFetch();
  return useSWR<ChannelHealthItem[]>('/channels/config/health', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

const ProviderIcon: FC<{ identifier: string; name: string }> = ({ identifier, name }) => {
  const src = identifier === 'youtube'
    ? '/icons/platforms/youtube.svg'
    : `/icons/platforms/${identifier}.png`;

  return (
    <SafeImage
      className="w-[28px] h-[28px] rounded-full"
      src={src}
      alt={name}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
};

const StatusBadge: FC<{ enabled: boolean; isConfigured: boolean }> = ({ enabled, isConfigured }) => {
  const label = enabled && isConfigured ? 'Active' : enabled ? 'No Credentials' : 'Disabled';
  const colorClass = enabled && isConfigured
    ? 'bg-green-500/10 text-green-500'
    : enabled
    ? 'bg-yellow-500/10 text-yellow-500'
    : 'bg-red-500/10 text-red-500';

  return <span className={`text-[12px] px-[8px] py-[2px] rounded-full ${colorClass}`}>{label}</span>;
};

export const ChannelsTab: FC = () => {
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: configs, isLoading, error, mutate } = useConfigs();
  const { data: health } = useHealth();
  const [editingIdentifier, setEditingIdentifier] = useState<string | null>(null);

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

  const configsList = configs || [];

  return (
    <div className="flex flex-col gap-[16px]">
      <div>
        <h2 className="text-[18px] font-[600]">Channel Credentials</h2>
        <p className="text-[13px] text-textColor/60 mt-[4px]">
          Configure your own OAuth app credentials for each social channel. These credentials are
          used when connecting channels to your organization.
        </p>
      </div>

      {configsList.length === 0 ? (
        <div className="text-textColor/50 text-[14px] py-[40px] text-center">
          No channel configurations found.
        </div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {configsList.filter((c) => !c.isExternal && !c.isWeb3 && !c.isChromeExtension).map((config) => (
            <div
              key={config.identifier}
              className="flex flex-col bg-newTableHeader rounded-[8px]"
            >
              <div
                className="w-full flex items-center gap-[12px] p-[12px] cursor-pointer hover:bg-newTableHeader/80"
                onClick={() => setEditingIdentifier(
                  editingIdentifier === config.identifier ? null : config.identifier
                )}
              >
                <ProviderIcon identifier={config.identifier} name={config.name} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-[500] text-textColor">{config.name}</div>
                  <div className="text-[12px] text-textColor/60 truncate">{config.description}</div>
                </div>
                <div className="flex items-center gap-[8px] shrink-0">
                  <StatusBadge enabled={config.enabled} isConfigured={config.isConfigured} />
                  <span className="text-[12px] text-textColor font-[500]">
                    {editingIdentifier === config.identifier ? 'Close' : 'Edit'}
                  </span>
                </div>
              </div>

              {editingIdentifier === config.identifier && (
                <div className="px-[12px] pb-[12px]">
                  <ChannelEditModal
                    identifier={config.identifier}
                    name={config.name}
                    enabled={config.enabled}
                    scopes={config.scopes}
                    redirectUri={config.redirectUri}
                    setupNotes={config.setupNotes}
                    isConfigured={config.isConfigured}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onTest={handleTestConnection}
                    onClose={() => setEditingIdentifier(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ProviderCapabilitiesPanel />

      {health && health.length > 0 && (
        <div className="flex flex-col gap-[12px] mt-[8px]">
          <div className="border-t border-newTableBorder pt-[16px]">
            <h3 className="text-[15px] font-[600] text-textColor mb-[4px]">
              Connection Status
            </h3>
            <p className="text-[13px] text-textColor/60 mb-[12px]">
              Overview of your connected channels and their authentication status.
            </p>
            <DataTable
              columns={[
                {
                  key: 'channel',
                  header: 'Channel',
                  render: (item: ChannelHealthItem) => (
                    <div className="flex items-center gap-[8px]">
                      {item.picture && (
                        <SafeImage className="w-[22px] h-[22px] rounded-full" src={item.picture} alt={item.name} />
                      )}
                      <span className="font-[500] text-textColor">{item.name}</span>
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (item: ChannelHealthItem) => {
                    const map = item.disabled ? 'red' : item.tokenExpired ? 'red' : item.refreshNeeded ? 'amber' : 'green' as const;
                    const label = item.disabled ? 'Disabled' : item.tokenExpired ? 'Token Expired' : item.refreshNeeded ? 'Refresh Needed' : 'Connected';
                    return <StatusPill status={map} label={label} />;
                  },
                },
                {
                  key: 'details',
                  header: 'Details',
                  render: (item: ChannelHealthItem) => {
                    let text = '';
                    if (!item.configured) text = 'Provider not configured';
                    else if (!item.providerEnabled) text = 'Provider disabled in settings';
                    else if (item.tokenExpired) text = 'Token expired, reconnect needed';
                    else if (item.refreshNeeded) text = 'Token refresh required';
                    else text = 'Healthy';
                    return <span className="text-textColor/60 text-[12px]">{text}</span>;
                  },
                },
                {
                  key: 'action',
                  header: 'Action',
                  render: (item: ChannelHealthItem) =>
                    (item.tokenExpired || item.refreshNeeded) ? (
                      <a href={`/integrations/social/${item.provider}?refresh=${item.id}`} className="text-[12px] text-textColor font-[500] hover:underline">
                        Reconnect
                      </a>
                    ) : null,
                },
              ]}
              data={health}
              keyExtractor={(item: ChannelHealthItem) => item.id}
            />
          </div>
        </div>
      )}
    </div>
  );
};

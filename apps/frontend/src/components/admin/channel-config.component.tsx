'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

interface ProviderConfigItem {
  identifier: string;
  name: string;
  description: string;
  enabled: boolean;
  isConfigured: boolean;
  hasApiKey: boolean;
  setupInstructions: string;
  isExternal: boolean;
  isWeb3: boolean;
  isChromeExtension: boolean;
  customFields: boolean;
  scopes: string;
}

const useConfigs = () => {
  const fetch = useFetch();
  return useSWR<ProviderConfigItem[]>('/admin/channel-configs', (url: string) =>
    fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

interface SingleConfigResponse {
  identifier: string;
  name: string;
  enabled: boolean;
  redirectUri: string;
  scopes: string;
  setupInstructions: string;
  isConfigured: boolean;
}

const useSingleConfig = (identifier: string | null) => {
  const fetch = useFetch();
  return useSWR<SingleConfigResponse>(
    identifier ? `/admin/channel-configs/${identifier}` : null,
    (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  );
};

interface EditFormData {
  identifier: string;
  name: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  setupInstructions: string;
}

const statusBadge = (isConfigured: boolean) => (
  isConfigured
    ? <span className="text-green-500 text-[12px]">Configured</span>
    : <span className="text-textColor/50 text-[12px]">Not set</span>
);

const EditForm: FC<{
  data: EditFormData;
  onSave: (data: EditFormData, touched: Set<string>) => void;
  onClose: () => void;
  hasExistingCredentials: boolean;
}> = ({ data, onSave, onClose, hasExistingCredentials }) => {
  const [form, setForm] = useState<EditFormData>(data);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    setForm({
      ...data,
      clientId: data.clientId ?? '',
      clientSecret: data.clientSecret ?? '',
      redirectUri: data.redirectUri || '',
      scopes: data.scopes || '',
      setupInstructions: data.setupInstructions || '',
    });
    setTouched(new Set());
  }, [data.identifier, data.name, data.enabled, data.clientId, data.clientSecret, data.redirectUri, data.scopes, data.setupInstructions]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(form, touched);
    } finally {
      setSaving(false);
    }
  }, [form, touched, onSave]);

  const fetch = useFetch();
  const { mutate: globalMutate } = useSWRConfig();
  const toaster = useToaster();

  const update = (key: keyof EditFormData, value: any) => {
    setTouched((prev) => new Set(prev).add(key));
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggleEnabled = async (newValue: boolean) => {
    update('enabled', newValue);
    try {
      const res = await fetch(`/admin/channel-configs/${data.identifier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue }),
      });
      if (!res.ok) throw new Error('Failed');
      globalMutate('/admin/channel-configs');
    } catch {
      update('enabled', !newValue);
      toaster.show('Failed to update channel status', 'warning');
    }
  };

  const credentialPlaceholder = hasExistingCredentials
    ? 'Already configured'
    : '';

  return (
    <div className="flex flex-col gap-[12px] p-[16px] rounded-[8px] bg-sixth border border-customColor6">
      <div className="flex items-center gap-[8px]">
        <label className="text-[14px] font-[500] w-[120px]">Available to users</label>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => handleToggleEnabled(e.target.checked)}
          className="w-[18px] h-[18px]"
        />
      </div>

      <div className="flex flex-col gap-[6px]">
        <div className="text-[14px] flex items-center gap-[6px]">
          <span>Client ID / API Key</span>
          {statusBadge(!!form.clientId)}
        </div>
        <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor flex items-center justify-center">
          <input
            className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor placeholder-textColor px-[16px]"
            placeholder={credentialPlaceholder}
            value={form.clientId}
            onChange={(e) => update('clientId', e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-[6px]">
        <div className="text-[14px] flex items-center gap-[6px]">
          <span>Client Secret / API Secret</span>
          {statusBadge(!!form.clientSecret)}
        </div>
        <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor flex items-center justify-center">
          <input
            type="password"
            className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor placeholder-textColor px-[16px]"
            placeholder={credentialPlaceholder}
            value={form.clientSecret}
            onChange={(e) => update('clientSecret', e.target.value)}
          />
        </div>
      </div>

      <Input
        label="Redirect URI (optional)"
        name="redirectUri_edit"
        disableForm={true}
        value={form.redirectUri}
        onChange={(e) => update('redirectUri', e.target.value)}
      />
      <Input
        label="Scopes (comma separated, optional)"
        name="scopes_edit"
        disableForm={true}
        value={form.scopes}
        onChange={(e) => update('scopes', e.target.value)}
      />
      <div className="flex flex-col gap-[4px]">
        <label className="text-[14px] font-[500]">
          Setup Instructions
        </label>
        <textarea
          value={form.setupInstructions}
          onChange={(e) => update('setupInstructions', e.target.value)}
          className="p-[8px] rounded-[4px] border border-tableBorder bg-bgInput text-textColor min-h-[120px] text-[14px]"
          rows={5}
          placeholder="Provide instructions for how to set up this channel (e.g., creating an app on the platform, getting API keys, etc.)"
        />
      </div>
      <div className="flex gap-[8px] justify-end">
        <Button
          type="button"
          className="!bg-transparent border border-tableBorder text-textColor"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          Save
        </Button>
      </div>
    </div>
  );
};

const useSaveConfig = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  return useCallback(
    async (identifier: string, data: Record<string, any>) => {
      try {
        const res = await fetch(`/admin/channel-configs/${identifier}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          toaster.show('Channel config saved', 'success');
          return true;
        }
        toaster.show('Failed to save channel config', 'warning');
        return false;
      } catch (err) {
        toaster.show('Network error while saving', 'warning');
        return false;
      }
    },
    [fetch, toaster]
  );
};

const ExpandedRow: FC<{
  config: ProviderConfigItem;
  onSave: (data: EditFormData, touched: Set<string>) => void;
  onClose: () => void;
}> = ({ config, onSave, onClose }) => {
  const { data: singleConfig, isLoading, error } = useSingleConfig(config.identifier);

  const formData: EditFormData = {
    identifier: config.identifier,
    name: config.name,
    enabled: singleConfig?.enabled ?? config.enabled,
    clientId: '',
    clientSecret: '',
    redirectUri: singleConfig?.redirectUri || '',
    scopes: singleConfig?.scopes || config.scopes || '',
    setupInstructions:
      singleConfig?.setupInstructions || config.setupInstructions || '',
  };

  if (isLoading && !singleConfig) {
    return (
      <div className="px-[12px] pb-[12px] text-textColor/50">
        Loading...
      </div>
    );
  }

  return (
    <div className="px-[12px] pb-[12px]">
      <EditForm
        data={formData}
        onSave={onSave}
        onClose={onClose}
        hasExistingCredentials={singleConfig?.isConfigured ?? config.isConfigured}
      />
    </div>
  );
};

export const ChannelConfigComponent: FC = () => {
  const user = useUser();
  const { data: configs, isLoading, error, mutate } = useConfigs();
  const { mutate: globalMutate } = useSWRConfig();
  const saveConfig = useSaveConfig();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-[12px] py-[40px]">
        <div className="text-red-500 text-[14px]">
          Failed to load channel configurations: {error.message || 'Unknown error'}
        </div>
        <Button onClick={() => mutate()}>Retry</Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-textColor text-[14px]">Loading...</div>
    );
  }

  if (!user.isSuperAdmin) {
    return (
      <div className="text-textColor text-[14px]">
        You do not have permission to access this page.
      </div>
    );
  }

  if (isLoading) {
    return <LoadingComponent />;
  }

  const configsList = configs || [];

  const handleSave = async (formData: EditFormData, touched: Set<string>) => {
    const payload: Record<string, any> = {
      enabled: formData.enabled,
    };

    if (touched.has('clientId')) {
      payload.clientId = formData.clientId?.trim() || null;
    }
    if (touched.has('clientSecret')) {
      payload.clientSecret = formData.clientSecret?.trim() || null;
    }
    if (touched.has('redirectUri')) {
      payload.redirectUri = formData.redirectUri || null;
    }
    if (touched.has('scopes')) {
      payload.scopes = formData.scopes || null;
    }
    if (touched.has('setupInstructions')) {
      payload.setupInstructions = formData.setupInstructions || null;
    }

    const success = await saveConfig(formData.identifier, payload);
    if (success) {
      setExpanded(null);
      globalMutate('/admin/channel-configs');
      globalMutate(`/admin/channel-configs/${formData.identifier}`);
    }
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-[600] text-textColor">
            Channel Configuration
          </h1>
          <p className="text-[14px] text-textColor/70 mt-[4px]">
            Configure which social channels are available and set their API
            credentials. Channels must be enabled and have credentials set before
            users can connect them.
          </p>
        </div>
      </div>

      {configsList.length === 0 ? (
        <div className="text-textColor/50 text-[14px] py-[40px] text-center">
          No channel configurations found.
        </div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {configsList.map((config) => {
            const isExpanded = expanded === config.identifier;
            return (
              <div
                key={config.identifier}
                className="flex flex-col bg-newTableHeader rounded-[8px]"
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  className="w-full text-start flex items-center gap-[12px] p-[12px] cursor-pointer hover:bg-newTableHeader/80"
                  onClick={() =>
                    setExpanded(
                      isExpanded ? null : config.identifier
                    )
                  }
                >
                  {config.identifier === 'youtube' ? (
                    <img
                      className="w-[28px] h-[28px]"
                      src="/icons/platforms/youtube.svg"
                    />
                  ) : (
                    <img
                      className="w-[28px] h-[28px] rounded-full"
                      src={`/icons/platforms/${config.identifier}.png`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex-1">
                    <div className="text-[14px] font-[500] text-textColor">
                      {config.name}
                    </div>
                    <div className="text-[12px] text-textColor/60">
                      {config.identifier}
                    </div>
                  </div>
                  <div className="flex items-center gap-[8px]">
                    <span
                      className={`text-[12px] px-[8px] py-[2px] rounded-full ${
                        config.enabled && config.isConfigured
                          ? 'bg-green-500/10 text-green-500'
                          : config.enabled
                          ? 'bg-yellow-500/10 text-yellow-500'
                          : 'bg-red-500/10 text-red-500'
                      }`}
                    >
                      {config.enabled && config.isConfigured
                        ? 'Active'
                        : config.enabled
                        ? 'No Credentials'
                        : 'Disabled'}
                    </span>
                    <span className="text-[12px] text-forth font-[500]">
                      {isExpanded ? 'Close' : 'Edit'}
                    </span>
                    <span className="text-textColor/40">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <ExpandedRow
                    config={config}
                    onSave={handleSave}
                    onClose={() => setExpanded(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

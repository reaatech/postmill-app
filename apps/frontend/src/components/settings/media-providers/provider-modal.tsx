'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface ProviderDetail {
  identifier: string;
  name: string;
  capabilities: { image: boolean; video: boolean; audio: boolean; avatar: boolean };
  isConfigured: boolean;
  enabled: boolean;
}

interface ProviderListItem {
  identifier: string;
  name: string;
  capabilities: ProviderDetail['capabilities'];
}

interface ProviderConfigItem {
  identifier: string;
  isConfigured: boolean;
  enabled: boolean;
}

interface ProviderModalProps {
  identifier: string;
  onClose: () => void;
  onSaved: () => void;
}

export const ProviderModal = ({ identifier, onClose, onSaved }: ProviderModalProps) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [providersRes, configRes] = await Promise.all([
          fetch('/settings/media/providers'),
          fetch('/settings/media/config'),
        ]);
        if (providersRes.ok) {
          const providers: ProviderListItem[] = await providersRes.json();
          const match = providers.find((p) => p.identifier === identifier);
          if (match) {
            setProvider({
              identifier: match.identifier,
              name: match.name,
              capabilities: match.capabilities,
              isConfigured: false,
              enabled: false,
            });
          }
        }
        if (configRes.ok) {
          const configData: { providers?: ProviderConfigItem[] } =
            await configRes.json();
          const cfg = (configData.providers || []).find(
            (p) => p.identifier === identifier
          );
          if (cfg) {
            setProvider((prev) => prev ? { ...prev, isConfigured: cfg.isConfigured, enabled: cfg.enabled } : prev);
          }
        }
      } catch {
        toaster.show('Failed to load provider details', 'warning');
      } finally {
        setLoading(false);
      }
    })();
  }, [identifier, fetch, toaster]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch(`/settings/media/config/${identifier}`, {
        method: 'PUT',
        body: JSON.stringify({
          credentials: apiKey ? { apiKey } : undefined,
        }),
      });
      if (!res.ok) {
        toaster.show('Failed to save provider configuration', 'warning');
        return;
      }
      toaster.show(t('provider_saved', 'Provider configuration saved'), 'success');
      onSaved();
      onClose();
    } catch {
      toaster.show('Failed to save provider configuration', 'warning');
    } finally {
      setSaving(false);
    }
  }, [identifier, apiKey, fetch, toaster, t, onSaved, onClose]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body: any = {};
      if (apiKey) {
        body.credentials = { apiKey };
      }
      const res = await fetch(`/settings/media/config/${identifier}/test`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestResult({ success: data.ok, message: data.message || (res.ok ? 'Connection successful' : 'Connection failed') });
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  }, [identifier, apiKey, fetch]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]">
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[24px] w-[480px] max-w-[90vw]">
          <div className="animate-pulse">{t('loading', 'Loading...')}</div>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]">
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[24px] w-[480px] max-w-[90vw]">
          <div className="text-[14px]">{t('provider_not_found', 'Provider not found')}</div>
          <button
            className="mt-[16px] text-[13px] text-textColor hover:underline"
            onClick={onClose}
          >
            {t('close', 'Close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]">
      <div className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[24px] w-[480px] max-w-[90vw] flex flex-col gap-[20px]">
        <div className="flex items-center justify-between">
          <div className="text-[16px] font-semibold">{provider.name}</div>
          <button
            className="text-newTableText hover:text-textColor text-[20px] leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[4px]">
            <label className="text-[13px] text-newTableText">
              API Key <span className="text-red-500 ml-[2px]">*</span>
            </label>
            <input
              className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>

        {testResult && (
          <div
            className={`text-[13px] rounded-[4px] p-[8px] ${
              testResult.success
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {testResult.message}
          </div>
        )}

        <div className="flex items-center justify-between gap-[12px]">
          <button
            className="text-[13px] px-[12px] py-[6px] rounded-[8px] border border-newTableBorder hover:bg-boxHover"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? t('testing', 'Testing...') : t('test_connection', 'Test Connection')}
          </button>
          <div className="flex gap-[8px]">
            <button
              className="text-[13px] px-[12px] py-[6px] rounded-[8px] border border-newTableBorder hover:bg-boxHover"
              onClick={onClose}
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[6px] text-[13px] hover:opacity-90 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? t('saving', 'Saving...') : t('save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

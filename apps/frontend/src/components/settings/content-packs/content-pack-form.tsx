'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useContentPackProviders } from './hooks/useContentPacksConfig';
import ProviderIcon from '@gitroom/frontend/components/shared/provider-icon';

interface ContentPackFormProps {
  identifier: string;
  onClose: () => void;
  onSaved: () => void;
}

export const ContentPackForm: React.FC<ContentPackFormProps> = ({
  identifier,
  onClose,
  onSaved,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: providers } = useContentPackProviders();
  const provider = providers?.find((p) => p.identifier === identifier);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/settings/content-packs/config/${identifier}/test`, {
        method: 'POST',
        body: JSON.stringify({ credentials: { apiKey } }),
      });
      const data = await res.json().catch(() => ({ ok: false, message: 'Unknown error' }));
      setTestResult(data.ok ? 'success' : 'failure');
      if (data.ok) {
        toaster.show(t('connection_successful', 'Connection successful'), 'success');
      } else {
        toaster.show(
          t('connection_failed', 'Connection failed') +
            (data.message ? `: ${data.message}` : ''),
          'warning'
        );
      }
    } catch {
      setTestResult('failure');
      toaster.show(t('connection_failed', 'Connection failed'), 'warning');
    } finally {
      setTesting(false);
    }
  }, [identifier, apiKey, fetch, toaster, t]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/settings/content-packs/config/${identifier}`, {
        method: 'PUT',
        body: JSON.stringify({
          credentials: apiKey ? { apiKey } : undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Failed to save configuration');
        toaster.show(text, 'warning');
        return;
      }
      toaster.show(t('saved', 'Configuration saved'), 'success');
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [identifier, apiKey, fetch, toaster, t, onSaved]);

  if (!provider) {
    return (
      <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[24px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <ProviderIcon identifier={provider.identifier} name={provider.name} size={32} />
          <div className="text-[16px] font-semibold">{provider.name}</div>
        </div>
        <button
          className="text-[12px] text-newTableText hover:text-textColor"
          onClick={onClose}
        >
          {t('close', 'Close')}
        </button>
      </div>

      <div className="flex flex-col gap-[4px]">
        <label className="text-[13px] text-newTableText">
          {t('api_key', 'API Key')}
          <span className="text-red-500 ml-[2px]">*</span>
        </label>
        <div className="relative">
          <input
            className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px] w-full"
            type={showKey ? 'text' : 'password'}
            placeholder={t('api_key_placeholder', 'Paste your Magnific API key')}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            className="absolute right-[8px] top-1/2 -translate-y-1/2 text-[11px] text-newTableText hover:text-textColor"
            onClick={() => setShowKey((prev) => !prev)}
          >
            {showKey ? t('hide', 'Hide') : t('show', 'Show')}
          </button>
        </div>
        <div className="text-[12px] text-newTableText">
          {t(
            'content_pack_key_note',
            'Your key is encrypted at rest and never sent to the client after saving.'
          )}
        </div>
      </div>

      {provider.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-[4px]">
          {provider.capabilities.map((cap) => (
            <span
              key={cap}
              className="text-[10px] bg-newTableText/20 text-newTableText rounded-[2px] px-[4px] py-[1px]"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {testResult && (
        <div
          className={`text-[13px] px-[12px] py-[8px] rounded-[4px] ${
            testResult === 'success'
              ? 'bg-green-900/20 text-green-400'
              : 'bg-red-900/20 text-red-400'
          }`}
        >
          {testResult === 'success'
            ? t('test_success', 'Connection successful')
            : t('test_failure', 'Connection failed — check your API key')}
        </div>
      )}

      <div className="flex items-center justify-end gap-[12px]">
        <button
          className="text-[13px] px-[16px] py-[8px] rounded-[8px] border border-newTableBorder hover:bg-boxHover"
          onClick={handleTest}
          disabled={testing || !apiKey.trim()}
        >
          {testing ? t('testing', 'Testing...') : t('test_connection', 'Test Connection')}
        </button>
        <button
          className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[13px] hover:opacity-90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving || !apiKey.trim()}
        >
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </button>
      </div>
    </div>
  );
};

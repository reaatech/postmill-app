'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVpnProviders } from './hooks/useVpnConfig';

interface VpnProviderFormProps {
  identifier: string;
  onClose: () => void;
  onSaved: () => void;
}

export const VpnProviderForm = ({ identifier, onClose, onSaved }: VpnProviderFormProps) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: providers } = useVpnProviders();

  const provider = providers?.providers?.find((p: any) => p.identifier === identifier);
  const [name, setName] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [saving, setSaving] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!provider) return;
    const defaults: Record<string, string> = {};
    provider.credentialFields.forEach((f: any) => {
      defaults[f.key] = '';
    });
    setCreds(defaults);
    setEnabled(provider.enabled ?? false);
  }, [provider]);

  const handleSave = useCallback(async () => {
    if (!provider) return;
    setSaving(true);
    try {
      const res = await fetch(`/settings/vpn/config/${identifier}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name || undefined,
          credentials: Object.values(creds).some((v) => v) ? creds : undefined,
          enabled,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        toaster.show(err || t('save_failed', 'Failed to save configuration'), 'warning');
        return;
      }
      toaster.show(t('saved', 'Configuration saved'), 'success');
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }, [provider, identifier, name, creds, enabled, fetch, toaster, t, onSaved]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/settings/vpn/config/${identifier}/test`, {
        method: 'POST',
      });
      setTestResult(res.ok ? 'success' : 'failure');
      if (res.ok) {
        toaster.show(t('connection_successful', 'Connection successful'), 'success');
      } else {
        toaster.show(t('connection_failed', 'Connection failed'), 'warning');
      }
    } catch {
      setTestResult('failure');
      toaster.show(t('connection_failed', 'Connection failed'), 'warning');
    } finally {
      setTesting(false);
    }
  }, [identifier, fetch, toaster, t]);

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
        <div className="text-[16px] font-semibold">{provider.name}</div>
        <button
          className="text-[12px] text-newTableText hover:text-textColor"
          onClick={onClose}
        >
          {t('close', 'Close')}
        </button>
      </div>

      <div className="flex flex-col gap-[4px]">
        <label className="text-[13px] text-newTableText">
          {t('config_name', 'Configuration Name')}
        </label>
        <input
          className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
          type="text"
          placeholder={t('config_name_placeholder', 'e.g. My NordVPN Account')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {provider.credentialFields.map((field: any) => (
        <div key={field.key} className="flex flex-col gap-[4px]">
          <label className="text-[13px] text-newTableText">
            {field.label}
            {field.required && <span className="text-red-500 ml-[2px]">*</span>}
          </label>
          {field.type === 'select' && field.options ? (
            <select
              className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
              value={creds[field.key] || ''}
              onChange={(e) => setCreds((prev) => ({ ...prev, [field.key]: e.target.value }))}
            >
              <option value="">{t('select_option', 'Select...')}</option>
              {field.options.map((opt: any) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="relative">
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px] w-full"
                type={field.type === 'password' && !visibleFields[field.key] ? 'password' : 'text'}
                placeholder={field.placeholder || ''}
                value={creds[field.key] || ''}
                onChange={(e) => setCreds((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  className="absolute right-[8px] top-1/2 -translate-y-1/2 text-[11px] text-newTableText hover:text-textColor"
                  onClick={() => setVisibleFields((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                >
                  {visibleFields[field.key] ? t('hide', 'Hide') : t('show', 'Show')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {provider.setupNotes && (
        <div className="text-[12px] text-newTableText bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px]">
          {provider.setupNotes}
        </div>
      )}

      <label className="flex items-center gap-[8px] cursor-pointer">
        <input
          type="checkbox"
          className="accent-btnPrimary w-[16px] h-[16px]"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="text-[13px] text-textColor">{t('enabled', 'Enabled')}</span>
      </label>

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
            : t('test_failure', 'Connection failed — check your credentials')}
        </div>
      )}

      <div className="flex items-center justify-end gap-[12px]">
        <button
          className="text-[13px] px-[16px] py-[8px] rounded-[8px] border border-newTableBorder hover:bg-boxHover"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? t('testing', 'Testing...') : t('test_connection', 'Test Connection')}
        </button>
        <button
          className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[13px] hover:opacity-90"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </button>
      </div>
    </div>
  );
};

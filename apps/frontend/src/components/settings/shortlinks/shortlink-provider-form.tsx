'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useShortlinksProviders } from './hooks/useShortlinksConfig';

interface ShortlinkProviderFormProps {
  identifier: string;
  onClose: () => void;
  onSaved: () => void;
}

export const ShortlinkProviderForm = ({ identifier, onClose, onSaved }: ShortlinkProviderFormProps) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: providers } = useShortlinksProviders();

  const provider = providers?.find((p: any) => p.identifier === identifier);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [customDomain, setCustomDomain] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!provider) return;
    const defaults: Record<string, string> = {};
    provider.credentialFields.forEach((f: any) => {
      defaults[f.key] = '';
    });
    setCreds(defaults);
  }, [provider]);

  const handleSave = useCallback(async () => {
    if (!provider) return;
    setSaving(true);
    try {
      const res = await fetch(`/settings/shortlinks/config/${identifier}`, {
        method: 'PUT',
        body: JSON.stringify({
          credentials: Object.values(creds).some(v => v) ? creds : undefined,
          customDomain: customDomain || undefined,
          extraConfig: (clientId || clientSecret)
            ? { ...(clientId ? { clientId } : {}), ...(clientSecret ? { clientSecret } : {}) }
            : undefined,
        }),
      });
      if (!res.ok) {
        toaster.show(t('save_failed', 'Failed to save configuration'), 'warning');
        return;
      }
      toaster.show(t('saved', 'Configuration saved'), 'success');
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }, [provider, identifier, creds, customDomain, fetch, toaster, t, onSaved]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/settings/shortlinks/config/${identifier}/test`, {
        method: 'POST',
        body: JSON.stringify({ credentials: creds, customDomain: customDomain || undefined }),
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
  }, [identifier, creds, customDomain, fetch, toaster, t]);

  const handleOAuthConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/settings?tab=shortlinks`;
      const res = await fetch(`/settings/shortlinks/config/${identifier}/oauth/url`, {
        method: 'POST',
        body: JSON.stringify({ redirectUri }),
      });
      if (!res.ok) {
        toaster.show(t('oauth_failed', 'Failed to start OAuth flow'), 'warning');
        return;
      }
      const { url } = await res.json();
      sessionStorage.setItem('oauth_shortlink_provider', identifier);
      window.location.href = url;
    } catch {
      toaster.show(t('oauth_failed', 'Failed to start OAuth flow'), 'warning');
      setConnecting(false);
    }
  }, [identifier, fetch, toaster, t]);

  if (!provider) {
    return (
      <div className="bg-sixth border border-fifth rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  return (
    <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="flex items-center justify-between">
        <div className="text-[16px] font-semibold">{provider.name}</div>
        <button
          className="text-[12px] text-newTableText hover:text-textColor"
          onClick={onClose}
        >
          {t('close', 'Close')}
        </button>
      </div>

      {provider.credentialFields.map((field: any) => (
        <div key={field.key} className="flex flex-col gap-[4px]">
          <label className="text-[13px] text-newTableText">
            {field.label}
            {field.required && <span className="text-red-500 ml-[2px]">*</span>}
          </label>
          {field.type === 'select' && field.options ? (
            <select
              className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px]"
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
                className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px] w-full"
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

      {provider.authType === 'oauth2' && (
        <>
          <div className="flex flex-col gap-[4px]">
            <label className="text-[13px] text-newTableText">
              {t('client_id', 'Client ID')}
              <span className="text-red-500 ml-[2px]">*</span>
            </label>
            <input
              className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px]"
              type="text"
              placeholder={t('client_id_placeholder', 'Bitly OAuth Client ID')}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-[4px]">
            <label className="text-[13px] text-newTableText">
              {t('client_secret', 'Client Secret')}
              <span className="text-red-500 ml-[2px]">*</span>
            </label>
            <div className="relative">
              <input
                className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px] w-full"
                type={showClientSecret ? 'text' : 'password'}
                placeholder={provider.isConfigured ? t('secret_saved', '••••• saved — leave blank to keep') : ''}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-[8px] top-1/2 -translate-y-1/2 text-[11px] text-newTableText hover:text-textColor"
                onClick={() => setShowClientSecret(!showClientSecret)}
              >
                {showClientSecret ? t('hide', 'Hide') : t('show', 'Show')}
              </button>
            </div>
          </div>
        </>
      )}

      {provider.capabilities.customDomain && (
        <div className="flex flex-col gap-[4px]">
          <label className="text-[13px] text-newTableText">
            {t('custom_domain', 'Custom Domain')}
          </label>
          <input
            className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px]"
            type="text"
            placeholder={provider.defaultDomain || 'custom.domain.com'}
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
          />
        </div>
      )}

      {provider.setupNotes && (
        <div className="text-[12px] text-newTableText bg-forth border border-tableBorder rounded-[4px] p-[12px]">
          {provider.setupNotes}
        </div>
      )}

      {provider.authType === 'oauth2' && (
        <div className="flex items-center gap-[12px]">
          <div className="text-[12px] text-newTableText flex-1">
            {provider.isConfigured || clientId || clientSecret
              ? t('oauth_connect_note', 'Click Connect to authorize via Bitly. You can also paste a generated access token above.')
              : t('oauth_save_first', 'Save Client ID and Client Secret above first, then connect.')}
          </div>
          <button
            className="bg-btnPrimary text-white rounded-[4px] px-[16px] py-[8px] text-[13px] hover:opacity-90 whitespace-nowrap"
            onClick={handleOAuthConnect}
            disabled={connecting || !provider.isConfigured && !clientId && !clientSecret}
          >
            {connecting ? t('connecting', 'Connecting...') : t('connect_with_bitly', 'Connect with Bitly')}
          </button>
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
            : t('test_failure', 'Connection failed — check your credentials')}
        </div>
      )}

      <div className="flex items-center justify-end gap-[12px]">
        <button
          className="text-[13px] px-[16px] py-[8px] rounded-[4px] border border-tableBorder hover:bg-boxHover"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? t('testing', 'Testing...') : t('test_connection', 'Test Connection')}
        </button>
        <button
          className="bg-btnPrimary text-white rounded-[4px] px-[16px] py-[8px] text-[13px] hover:opacity-90"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('saving', 'Saving...') : t('save', 'Save')}
        </button>
      </div>
    </div>
  );
};

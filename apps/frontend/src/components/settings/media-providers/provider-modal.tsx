'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface ProviderDetail {
  identifier: string;
  name: string;
  credentialFields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
  }>;
  isConfigured: boolean;
  enabled: boolean;
  capabilities: string[];
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
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/admin/ai-settings/providers/${identifier}`);
        if (res.ok) {
          const data = await res.json();
          setProvider(data);
          setEnabled(data.enabled);
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
      const res = await fetch(`/admin/ai-settings/providers/${identifier}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
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
  }, [identifier, enabled, credentials, fetch, toaster, t, onSaved, onClose]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body: any = {};
      if (Object.keys(credentials).length > 0) {
        body.credentials = credentials;
      }
      const res = await fetch(`/admin/ai-settings/providers/${identifier}/test`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestResult({ success: res.ok, message: data.message || (res.ok ? 'Connection successful' : 'Connection failed') });
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  }, [identifier, credentials, fetch]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]">
        <div className="bg-sixth border border-fifth rounded-[8px] p-[24px] w-[480px] max-w-[90vw]">
          <div className="animate-pulse">{t('loading', 'Loading...')}</div>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]">
        <div className="bg-sixth border border-fifth rounded-[8px] p-[24px] w-[480px] max-w-[90vw]">
          <div className="text-[14px]">{t('provider_not_found', 'Provider not found')}</div>
          <button
            className="mt-[16px] text-[13px] text-customColor4 hover:underline"
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
      <div className="bg-sixth border border-fifth rounded-[8px] p-[24px] w-[480px] max-w-[90vw] flex flex-col gap-[20px]">
        <div className="flex items-center justify-between">
          <div className="text-[16px] font-semibold">{provider.name}</div>
          <button
            className="text-customColor18 hover:text-textColor text-[20px] leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-[16px]">
          {provider.credentialFields.map((field) => (
            <div key={field.key} className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-customColor18">
                {field.label}
                {field.required && <span className="text-red-500 ml-[2px]">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px] resize-y min-h-[60px]"
                  placeholder={field.placeholder || field.label}
                  value={credentials[field.key] || ''}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              ) : (
                <input
                  className="bg-forth border border-tableBorder rounded-[4px] p-[8px] text-textColor text-[13px]"
                  type={field.type === 'password' ? 'password' : 'text'}
                  placeholder={field.placeholder || field.label}
                  value={credentials[field.key] || ''}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-[12px]">
          <label className="flex items-center gap-[6px] cursor-pointer">
            <input
              type="checkbox"
              className="accent-customColor4"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-[13px]">{t('enabled', 'Enabled')}</span>
          </label>
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
            className="text-[13px] px-[12px] py-[6px] rounded-[4px] border border-tableBorder hover:bg-boxHover"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? t('testing', 'Testing...') : t('test_connection', 'Test Connection')}
          </button>
          <div className="flex gap-[8px]">
            <button
              className="text-[13px] px-[12px] py-[6px] rounded-[4px] border border-tableBorder hover:bg-boxHover"
              onClick={onClose}
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              className="bg-customColor4 text-white rounded-[4px] px-[16px] py-[6px] text-[13px] hover:opacity-90 disabled:opacity-50"
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

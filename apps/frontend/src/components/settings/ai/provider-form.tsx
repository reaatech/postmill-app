'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface CredentialField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

interface ModelInfo {
  id: string;
  label: string;
  kind: 'text' | 'image' | 'embedding';
  capabilities?: Record<string, boolean>;
}

interface ProviderInfo {
  identifier: string;
  name: string;
  type: string;
  credentialFields: CredentialField[];
}

const useProviders = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/ai/providers');
    if (!res.ok) throw new Error('Failed to load providers');
    return res.json();
  }, [fetch]);
  return useSWR<ProviderInfo[]>('org-ai-providers', load, {
    revalidateOnFocus: false,
  });
};

interface ProviderFormProps {
  identifier: string;
  onClose: () => void;
  onSaved: () => void;
}

export const ProviderForm = ({ identifier, onClose, onSaved }: ProviderFormProps) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: providers } = useProviders();

  const provider = providers?.find((p) => p.identifier === identifier);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [defaultModel, setDefaultModel] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!provider) return;
    const defaults: Record<string, string> = {};
    provider.credentialFields.forEach((f) => {
      defaults[f.key] = '';
    });
    setCreds(defaults);
    loadModels(defaults);
  }, [provider]);

  const loadModels = async (creds: Record<string, string>) => {
    try {
      const res = await fetch(`/admin/ai-settings/providers/${identifier}`, {
        method: 'GET',
      });
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        if (data.defaultModel) setDefaultModel(data.defaultModel);
        if (data.credentials) {
          setCreds((prev) => ({ ...prev, ...data.credentials }));
        }
      }
    } catch { /* ignore */ }
  };

  const handleSave = useCallback(async () => {
    if (!provider) return;
    setSaving(true);
    try {
      const res = await fetch(`/settings/ai/config/${identifier}`, {
        method: 'PUT',
        body: JSON.stringify({
          credentials: creds,
          defaultModel: defaultModel || undefined,
        }),
      });
      if (!res.ok) {
        toaster.show(t('save_failed', 'Failed to save provider configuration'), 'warning');
        return;
      }
      toaster.show(t('saved', 'Provider configuration saved'), 'success');
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }, [provider, identifier, creds, defaultModel, fetch, toaster, t, onSaved]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/settings/ai/config/${identifier}/test`, {
        method: 'POST',
        body: JSON.stringify({ credentials: creds }),
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
  }, [identifier, creds, fetch, toaster, t]);

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

      {provider.credentialFields.map((field) => (
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
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
              type={field.type === 'password' ? 'password' : 'text'}
              placeholder={field.placeholder || ''}
              value={creds[field.key] || ''}
              onChange={(e) => setCreds((prev) => ({ ...prev, [field.key]: e.target.value }))}
            />
          )}
        </div>
      ))}

      {models.length > 0 && (
        <div className="flex flex-col gap-[4px]">
          <label className="text-[13px] text-newTableText">
            {t('default_model', 'Default Model')}
          </label>
          <select
            className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
          >
            <option value="">{t('select_model', 'Select a model...')}</option>
            {models
              .filter((m) => m.kind === 'text')
              .map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
          </select>
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

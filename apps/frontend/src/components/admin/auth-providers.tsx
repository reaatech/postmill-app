'use client';

import React, { useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { DataTable } from '@gitroom/frontend/components/ui/data-table';
import type { Column } from '@gitroom/frontend/components/ui/data-table';
import { StatusPill } from '@gitroom/frontend/components/ui/data-table';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';

interface AuthProviderConfig {
  id: string;
  provider: string;
  enabled: boolean;
  clientId: string | null;
  clientSecret: string | null;
  authUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
  scopes: string | null;
  displayName: string | null;
}

const PROVIDER_OPTIONS = [
  { value: 'LOCAL', label: 'Local (Email/Password)' },
  { value: 'GITHUB', label: 'GitHub' },
  { value: 'GOOGLE', label: 'Google' },
  { value: 'GENERIC', label: 'Generic OIDC (Supabase, etc.)' },
];

const LABELS: Record<string, string> = {
  LOCAL: 'Local (Email/Password)',
  GITHUB: 'GitHub',
  GOOGLE: 'Google',
  GENERIC: 'Generic OIDC',
};

interface FormData {
  provider: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string;
  displayName: string;
}

const EMPTY_FORM: FormData = {
  provider: '',
  enabled: false,
  clientId: '',
  clientSecret: '',
  authUrl: '',
  tokenUrl: '',
  userInfoUrl: '',
  scopes: 'openid profile email',
  displayName: '',
};

export const AuthProviders = () => {
  const { t } = useTranslation();
  const fetch = useFetch();
  const toaster = useToaster();

  const load = useCallback(async () => {
    const res = await fetch('/admin/auth-providers');
    if (!res.ok) throw new Error('Failed to load auth providers');
    return res.json() as Promise<AuthProviderConfig[]>;
  }, [fetch]);

  const { data, error, mutate } = useSWR('/admin/auth-providers', load);

  const [editing, setEditing] = useState<FormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const providers = data || [];

  const handleEdit = useCallback((provider: AuthProviderConfig) => {
    setEditing({
      provider: provider.provider,
      enabled: provider.enabled,
      clientId: '',
      clientSecret: '',
      authUrl: provider.authUrl || '',
      tokenUrl: provider.tokenUrl || '',
      userInfoUrl: provider.userInfoUrl || '',
      scopes: provider.scopes || 'openid profile email',
      displayName: provider.displayName || '',
    });
    setShowForm(true);
  }, []);

  const handleAdd = useCallback((providerName?: string) => {
    setEditing({ ...EMPTY_FORM, provider: providerName || '' });
    setShowForm(true);
  }, []);

  const handleCancel = useCallback(() => {
    setEditing(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing || !editing.provider) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        provider: editing.provider,
        enabled: editing.enabled,
      };
      if (editing.clientId) body.clientId = editing.clientId;
      if (editing.clientSecret) body.clientSecret = editing.clientSecret;
      if (editing.authUrl) body.authUrl = editing.authUrl;
      if (editing.tokenUrl) body.tokenUrl = editing.tokenUrl;
      if (editing.userInfoUrl) body.userInfoUrl = editing.userInfoUrl;
      if (editing.scopes) body.scopes = editing.scopes;
      if (editing.displayName) body.displayName = editing.displayName;

      const res = await fetch('/admin/auth-providers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toaster.show(t('save_failed', 'Failed to save auth provider'), 'warning');
        return;
      }
      toaster.show(t('saved', 'Auth provider saved'), 'success');
      setEditing(null);
      setShowForm(false);
      mutate();
    } finally {
      setSaving(false);
    }
  }, [editing, fetch, toaster, t, mutate]);

  const handleDelete = useCallback(async (provider: string) => {
    if (!window.confirm(t('delete_confirm', 'Are you sure you want to delete this provider config?'))) return;
    setDeleting(provider);
    try {
      const res = await fetch(`/admin/auth-providers/${provider}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toaster.show(t('delete_failed', 'Failed to delete'), 'warning');
        return;
      }
      toaster.show(t('deleted', 'Deleted'), 'success');
      mutate();
    } finally {
      setDeleting(null);
    }
  }, [fetch, toaster, t, mutate]);

  const columns: Column<AuthProviderConfig>[] = [
    {
      key: 'provider',
      header: t('provider', 'Provider'),
      render: (item: AuthProviderConfig) => (
        <div>
          <div className="text-[13px] font-medium text-textColor">
            {LABELS[item.provider] || item.provider}
          </div>
          {item.displayName && (
            <div className="text-[11px] text-newTableText">{item.displayName}</div>
          )}
        </div>
      ),
    },
    {
      key: 'enabled',
      header: t('status', 'Status'),
      align: 'center',
      render: (item: AuthProviderConfig) =>
        item.enabled ? (
          <StatusPill status="green" label={t('enabled', 'Enabled')} />
        ) : (
          <StatusPill status="red" label={t('disabled', 'Disabled')} />
        ),
    },
    {
      key: 'scopes',
      header: t('scopes', 'Scopes'),
      render: (item: AuthProviderConfig) => (
        <span className="text-[12px] text-newTableText">{item.scopes || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: t('actions', 'Actions'),
      align: 'right',
      render: (item: AuthProviderConfig) => (
        <div className="flex items-center justify-end gap-[8px]">
          <button
            className="text-[12px] px-[10px] py-[4px] rounded-[6px] border border-newTableBorder hover:bg-boxHover transition-colors"
            onClick={() => handleEdit(item)}
          >
            {t('edit', 'Edit')}
          </button>
          <button
            className="text-[12px] px-[10px] py-[4px] rounded-[6px] border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            onClick={() => handleDelete(item.provider)}
            disabled={deleting === item.provider}
          >
            {deleting === item.provider ? t('deleting', 'Deleting...') : t('delete', 'Delete')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-[600] text-textColor">
            {t('auth_providers', 'Auth Providers')}
          </h1>
          <p className="text-[13px] text-newTableText mt-[4px]">
            {t('auth_providers_desc', 'Manage login methods for the entire platform. Configs are encrypted at rest.')}
          </p>
        </div>
        <button
          className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[13px] hover:opacity-90 transition-opacity"
          onClick={() => handleAdd()}
        >
          {t('add_provider', 'Add Provider')}
        </button>
      </div>

      {showForm && editing && (
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[16px]">
          <div className="text-[16px] font-semibold text-textColor">
            {editing.provider && providers.find((p) => p.provider === editing.provider)
              ? t('edit_provider', 'Edit Provider')
              : t('add_provider', 'Add Provider')}
          </div>

          <div className="grid grid-cols-2 gap-[16px]">
            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('provider', 'Provider')}
                <span className="text-red-500 ml-[2px]">*</span>
              </label>
              <select
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                value={editing.provider}
                onChange={(e) => setEditing({ ...editing, provider: e.target.value })}
                disabled={!!providers.find((p) => p.provider === editing.provider)}
              >
                <option value="">{t('select_provider', 'Select provider...')}</option>
                {PROVIDER_OPTIONS.filter(
                  (opt) => !providers.find((p) => p.provider === opt.value) || opt.value === editing.provider
                ).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('display_name', 'Display Name')}
              </label>
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                value={editing.displayName}
                onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
                placeholder={t('display_name_placeholder', 'e.g. Company Google Login')}
              />
            </div>

            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('client_id', 'Client ID')}
              </label>
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                value={editing.clientId}
                onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}
                placeholder={
                  providers.find((p) => p.provider === editing.provider)
                    ? t('leave_blank_to_keep', 'Leave blank to keep current')
                    : ''
                }
              />
            </div>

            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('client_secret', 'Client Secret')}
              </label>
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                type="password"
                value={editing.clientSecret}
                onChange={(e) => setEditing({ ...editing, clientSecret: e.target.value })}
                placeholder={
                  providers.find((p) => p.provider === editing.provider)
                    ? t('leave_blank_to_keep', 'Leave blank to keep current')
                    : ''
                }
              />
            </div>

            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('auth_url', 'Auth URL')}
              </label>
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                value={editing.authUrl}
                onChange={(e) => setEditing({ ...editing, authUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('token_url', 'Token URL')}
              </label>
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                value={editing.tokenUrl}
                onChange={(e) => setEditing({ ...editing, tokenUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('user_info_url', 'User Info URL')}
              </label>
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                value={editing.userInfoUrl}
                onChange={(e) => setEditing({ ...editing, userInfoUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="flex flex-col gap-[4px]">
              <label className="text-[13px] text-newTableText">
                {t('scopes', 'Scopes')}
              </label>
              <input
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[8px] text-textColor text-[13px]"
                value={editing.scopes}
                onChange={(e) => setEditing({ ...editing, scopes: e.target.value })}
                placeholder="openid profile email"
              />
            </div>
          </div>

          <div className="flex items-center gap-[8px]">
            <label className="text-[13px] text-newTableText cursor-pointer select-none flex items-center gap-[6px]">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                className="w-[16px] h-[16px] rounded-[4px] accent-btnPrimary"
              />
              {t('enabled', 'Enabled')}
            </label>
          </div>

          <div className="flex items-center justify-end gap-[12px] pt-[8px]">
            <button
              className="text-[13px] px-[16px] py-[8px] rounded-[8px] border border-newTableBorder hover:bg-boxHover transition-colors"
              onClick={handleCancel}
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[13px] hover:opacity-90 transition-opacity disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !editing.provider}
            >
              {saving ? t('saving', 'Saving...') : t('save', 'Save')}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="text-red-500 p-[16px]">
          {t('failed_to_load', 'Failed to load auth providers')}
        </div>
      ) : !data ? (
        <div className="p-[16px] text-textColor">{t('loading', 'Loading...')}</div>
      ) : providers.length === 0 ? (
        <EmptyState
          title={t('no_auth_providers', 'No Auth Providers Configured')}
          description={t('no_auth_providers_desc', 'Add a login provider to allow users to sign in with external services.')}
          action={
            <button
              className="bg-btnPrimary text-white rounded-[8px] px-[16px] py-[8px] text-[13px] hover:opacity-90"
              onClick={() => handleAdd()}
            >
              {t('add_provider', 'Add Provider')}
            </button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={providers}
          keyExtractor={(item: AuthProviderConfig) => item.provider}
        />
      )}
    </div>
  );
};

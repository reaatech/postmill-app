'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { usePermissions } from '@gitroom/frontend/components/layout/use-permissions';

export type NotificationChannel = 'email' | 'push' | 'inApp';
export type NotificationCategory =
  | 'post_published'
  | 'post_failed'
  | 'channel_error'
  | 'comment'
  | 'budget'
  | 'watchlist'
  | 'system';

export interface ChannelToggles {
  email: boolean;
  push: boolean;
  inApp: boolean;
}

export interface NotificationPreferences {
  masters: ChannelToggles;
  categories: Record<NotificationCategory, ChannelToggles>;
  digestFrequency: 'instant' | 'daily' | 'weekly' | 'never';
}

const CATEGORY_ORDER: NotificationCategory[] = [
  'post_published',
  'post_failed',
  'channel_error',
  'comment',
  'budget',
  'watchlist',
  'system',
];

const CATEGORY_LABEL_KEYS: Record<NotificationCategory, [string, string]> = {
  post_published: ['notification_cat_post_published', 'Post published'],
  post_failed: ['notification_cat_post_failed', 'Post failed'],
  channel_error: ['notification_cat_channel_error', 'Channel error'],
  comment: ['notification_cat_comment', 'Comments'],
  budget: ['notification_cat_budget', 'AI budget'],
  watchlist: ['notification_cat_watchlist', 'Watchlist'],
  system: ['notification_cat_system', 'System'],
};

const CHANNEL_ORDER: NotificationChannel[] = ['email', 'push', 'inApp'];

const CHANNEL_LABEL_KEYS: Record<NotificationChannel, [string, string]> = {
  email: ['notification_channel_email', 'Email'],
  push: ['notification_channel_push', 'Push'],
  inApp: ['notification_channel_inapp', 'In-app'],
};

export const useNotificationPreferences = () => {
  const fetch = useFetch();
  const load = useCallback(async (): Promise<NotificationPreferences> => {
    const res = await fetch('/notifications/preferences');
    if (!res.ok) throw new Error('Failed to load notification preferences');
    return res.json();
  }, [fetch]);
  return useSWR<NotificationPreferences>('notification-preferences', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
};

const Toggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}> = ({ checked, onChange, label }) => {
  return (
    <label className="inline-flex items-center gap-[8px] cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="relative w-[44px] h-[24px] bg-newTableBorder peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[20px] after:w-[20px] after:transition-all peer-checked:bg-btnPrimary" />
      {label && <span className="text-[13px] text-textColor">{label}</span>}
    </label>
  );
};

const AdminBroadcastPanel: React.FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [targetRoles, setTargetRoles] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendInApp, setSendInApp] = useState(true);
  const [sending, setSending] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !message.trim()) {
        toaster.show(t('fill_required_fields', 'Please fill in all required fields'), 'warning');
        return;
      }
      setSending(true);
      try {
        const res = await fetch('/admin/notifications/broadcast', {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            message: message.trim(),
            type,
            targetRoles: targetRoles
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean),
            channels: {
              email: sendEmail,
              push: false,
              inApp: sendInApp,
            },
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => 'Failed to send broadcast');
          toaster.show(text, 'warning');
          return;
        }
        toaster.show(t('broadcast_sent', 'Broadcast sent'), 'success');
        setTitle('');
        setMessage('');
        setTargetRoles('');
      } finally {
        setSending(false);
      }
    },
    [fetch, toaster, t, title, message, type, targetRoles, sendEmail, sendInApp]
  );

  return (
    <div className="border-t border-newTableBorder pt-[24px]">
      <h4 className="text-[16px] font-semibold mb-[4px]">
        {t('admin_broadcast', 'Admin Broadcast')}
      </h4>
      <p className="text-[13px] text-newTableText mb-[12px]">
        {t(
          'admin_broadcast_description',
          'Send a system notification to all organization members. Optionally target specific role keys (comma-separated).'
        )}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <label className="text-[13px] text-textColor">
            {t('title', 'Title')} *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
            placeholder={t('broadcast_title_placeholder', 'Announcement title')}
          />
        </div>
        <div className="flex flex-col gap-[4px]">
          <label className="text-[13px] text-textColor">
            {t('message', 'Message')} *
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none resize-none"
            placeholder={t('broadcast_message_placeholder', 'Announcement message')}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
          <div className="flex flex-col gap-[4px]">
            <label className="text-[13px] text-textColor">{t('type', 'Type')}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
            >
              <option value="info">{t('info', 'Info')}</option>
              <option value="warning">{t('warning', 'Warning')}</option>
              <option value="announcement">{t('announcement', 'Announcement')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-[4px]">
            <label className="text-[13px] text-textColor">
              {t('target_roles', 'Target roles (optional)')}
            </label>
            <input
              type="text"
              value={targetRoles}
              onChange={(e) => setTargetRoles(e.target.value)}
              className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
              placeholder={t('target_roles_placeholder', 'owner,admin')}
            />
          </div>
        </div>
        <div className="flex items-center gap-[16px]">
          <label className="flex items-center gap-[6px] cursor-pointer text-[13px]">
            <input
              type="checkbox"
              className="accent-btnPrimary w-[14px] h-[14px]"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            {t('send_email', 'Send email')}
          </label>
          <label className="flex items-center gap-[6px] cursor-pointer text-[13px]">
            <input
              type="checkbox"
              className="accent-btnPrimary w-[14px] h-[14px]"
              checked={sendInApp}
              onChange={(e) => setSendInApp(e.target.checked)}
            />
            {t('send_in_app', 'Send in-app')}
          </label>
        </div>
        <button
          type="submit"
          disabled={sending}
          className="w-fit px-[16px] py-[8px] bg-btnPrimary text-white rounded-[8px] text-[14px] hover:bg-btnPrimary/90 disabled:opacity-50"
        >
          {sending ? t('sending', 'Sending...') : t('send_broadcast', 'Send Broadcast')}
        </button>
      </form>
    </div>
  );
};

export const NotificationsTab: React.FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const permissions = usePermissions();
  const { data, isLoading, error, mutate } = useNotificationPreferences();
  const [local, setLocal] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const canBroadcast = permissions.hasPermission('notifications', 'manage');

  useEffect(() => {
    if (data) {
      setLocal(data);
    }
  }, [data]);

  const savePreferences = useCallback(
    async (next: NotificationPreferences) => {
      setSaving(true);
      try {
        const res = await fetch('/notifications/preferences', {
          method: 'POST',
          body: JSON.stringify({
            masters: next.masters,
            categories: next.categories,
            digestFrequency: next.digestFrequency,
          }),
        });
        if (!res.ok) {
          toaster.show(t('save_failed', 'Failed to save preferences'), 'warning');
          return;
        }
        const saved = await res.json();
        setLocal(saved);
        mutate(saved, false);
        toaster.show(t('settings_updated', 'Settings updated'), 'success');
      } finally {
        setSaving(false);
      }
    },
    [fetch, mutate, toaster, t]
  );

  const updateMaster = useCallback(
    (channel: NotificationChannel, value: boolean) => {
      if (!local) return;
      const next = {
        ...local,
        masters: { ...local.masters, [channel]: value },
      };
      setLocal(next);
      savePreferences(next);
    },
    [local, savePreferences]
  );

  const updateCategory = useCallback(
    (category: NotificationCategory, channel: NotificationChannel, value: boolean) => {
      if (!local) return;
      const next = {
        ...local,
        categories: {
          ...local.categories,
          [category]: { ...local.categories[category], [channel]: value },
        },
      };
      setLocal(next);
      savePreferences(next);
    },
    [local, savePreferences]
  );

  const updateDigest = useCallback(
    (value: NotificationPreferences['digestFrequency']) => {
      if (!local) return;
      const next = { ...local, digestFrequency: value };
      setLocal(next);
      savePreferences(next);
    },
    [local, savePreferences]
  );

  const allCategories = useMemo(() => {
    if (!local) return [];
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABEL_KEYS[category],
      channels: CHANNEL_ORDER.map((channel) => ({
        channel,
        label: CHANNEL_LABEL_KEYS[channel],
        checked: local.categories[category][channel],
        disabled: !local.masters[channel],
      })),
    }));
  }, [local]);

  if (isLoading || !local) {
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="text-[20px]">{t('notifications', 'Notifications')}</div>
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] animate-pulse">
          {t('loading', 'Loading...')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="text-[20px]">{t('notifications', 'Notifications')}</div>
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col items-center gap-[12px]">
          <span className="text-[14px] text-red-500">
            {t('failed_to_load', 'Failed to load notification preferences')}
          </span>
          <button
            className="text-[13px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[16px] py-[8px] hover:bg-boxHover transition-colors"
            onClick={() => window.location.reload()}
          >
            {t('try_again', 'Try again')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[4px]">
        <h3 className="text-[20px]">{t('notifications', 'Notifications')}</h3>
        <p className="text-[13px] text-newTableText max-w-[640px]">
          {t(
            'notifications_settings_description',
            'Choose which channels and categories of notifications you receive. Master toggles control each channel; category toggles let you opt in or out of specific notification types.'
          )}
        </p>
      </div>

      <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[24px]">
        <div>
          <h4 className="text-[16px] font-semibold mb-[4px]">
            {t('notification_channels', 'Channels')}
          </h4>
          <p className="text-[13px] text-newTableText mb-[12px]">
            {t(
              'notification_channels_description',
              'Enable or disable each delivery channel. Disabling a channel turns off all notifications sent through it.'
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-[16px]">
            {CHANNEL_ORDER.map((channel) => (
              <div
                key={channel}
                className="flex items-center justify-between border border-newTableBorder rounded-[8px] p-[12px]"
              >
                <span className="text-[14px]">{t(CHANNEL_LABEL_KEYS[channel][0], CHANNEL_LABEL_KEYS[channel][1])}</span>
                <Toggle
                  checked={local.masters[channel]}
                  onChange={(value) => updateMaster(channel, value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-newTableBorder pt-[24px]">
          <h4 className="text-[16px] font-semibold mb-[4px]">
            {t('notification_categories', 'Categories')}
          </h4>
          <p className="text-[13px] text-newTableText mb-[12px]">
            {t(
              'notification_categories_description',
              'Fine-tune which categories are delivered on each channel.'
            )}
          </p>
          <div className="border border-newTableBorder rounded-[8px] overflow-hidden">
            <div className="grid grid-cols-[1fr_repeat(3,auto)] gap-[12px] px-[16px] py-[10px] bg-newTableHeader text-[12px] text-newTableText uppercase tracking-wider">
              <span>{t('category', 'Category')}</span>
              {CHANNEL_ORDER.map((channel) => (
                <span key={channel} className="text-center w-[60px]">
                  {t(CHANNEL_LABEL_KEYS[channel][0], CHANNEL_LABEL_KEYS[channel][1])}
                </span>
              ))}
            </div>
            {allCategories.map((row, idx) => (
              <div
                key={row.category}
                className={`grid grid-cols-[1fr_repeat(3,auto)] gap-[12px] px-[16px] py-[12px] items-center ${
                  idx !== allCategories.length - 1 ? 'border-b border-newTableBorder' : ''
                }`}
              >
                <span className="text-[14px]">{t(row.label[0], row.label[1])}</span>
                {row.channels.map(({ channel, checked, disabled }) => (
                  <div key={channel} className="flex justify-center w-[60px]">
                    <Toggle
                      checked={checked}
                      onChange={(value) => updateCategory(row.category, channel, value)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-newTableBorder pt-[24px]">
          <h4 className="text-[16px] font-semibold mb-[4px]">
            {t('digest_settings', 'Digest')}
          </h4>
          <p className="text-[13px] text-newTableText mb-[12px]">
            {t(
              'digest_settings_description',
              'Choose how often to receive summary emails for supported notification categories.'
            )}
          </p>
          <select
            value={local.digestFrequency}
            onChange={(e) =>
              updateDigest(e.target.value as NotificationPreferences['digestFrequency'])
            }
            disabled={saving}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          >
            <option value="instant">{t('instant', 'Instant')}</option>
            <option value="daily">{t('daily', 'Daily')}</option>
            <option value="weekly">{t('weekly', 'Weekly')}</option>
            <option value="never">{t('never', 'Never')}</option>
          </select>
        </div>

        {canBroadcast && <AdminBroadcastPanel />}
      </div>
    </div>
  );
};

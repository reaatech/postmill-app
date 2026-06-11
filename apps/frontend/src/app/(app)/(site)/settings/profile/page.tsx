'use client';

import React, { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import clsx from 'clsx';
import { ProfileComponent } from '@gitroom/frontend/components/settings/profile.component';
import MetricComponent from '@gitroom/frontend/components/settings/metric.component';
import ChangePasswordComponent from '@gitroom/frontend/components/settings/change-password.component';
import EmailNotificationsComponent from '@gitroom/frontend/components/settings/email-notifications.component';

const tabs = [
  { key: 'profile', label: 'Profile' },
  { key: 'security', label: 'Security' },
  { key: 'notifications', label: 'Notifications' },
] as const;

export default function ProfilePage() {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [tab, setTab] = useState('profile');

  const resolver = useMemo(() => classValidatorResolver(UserDetailDto), []);
  const form = useForm({ resolver });

  const loadProfile = useCallback(async () => {
    const personal = await (await fetch('/user/personal')).json();
    form.setValue('fullname', personal.name || '');
    form.setValue('bio', personal.bio || '');
    form.setValue('picture', personal.picture);
  }, [form, fetch]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const submit = useCallback(async (val: any) => {
    await fetch('/user/personal', {
      method: 'POST',
      body: JSON.stringify(val),
    });
    toast.show(t('profile_updated', 'Profile updated'), 'success');
  }, [fetch, toast, t]);

  return (
    <div className="flex flex-col max-w-[800px] mx-auto w-full p-[24px]">
      <h1 className="text-[24px] font-[700] mb-[24px]">{t('settings', 'Settings')}</h1>
      <div className="flex gap-[8px] border-b border-newTableBorder mb-[24px]">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              'pb-[12px] px-[4px] text-[14px] font-[500] border-b-2 transition-colors',
              tab === key
                ? 'border-btnPrimary text-textColor'
                : 'border-transparent text-textColor/50 hover:text-textColor/80'
            )}
          >
            {t(key, label)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)}>
            <ProfileComponent form={form} isLoading={false} />
            <MetricComponent />
          </form>
        </FormProvider>
      )}

      {tab === 'security' && (
        <>
          <ChangePasswordComponent />
          <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] mt-[16px] flex flex-col gap-[24px]">
            <h4 className="text-[16px] font-[600]">{t('active_sessions', 'Active Sessions')}</h4>
            <SessionCard />
            <button
              type="button"
              onClick={async () => {
                const confirmed = await deleteDialog(
                  t('logout_all_devices_confirm', 'Are you sure you want to log out all devices? You will be redirected to the login page.'),
                  t('logout_all', 'Log out all devices'),
                  t('confirm_logout', 'Confirm Logout')
                );
                if (confirmed) {
                  await fetch('/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }
              }}
              className="bg-red/10 border border-red/30 text-red rounded-[6px] px-[16px] py-[10px] text-[13px] font-[500] w-fit cursor-pointer hover:bg-red/20 transition-colors"
            >
              {t('logout_all_devices', 'Log out all other sessions')}
            </button>
          </div>
        </>
      )}

      {tab === 'notifications' && <EmailNotificationsComponent />}
    </div>
  );
}

function parseUA(ua: string) {
  let browser = 'Unknown';
  let os = 'Unknown';
  let isMobile = false;

  if (/Edge?|Edg?\//.test(ua)) browser = 'Edge';
  else if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac/.test(ua) && !/iPhone|iPad/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (/Mobi|Android|iPhone|iPad|iPod/.test(ua)) isMobile = true;

  return { browser, os, isMobile };
}

const SessionCard: FC = () => {
  const t = useT();
  const [info, setInfo] = useState<{ browser: string; os: string; isMobile: boolean } | null>(null);
  const [lastLogin, setLastLogin] = useState('');

  useEffect(() => {
    setInfo(parseUA(navigator.userAgent));
    const stored = localStorage.getItem('lastLogin');
    if (stored) {
      try {
        setLastLogin(
          new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(stored))
        );
      } catch {
        setLastLogin(stored);
      }
    }
  }, []);

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-center gap-[12px] bg-newBgColor border border-newTableBorder rounded-[6px] px-[16px] py-[12px]">
        <div className="w-[32px] h-[32px] rounded-full bg-btnPrimary/20 flex items-center justify-center text-[14px]">
          {info?.isMobile ? '📱' : '💻'}
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-[500] text-textColor">
            {t('current_device', 'Current device')}
            <span className="text-textColor/50 font-[400] ml-[8px]">
              {info ? `${info.browser} on ${info.os}` : '...'}
            </span>
          </p>
          <p className="text-[12px] text-textColor/40 mt-[2px]">
            {lastLogin
              ? t('last_login_at', 'Last login: ') + lastLogin
              : t('last_login_unknown', 'Last login: N/A')}
          </p>
        </div>
        <span className="text-[11px] text-green font-[500] bg-green/10 px-[8px] py-[2px] rounded-full">
          {t('active', 'Active')}
        </span>
      </div>
    </div>
  );
};

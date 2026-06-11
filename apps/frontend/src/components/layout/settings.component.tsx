'use client';

import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import React, {
  FC,
  Ref,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { showMediaBox } from '@gitroom/frontend/components/media/media.component';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useSWRConfig } from 'swr';
import clsx from 'clsx';
import { TeamsComponent } from '@gitroom/frontend/components/settings/teams.component';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { LogoutComponent } from '@gitroom/frontend/components/layout/logout.component';
import { useSearchParams } from 'next/navigation';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { PublicComponent } from '@gitroom/frontend/components/public-api/public.component';
import { Webhooks } from '@gitroom/frontend/components/webhooks/webhooks';
import { Sets } from '@gitroom/frontend/components/sets/sets';
import { SignaturesComponent } from '@gitroom/frontend/components/settings/signatures.component';
import { Autopost } from '@gitroom/frontend/components/autopost/autopost';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { SVGLine } from '@gitroom/frontend/components/launches/launches.component';
import { ApprovedAppsComponent } from '@gitroom/frontend/components/approved-apps/approved-apps.component';
import { BrandTab } from '@gitroom/frontend/components/settings/brand/brand.tab';
import { AITab } from '@gitroom/frontend/components/settings/ai/ai.tab';
import { ShortlinksTab } from '@gitroom/frontend/components/settings/shortlinks/shortlinks.tab';
import { MediaProvidersTab } from '@gitroom/frontend/components/settings/media-providers/media-providers.tab';
import { StorageTab } from '@gitroom/frontend/components/settings/storage/storage.tab';
import { ChannelsTab } from '@gitroom/frontend/components/settings/channels/channels.tab';
import { PageHeader } from '@gitroom/frontend/components/ui/page-header';
export const SettingsPopup: FC<{
  getRef?: Ref<any>;
}> = (props) => {
  const { isGeneral } = useVariables();
  const { getRef } = props;
  const fetch = useFetch();
  const toast = useToaster();
  const swr = useSWRConfig();
  const user = useUser();
  const resolver = useMemo(() => {
    return classValidatorResolver(UserDetailDto);
  }, []);
  const form = useForm({
    resolver,
  });
  const picture = form.watch('picture');
  const modal = useModals();
  const close = useCallback(() => {
    return modal.closeAll();
  }, []);
  const url = useSearchParams();
  const showLogout = !url.get('onboarding') || user?.tier?.current === 'FREE';
  const loadProfile = useCallback(async () => {
    const personal = await (await fetch('/user/personal')).json();
    form.setValue('fullname', personal.name || '');
    form.setValue('bio', personal.bio || '');
    form.setValue('picture', personal.picture);
  }, []);
  const openMedia = useCallback(() => {
    showMediaBox((values) => {
      form.setValue('picture', values);
    });
  }, []);
  const remove = useCallback(() => {
    form.setValue('picture', null);
  }, []);

  const submit = useCallback(async (val: any) => {
    await fetch('/user/personal', {
      method: 'POST',
      body: JSON.stringify(val),
    });
    if (getRef) {
      return;
    }
    toast.show(t('profile_updated', 'Profile updated'));
    close();
  }, []);

  const [tab, setTab] = useState(url.get('tab') || 'channels');

  useEffect(() => {
    const tabParam = url.get('tab');
    if (tabParam && tabParam !== tab) {
      setTab(tabParam);
    }
  }, [url, tab]);

  const t = useT();
  interface SettingsTab {
    tab: string;
    label: string;
    section?: string;
    icon?: React.ReactNode;
  }

  const list = useMemo(() => {
    const arr: SettingsTab[] = [];
    if (user?.tier?.team_members && isGeneral) {
      arr.push({ tab: 'teams', label: t('teams', 'Teams'), section: 'Workspace', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> });
    }
    if (user?.tier.current !== 'FREE') {
      arr.push({ tab: 'brand', label: t('brand', 'Brand'), section: 'Workspace', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg> });
    }
    if (user?.tier.current !== 'FREE') {
      arr.push({ tab: 'signatures', label: t('signatures', 'Signatures'), section: 'Workspace', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> });
    }
    if (user?.tier.current !== 'FREE') {
      arr.push({ tab: 'sets', label: t('sets', 'Sets'), section: 'Workspace', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> });
    }
    arr.push({ tab: 'channels', label: t('channels', 'Channels'), section: 'Providers', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2a2 2 0 0 0-1.66-.9H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg> });
    arr.push({ tab: 'ai', label: t('ai', 'AI'), section: 'Providers', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3h.01M12 21h.01M3 12h.01M21 12h.01M4.5 4.5l.01.01M19.5 19.5l.01.01M4.5 19.5l.01.01M19.5 4.5l.01.01"/><circle cx="12" cy="12" r="2"/></svg> });
    arr.push({ tab: 'shortlinks', label: t('shortlinks', 'Shortlinks'), section: 'Providers', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> });
    arr.push({ tab: 'media_providers', label: t('media_providers', 'Media'), section: 'Providers', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="8" y1="2" x2="8" y2="22"/><line x1="16" y1="2" x2="16" y2="22"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="16" x2="22" y2="16"/></svg> });
    arr.push({ tab: 'storage', label: t('storage', 'Storage'), section: 'Providers', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> });
    if (user?.tier?.webhooks) {
      arr.push({ tab: 'webhooks', label: t('webhooks_1', 'Webhooks'), section: 'Automation', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="M6 17L3 2l3.05 2.66"/><path d="M16.54 6.76a3 3 0 0 1 3.05 3.64"/><path d="M6 17.01l-2.5 4.99"/></svg> });
    }
    if (user?.tier?.autoPost) {
      arr.push({ tab: 'autopost', label: t('auto_post', 'Auto Post'), section: 'Automation', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> });
    }
    if (user?.tier?.public_api && isGeneral && showLogout) {
      arr.push({ tab: 'api', label: t('developers', 'Developers'), section: 'Developer', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> });
    }
    arr.push({ tab: 'approved_apps', label: t('approved_apps', 'Approved Apps'), section: 'Developer', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11 12 14 22 4"/></svg> });
    return arr;
  }, [user, isGeneral, showLogout, t]);

  useEffect(() => {
    if (list.length > 0 && !list.some((item) => item.tab === tab)) {
      setTab(list[0]?.tab || 'channels');
    }
  }, [list, tab]);

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <>
      <div className="bg-newBgColorInner p-[20px] flex flex-col transition-all w-[260px]">
        <div className="flex flex-1 flex-col gap-[15px]">
          {(() => {
            const elements: React.ReactNode[] = [];
            let currentSection = '';
            list.forEach((item) => {
              if (item.section && item.section !== currentSection) {
                currentSection = item.section;
                elements.push(
                  <div key={`section-${item.section}`} className="text-[10px] font-semibold text-newTableText uppercase tracking-wider px-[4px] mt-[12px] mb-[4px]">
                    {item.section}
                  </div>
                );
              }
              elements.push(
                <button
                  type="button"
                  key={item.tab}
                  aria-current={item.tab === tab ? 'page' : undefined}
                  className={clsx(
                    'cursor-pointer flex items-center gap-[12px] group/profile hover:bg-boxHover rounded-e-[8px] text-start w-full',
                    item.tab === tab && 'bg-boxHover'
                  )}
                  onClick={() => setTab(item.tab)}
                >
                  <div
                    className={clsx(
                      'h-full w-[4px] rounded-s-[3px] opacity-0 group-hover/profile:opacity-100 transition-opacity',
                      item.tab === tab && 'opacity-100'
                    )}
                  >
                    <SVGLine />
                  </div>
                  <span className="flex items-center gap-[8px]">
                    {item.icon}
                    {item.label}
                  </span>
                </button>
              );
            });
            return elements;
          })()}
        </div>
        <div>
          {showLogout && (
            <div className="mt-4">
              <LogoutComponent />
            </div>
          )}
        </div>
      </div>
      <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
        <PageHeader title="Settings" />
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(submit)}>
            {!!getRef && (
              <button type="submit" className="hidden" ref={getRef}></button>
            )}
            <div
              className={clsx(
                'w-full mx-auto gap-[24px] flex flex-col relative',
                !getRef && 'rounded-[4px]'
              )}
            >
              {tab === 'teams' && !!user?.tier?.team_members && isGeneral && (
                <div>
                  <TeamsComponent />
                </div>
              )}

              {tab === 'channels' && (
                <div>
                  <ChannelsTab />
                </div>
              )}

              {tab === 'ai' && (
                <div>
                  <AITab />
                </div>
              )}

              {tab === 'shortlinks' && (
                <div>
                  <ShortlinksTab />
                </div>
              )}

              {tab === 'brand' && (
                <div>
                  <BrandTab />
                </div>
              )}

              {tab === 'media_providers' && (
                <div>
                  <MediaProvidersTab />
                </div>
              )}

              {tab === 'storage' && (
                <div>
                  <StorageTab />
                </div>
              )}

              {tab === 'webhooks' && !!user?.tier?.webhooks && (
                <div>
                  <Webhooks />
                </div>
              )}

              {tab === 'autopost' && !!user?.tier?.autoPost && (
                <div>
                  <Autopost />
                </div>
              )}

              {tab === 'sets' && user?.tier.current !== 'FREE' && (
                <div>
                  <Sets />
                </div>
              )}

              {tab === 'signatures' && user?.tier.current !== 'FREE' && (
                <div>
                  <SignaturesComponent />
                </div>
              )}

              {tab === 'api' &&
                !!user?.tier?.public_api &&
                isGeneral &&
                showLogout && (
                  <div>
                    <PublicComponent />
                  </div>
                )}

              {tab === 'approved_apps' && (
                <div>
                  <ApprovedAppsComponent />
                </div>
              )}
            </div>
          </form>
        </FormProvider>
      </div>
    </>
  );
};


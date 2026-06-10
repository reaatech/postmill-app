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
import { GlobalSettings } from '@gitroom/frontend/components/settings/global.settings';
import { ApprovedAppsComponent } from '@gitroom/frontend/components/approved-apps/approved-apps.component';
import { BrandTab } from '@gitroom/frontend/components/settings/brand/brand.tab';
import { AITab } from '@gitroom/frontend/components/settings/ai/ai.tab';
import { ShortlinksTab } from '@gitroom/frontend/components/settings/shortlinks/shortlinks.tab';
import { MediaProvidersTab } from '@gitroom/frontend/components/settings/media-providers/media-providers.tab';
import { StorageTab } from '@gitroom/frontend/components/settings/storage/storage.tab';
import { ChannelsTab } from '@gitroom/frontend/components/settings/channels/channels.tab';
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

  const [tab, setTab] = useState(url.get('tab') || 'settings');

  useEffect(() => {
    const tabParam = url.get('tab');
    if (tabParam && tabParam !== tab) {
      setTab(tabParam);
    }
  }, [url, tab]);

  const t = useT();
  const list = useMemo(() => {
    const arr = [];
    arr.push({ tab: 'settings', label: t('settings', 'Settings') });
    if (user?.tier?.team_members && isGeneral) {
      arr.push({ tab: 'teams', label: t('teams', 'Teams') });
    }
    arr.push({ tab: 'channels', label: t('channels', 'Channels') });
    arr.push({ tab: 'ai', label: t('ai', 'AI') });
    arr.push({ tab: 'shortlinks', label: t('shortlinks', 'Shortlinks') });
    arr.push({ tab: 'brand', label: t('brand', 'Brand') });
    arr.push({ tab: 'media_providers', label: t('media_providers', 'Media') });
    arr.push({ tab: 'storage', label: t('storage', 'Storage') });
    if (user?.tier?.webhooks) {
      arr.push({ tab: 'webhooks', label: t('webhooks_1', 'Webhooks') });
    }
    if (user?.tier?.autoPost) {
      arr.push({ tab: 'autopost', label: t('auto_post', 'Auto Post') });
    }
    if (user?.tier.current !== 'FREE') {
      arr.push({ tab: 'sets', label: t('sets', 'Sets') });
    }
    if (user?.tier.current !== 'FREE') {
      arr.push({ tab: 'signatures', label: t('signatures', 'Signatures') });
    }
    if (user?.tier?.public_api && isGeneral && showLogout) {
      arr.push({ tab: 'api', label: t('developers', 'Developers') });
    }
    arr.push({ tab: 'approved_apps', label: t('approved_apps', 'Approved Apps') });

    const settingsItem = arr.find(i => i.tab === 'settings');
    const rest = arr.filter(i => i.tab !== 'settings');
    rest.sort((a, b) => a.label.localeCompare(b.label));
    return settingsItem ? [settingsItem, ...rest] : rest;
  }, [user, isGeneral, showLogout, t]);

  useEffect(() => {
    if (list.length > 0 && !list.some((item) => item.tab === tab)) {
      setTab('settings');
    }
  }, [list, tab]);

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <>
      <div className="bg-newBgColorInner p-[20px] flex flex-col transition-all w-[260px]">
        <div className="flex flex-1 flex-col gap-[15px]">
          {list.map(({ tab: tabKey, label }) => (
            <button
              type="button"
              key={tabKey}
              aria-current={tabKey === tab ? 'page' : undefined}
              className={clsx(
                'cursor-pointer flex items-center gap-[12px] group/profile hover:bg-boxHover rounded-e-[8px] text-start w-full',
                tabKey === tab && 'bg-boxHover'
              )}
              onClick={() => setTab(tabKey)}
            >
              <div
                className={clsx(
                  'h-full w-[4px] rounded-s-[3px] opacity-0 group-hover/profile:opacity-100 transition-opacity',
                  tabKey === tab && 'opacity-100'
                )}
              >
                <SVGLine />
              </div>
              {label}
            </button>
          ))}
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
              {tab === 'settings' && (
                <div>
                  <GlobalSettings form={form} isLoading={false} />
                </div>
              )}

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


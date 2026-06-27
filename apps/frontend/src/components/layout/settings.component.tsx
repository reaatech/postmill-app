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
import { showFileBox } from '@gitroom/frontend/components/files/file.component';
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
import { Autopost } from '@gitroom/frontend/components/autopost/autopost';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ApprovedAppsComponent } from '@gitroom/frontend/components/approved-apps/approved-apps.component';
import { AITab } from '@gitroom/frontend/components/settings/ai/ai.tab';
import { ShortlinksTab } from '@gitroom/frontend/components/settings/shortlinks/shortlinks.tab';
import { ContentTab } from '@gitroom/frontend/components/settings/content/content.tab';
import { StorageTab } from '@gitroom/frontend/components/settings/storage/storage.tab';
import { ChannelsTab } from '@gitroom/frontend/components/settings/channels/channels.tab';
import { VpnTab } from '@gitroom/frontend/components/settings/vpn/vpn.tab';
import { PageHeader } from '@gitroom/frontend/components/ui/page-header';
import { RolesTab } from '@gitroom/frontend/components/settings/roles/roles.tab';
import { usePermissions } from '@gitroom/frontend/components/layout/use-permissions';
import { useSidebarCollapse } from '@gitroom/frontend/components/layout/use-sidebar-collapse';
import { SubmenuStrip } from '@gitroom/frontend/components/new-layout/submenu-strip';
export const SettingsPopup: FC<{
  getRef?: Ref<any>;
}> = (props) => {
  const { isGeneral } = useVariables();
  const { getRef } = props;
  const fetch = useFetch();
  const toast = useToaster();
  const swr = useSWRConfig();
  const user = useUser();
  const permissions = usePermissions();
  const t = useT();
  const resolver = useMemo(() => {
    return classValidatorResolver(UserDetailDto);
  }, []);
  const form = useForm({
    resolver,
  });
  const modal = useModals();
  const close = useCallback(() => {
    return modal.closeAll();
  }, [modal]);
  const url = useSearchParams();
  const showLogout = !url.get('onboarding') || user?.tier?.current === 'FREE';
  const loadProfile = useCallback(async () => {
    const personal = await (await fetch('/user/personal')).json();
    form.setValue('fullname', personal.name || '');
    form.setValue('lastName', personal.lastName || '');
    form.setValue('bio', personal.bio || '');
    form.setValue('picture', personal.picture);
  }, [fetch, form]);
  const openMedia = useCallback(() => {
    showFileBox((values) => {
      form.setValue('picture', values);
    });
  }, [form]);
  const remove = useCallback(() => {
    form.setValue('picture', null);
  }, [form]);

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
  }, [close, fetch, getRef, t, toast]);

  const { collapsed, toggle } = useSidebarCollapse('settings:sidebar-collapsed');
  const tabParam = url.get('tab');
  const [tab, setTab] = useState(tabParam || 'ai');
  // Sync the active tab when the URL's ?tab= changes (derived state during
  // render — https://react.dev/learn/you-might-not-need-an-effect).
  const [prevTabParam, setPrevTabParam] = useState(tabParam);
  if (tabParam !== prevTabParam) {
    setPrevTabParam(tabParam);
    if (tabParam && tabParam !== tab) {
      setTab(tabParam);
    }
  }
  // "Content" unifies the former media_providers + content_packs tabs. Keep
  // their old ?tab= values as deep-link aliases so existing links (and the
  // studios' "Configure" CTAs) still land on the right Content sub-tab.
  const CONTENT_ALIASES = [
    'content',
    'media_providers',
    'content_packs',
    'sets',
    'signatures',
  ];
  const isContentTab = CONTENT_ALIASES.includes(tab);
  const tabIsActive = (itemTab: string) =>
    itemTab === tab || (itemTab === 'content' && isContentTab);
  const canManageRoles =
    permissions.hasPermission('members', 'manage') ||
    permissions.hasPermission('settings', 'update');
  // R5: members whose role lacks settings:read get a no-access state instead
  // of the settings surface (the backend 403s the underlying calls anyway).
  const settingsDenied =
    permissions.isResolved && !permissions.hasPermission('settings', 'read');
  interface SettingsTab {
    tab: string;
    label: string;
    section?: string;
    icon?: React.ReactNode;
  }

  const list = useMemo(() => {
    const arr: SettingsTab[] = [];
    if (user?.tier?.team_members && isGeneral) {
      arr.push({ tab: 'teams', label: t('team', 'Team'), section: 'Workspace', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> });
    }
    // Custom-role editor (§17.1) — admins only (members:manage, or an explicit
    // settings grant on a custom role).
    if (canManageRoles) {
      arr.push({ tab: 'roles', label: t('roles', 'Roles'), section: 'Workspace', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg> });
    }
    arr.push({ tab: 'channels', label: t('channels', 'Channels'), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> });
    arr.push({ tab: 'ai', label: t('ai_llm', 'AI'), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z"/><path d="M18.5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg> });
    arr.push({ tab: 'shortlinks', label: t('shortlinks', 'Shortlinks'), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> });
    arr.push({ tab: 'content', label: t('content', 'Content'), icon: <svg width="16" height="16" viewBox="0 0 20 21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.50008 3L6.66675 7.16667M13.3334 3L12.5001 7.16667M18.3334 7.16667H1.66675M5.66675 18H14.3334C15.7335 18 16.4336 18 16.9684 17.7275C17.4388 17.4878 17.8212 17.1054 18.0609 16.635C18.3334 16.1002 18.3334 15.4001 18.3334 14V7C18.3334 5.59987 18.3334 4.8998 18.0609 4.36502C17.8212 3.89462 17.4388 3.51217 16.9684 3.27248C16.4336 3 15.7335 3 14.3334 3H5.66675C4.26662 3 3.56655 3 3.03177 3.27248C2.56137 3.51217 2.17892 3.89462 1.93923 4.36502C1.66675 4.8998 1.66675 5.59987 1.66675 7V14C1.66675 15.4001 1.66675 16.1002 1.93923 16.635C2.17892 17.1054 2.56137 17.4878 3.03177 17.7275C3.56655 18 4.26662 18 5.66675 18Z"/></svg> });
    arr.push({ tab: 'vpn', label: t('vpn', 'VPN'), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg> });
    arr.push({ tab: 'storage', label: t('file_storage', 'File Storage'), icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> });
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
    // Keep the category order, but sort entries alphabetically within each category.
    const sectionOrder = ['Workspace', 'Automation', 'Developer'];
    arr.sort((a, b) => {
      const sectionDiff =
        sectionOrder.indexOf(a.section || '') - sectionOrder.indexOf(b.section || '');
      if (sectionDiff !== 0) return sectionDiff;
      return a.label.localeCompare(b.label);
    });
    return arr;
  }, [user, isGeneral, showLogout, t, canManageRoles]);

  // If the current tab isn't available for this user/tier, fall back to the
  // first available tab (guarded so it converges in a single re-render).
  if (
    list.length > 0 &&
    !list.some((item) => item.tab === tab) &&
    !isContentTab
  ) {
    setTab(list[0]?.tab || 'ai');
  }

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (settingsDenied) {
    return (
      <div className="bg-newBgColorInner flex-1 flex flex-col items-center justify-center p-[40px] gap-[12px]">
        <div className="text-[20px] font-[600]">
          {t('settings_no_access_title', 'No access to settings')}
        </div>
        <div className="text-[14px] text-newTableText text-center max-w-[420px]">
          {t(
            'settings_no_access_description',
            'Your role does not include access to organization settings. Ask an organization admin if you need it.'
          )}
        </div>
        <a
          href="/dashboard"
          className="text-[14px] text-btnPrimary hover:underline"
        >
          {t('back_to_dashboard', 'Back to dashboard')}
        </a>
      </div>
    );
  }

  const stripItems = list.map((item) => ({
    label: item.label,
    icon: item.icon,
    section: item.section,
    active: tabIsActive(item.tab),
    onClick: () => setTab(item.tab),
  }));

  return (
    <>
      {/* Desktop side rail (collapsible). Hidden on mobile — replaced by the strip.
          Bounded to the viewport (desktop) so it matches the fixed main menu's
          height and scrolls internally — offset = outer p-12 + 80px header. */}
      <div
        className={clsx(
          'mobile:hidden bg-newBgColorInner flex flex-col transition-all p-[20px] h-[calc(100vh-104px)] mobile:h-auto min-h-0',
          collapsed ? 'w-[76px]' : 'w-[260px]'
        )}
      >
        <div
          className={clsx(
            'flex items-center mb-[12px] h-[24px]',
            collapsed ? 'justify-center' : 'justify-end'
          )}
        >
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="w-[24px] h-[24px] flex items-center justify-center rounded-[6px] text-newTableText hover:text-textColor hover:bg-boxHover transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={clsx('transition-transform', collapsed && 'rotate-180')}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 min-h-0 flex-col gap-[4px] overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-transparent">
          {(() => {
            const elements: React.ReactNode[] = [];
            let currentSection = '';
            list.forEach((item) => {
              if (item.section && item.section !== currentSection) {
                currentSection = item.section;
                elements.push(
                  <div key={`section-${item.section}`} className={clsx('text-[10px] font-semibold text-newTableText uppercase tracking-wider px-[4px] mt-[12px] mb-[4px]', collapsed && 'hidden')}>
                    {item.section}
                  </div>
                );
              }
              const active = tabIsActive(item.tab);
              elements.push(
                <button
                  type="button"
                  key={item.tab}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'group/rail relative w-full text-start flex items-center gap-[10px] rounded-e-[6px] text-[13px] text-textColor transition-colors',
                    collapsed ? 'justify-center px-[8px] py-[10px]' : 'ps-[10px] pe-[12px] py-[8px]',
                    active ? 'bg-boxHover' : 'hover:bg-boxHover'
                  )}
                  onClick={() => setTab(item.tab)}
                >
                  <span
                    className={clsx(
                      'absolute start-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-e-[2px] bg-btnPrimary transition-opacity',
                      active ? 'opacity-100' : 'opacity-0 group-hover/rail:opacity-100',
                      collapsed && 'hidden'
                    )}
                  />
                  <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            });
            return elements;
          })()}
        </div>
        <div>
          {showLogout && (
            <div className={clsx('mt-4 flex', collapsed && 'justify-center')}>
              <LogoutComponent isIcon={collapsed} />
            </div>
          )}
        </div>
      </div>

      <div className="bg-newBgColorInner flex-1 flex-col flex min-w-0 mobile:p-0 p-[20px] gap-[12px] h-[calc(100vh-104px)] mobile:h-auto min-h-0 overflow-y-auto mobile:overflow-visible">
        <SubmenuStrip ariaLabel="Settings sections" items={stripItems} />
        <div className="flex flex-col gap-[12px] mobile:p-[16px]">
        {!isContentTab && tab !== 'storage' && (
          <PageHeader
            title={
              tab === 'channels'
                ? 'Channels'
                : tab === 'ai'
                  ? 'AI'
                  : tab === 'vpn'
                    ? 'VPN'
                    : 'Settings'
            }
          />
        )}
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

              {tab === 'roles' && canManageRoles && (
                <div>
                  <RolesTab />
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

              {tab === 'vpn' && (
                <div>
                  <VpnTab />
                </div>
              )}

              {isContentTab && (
                <div>
                  <ContentTab
                    initialSubTab={
                      tab === 'content_packs'
                        ? 'packs'
                        : tab === 'sets'
                          ? 'sets'
                          : tab === 'signatures'
                            ? 'signatures'
                            : 'media'
                    }
                    canManagePacks={permissions.hasPermission('media-config', 'manage')}
                    canManageTemplates={user?.tier.current !== 'FREE'}
                  />
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
      </div>
    </>
  );
};


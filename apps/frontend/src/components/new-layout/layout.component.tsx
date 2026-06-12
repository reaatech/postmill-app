'use client';

import React, { ReactNode, useCallback, useState, useRef, useEffect } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { Plus_Jakarta_Sans } from 'next/font/google';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotProvider } from '@gitroom/frontend/components/layout/copilot.provider';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Impersonate } from '@gitroom/frontend/components/layout/impersonate';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';
import { TrialTracker } from '@gitroom/frontend/components/layout/gtm.component';
import { usePermissions } from '@gitroom/frontend/components/layout/use-permissions';
import SafeImage from '@gitroom/react/helpers/safe.image';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();

  const { billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
  const load = useCallback(
    async (path: string) => {
      return await (await fetch(path)).json();
    },
    [fetch]
  );
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  if (!user) return null;

  return (
    <ContextWrapper user={user}>
      <CopilotProvider>
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <TrialTracker />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px]',
                jakartaSans.className
              )}
            >
              <div>{user?.admin ? <Impersonate /> : <div />}</div>
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <div className="flex-1 flex gap-[8px]">
                    <Support />
                    <div className="flex flex-col bg-newBgColorInner w-[80px] rounded-[12px]">
                      <div
                        id="left-menu"
                        className={clsx(
                          'fixed h-full w-[64px] start-[17px] flex flex-1 top-0',
                          user?.admin && 'pt-[60px] max-h-[1000px]:w-[500px]'
                        )}
                      >
                        <div className="flex flex-col h-full gap-[32px] flex-1 py-[12px]">
                          <Logo />
                          <TopMenu />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                      <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center">
                        <div className="text-[24px] font-[600] flex flex-1">
                          <Title />
                        </div>
                        <div className="flex gap-[20px] text-textItemBlur items-center">
                          <div className="flex items-center justify-center w-[36px] h-[36px]">
                            <StreakComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <OrganizationSelector />
                          <div className="hover:text-newTextColor flex items-center justify-center w-[36px] h-[36px]">
                            <ModeComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <div className="flex items-center justify-center w-[36px] h-[36px]">
                            <LanguageComponent />
                          </div>
                          <div className="flex items-center justify-center w-[36px] h-[36px] empty:hidden">
                            <ChromeExtensionComponent />
                          </div>
                          <div className="w-[1px] h-[20px] bg-blockSeparator" />
                          <div className="flex items-center justify-center w-[36px] h-[36px] empty:hidden">
                            <AttachToFeedbackIcon />
                          </div>
                          <div className="flex items-center justify-center w-[36px] h-[36px]">
                            <NotificationComponent />
                          </div>
                          <div className="flex items-center justify-center w-[36px] h-[36px]">
                            <UserAvatarMenu />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-1 gap-[1px]">{children}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotProvider>
    </ContextWrapper>
  );
};

const UserAvatarMenu = () => {
  const user = useUser();
  const t = useT();
  const permissions = usePermissions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // R5: hide the Settings entry for members whose role lacks settings:read.
  // Shown optimistically while permissions load; backend 403s backstop.
  const showSettings =
    !permissions.isResolved || permissions.hasPermission('settings', 'read');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup={true}
        className="flex items-center gap-[8px] hover:text-newTextColor"
      >
        {user.profile?.avatarUrl || user.profile?.picture?.path ? (
          <SafeImage
            src={user.profile?.avatarUrl || user.profile?.picture?.path || ''}
            alt=""
            className="w-[28px] h-[28px] rounded-full object-cover border border-newTableBorder"
          />
        ) : (
          <div className="w-[28px] h-[28px] rounded-full bg-btnPrimary flex items-center justify-center text-white text-[12px] font-[600]">
            {(user.profile?.name || user.email || '?')[0].toUpperCase()}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[36px] w-[200px] bg-newBgColorInner border border-newTableBorder rounded-[8px] shadow-lg z-[300] py-[4px]" role="menu">
          <div className="px-[14px] py-[8px] border-b border-newTableBorder">
            <div className="text-[13px] font-[600] text-textColor truncate">
              {user.profile?.name || user.email}
            </div>
            {user.email && (
              <div className="text-[11px] text-textColor/60 truncate">
                {user.email}
              </div>
            )}
          </div>
          <a
            href="/user/me"
            role="menuitem"
            className="block px-[14px] py-[8px] text-[13px] text-textColor hover:bg-boxHover"
          >
            {t('profile', 'Profile')}
          </a>
          {showSettings && (
            <a
              href="/settings"
              role="menuitem"
              className="block px-[14px] py-[8px] text-[13px] text-textColor hover:bg-boxHover"
            >
              {t('settings', 'Settings')}
            </a>
          )}
          <a
            href="/logout"
            role="menuitem"
            className="block px-[14px] py-[8px] text-[13px] text-red-500 hover:bg-boxHover"
          >
            {t('logout', 'Logout')}
          </a>
        </div>
      )}
    </div>
  );
};

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
import { ShowFileBoxModal } from '@gitroom/frontend/components/files/file.component';
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
import { BottomTabBar } from '@gitroom/frontend/components/new-layout/bottom-tab-bar';

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
            <ShowFileBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen min-w-screen text-newTextColor p-[12px] mobile:pb-[72px]',
                jakartaSans.className
              )}
            >
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <div className="flex-1 flex gap-[8px]">
                    <Support />
                    <div className="mobile:hidden flex flex-col bg-newBgColorInner w-[80px] rounded-[12px]">
                      <div
                        id="left-menu"
                        className={clsx(
                          'fixed h-full w-[64px] start-[17px] flex flex-1 top-0'
                        )}
                      >
                        <div className="flex flex-col h-full gap-[32px] flex-1 py-[12px]">
                          <Logo />
                          <TopMenu />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                      <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center">
                        <div className="text-[24px] font-[600] flex flex-1 items-center gap-[10px] min-w-0">
                          {/* Brand mark — only on mobile, where the left rail
                              (which normally shows the logo) is hidden. */}
                          <span className="mobile:flex hidden shrink-0">
                            <Logo size={34} className="" />
                          </span>
                          <Title />
                        </div>
                        <div className="flex gap-[20px] text-textItemBlur items-center">
                          {/* Secondary utilities collapse into the avatar menu on mobile. */}
                          <div className="contents mobile:hidden">
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
                  <BottomTabBar />
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
        <div className="absolute right-0 top-[36px] w-[200px] mobile:w-[260px] bg-newBgColorInner border border-newTableBorder rounded-[8px] shadow-lg z-[300] py-[4px]" role="menu">
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
          {/* Secondary utilities live here on mobile (hidden on desktop, where
              they sit in the top bar). */}
          <div className="mobile:block hidden px-[14px] py-[10px] border-b border-newTableBorder text-textItemBlur">
            <div className="flex items-center gap-[18px] flex-wrap">
              <StreakComponent />
              <div className="hover:text-newTextColor flex items-center justify-center">
                <ModeComponent />
              </div>
              <div className="flex items-center justify-center">
                <LanguageComponent />
              </div>
              <div className="flex items-center justify-center empty:hidden">
                <AttachToFeedbackIcon />
              </div>
              <div className="flex items-center justify-center empty:hidden">
                <ChromeExtensionComponent />
              </div>
            </div>
            <div className="mt-[10px] empty:hidden">
              <OrganizationSelector asOpenSelect={true} />
            </div>
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

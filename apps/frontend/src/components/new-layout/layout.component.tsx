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
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
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
import { LanguageMenuRow } from '@gitroom/frontend/components/layout/language.component';
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
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useAddProvider } from '@gitroom/frontend/components/launches/add.provider.component';

// Lazy — only loaded when "New Campaign" is actually chosen (keeps the campaign-modal
// dependency graph out of the global layout bundle).
const CreateEditCampaignModal = dynamic(
  () =>
    import(
      '@gitroom/frontend/components/campaigns/index/create-edit-campaign.modal'
    ).then((m) => m.CreateEditCampaignModal),
  { ssr: false }
);

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
                          <Link href="/" aria-label="Home">
                            <Logo />
                          </Link>
                          <TopMenu />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                      <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center">
                        <div className="text-[24px] font-[600] flex flex-1 items-center gap-[10px] min-w-0">
                          {/* Brand mark — only on mobile, where the left rail
                              (which normally shows the logo) is hidden. */}
                          <Link href="/" aria-label="Home" className="mobile:flex hidden shrink-0">
                            <Logo size={34} className="" />
                          </Link>
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
                            <div className="flex items-center justify-center w-[36px] h-[36px] empty:hidden">
                              <ChromeExtensionComponent />
                            </div>
                            <div className="w-[1px] h-[20px] bg-blockSeparator" />
                            <div className="flex items-center justify-center w-[36px] h-[36px] empty:hidden">
                              <AttachToFeedbackIcon />
                            </div>
                          </div>
                          <CreateMenu />
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

// GitHub-style "create" control. The desktop header shows a bordered "+" button (with a caret)
// that opens a dropdown of these actions; on mobile — where the header "+" is hidden — the same
// rows live in the avatar menu. New Post / New Design are plain navigations; New Campaign opens
// the shared campaign modal; New Channel (admin-only) opens the add-channel flow.
const createMenuRow =
  'w-full flex items-center gap-[10px] px-[14px] py-[8px] text-[13px] text-textColor hover:bg-boxHover text-start';

const useCreateActions = () => {
  const t = useT();
  const modals = useModals();
  const { mutate } = useSWRConfig();
  const addChannel = useAddProvider(() => mutate('/integrations'), false);

  const openCampaign = useCallback(() => {
    modals.openModal({
      title: t('new_campaign', 'New Campaign'),
      withCloseButton: true,
      children: (
        <CreateEditCampaignModal
          editing={null}
          onDone={() => {
            modals.closeAll();
            mutate('/campaigns');
          }}
        />
      ),
    });
  }, [modals, mutate, t]);

  return { openCampaign, openChannel: addChannel };
};

// The create actions as a list of menu rows, shared by the desktop "+" dropdown and the mobile
// avatar menu. `onSelect` closes the host menu; `showChannel` gates the admin-only channel row.
const CreateMenuItems: React.FC<{ onSelect?: () => void; showChannel: boolean }> = ({
  onSelect,
  showChannel,
}) => {
  const t = useT();
  const { openCampaign, openChannel } = useCreateActions();
  return (
    <>
      <a
        href="/posts/post"
        role="menuitem"
        onClick={onSelect}
        className={createMenuRow}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {t('new_post', 'New Post')}
      </a>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onSelect?.();
          openCampaign();
        }}
        className={createMenuRow}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3 11 18-5v12L3 14v-3Z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
        {t('new_campaign', 'New Campaign')}
      </button>
      <a
        href="/media/designer"
        role="menuitem"
        onClick={onSelect}
        className={createMenuRow}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
        {t('new_design', 'New Design')}
      </a>
      {showChannel && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onSelect?.();
            openChannel();
          }}
          className={createMenuRow}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          {t('new_channel', 'New Channel')}
        </button>
      )}
    </>
  );
};

const CreateMenu = () => {
  const t = useT();
  const permissions = usePermissions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup={true}
        aria-label={t('create_new', 'Create new')}
        title={t('create_new', 'Create new')}
        className="flex items-center gap-[4px] h-[32px] px-[8px] rounded-[8px] border border-newTableBorder hover:text-newTextColor hover:bg-boxHover"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-[40px] w-[210px] bg-newBgColorInner border border-newTableBorder rounded-[8px] shadow-lg z-[300] py-[4px]"
          role="menu"
        >
          <CreateMenuItems
            onSelect={() => setOpen(false)}
            showChannel={permissions.isAdmin}
          />
        </div>
      )}
    </div>
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
        aria-label={t('account_menu', 'Account menu')}
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
          <LanguageMenuRow onOpen={() => setOpen(false)} />
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

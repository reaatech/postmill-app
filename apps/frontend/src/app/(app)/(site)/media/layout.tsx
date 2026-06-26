'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { usePermissions } from '@gitroom/frontend/components/layout/use-permissions';
import { useSidebarCollapse } from '@gitroom/frontend/components/layout/use-sidebar-collapse';
import { SubmenuStrip } from '@gitroom/frontend/components/new-layout/submenu-strip';

const tabs = [
  {
    href: '/media/stock-photos',
    label: 'Stock Photos',
    section: 'Content Pack',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    href: '/media/stock-videos',
    label: 'Stock Videos',
    section: 'Content Pack',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="14" height="16" rx="2" />
        <path d="M16 9l6-3v12l-6-3" />
      </svg>
    ),
  },
  {
    href: '/media/designer',
    label: 'Designer',
    section: 'Platform',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    ),
  },
  {
    href: '/media/replicate',
    label: 'Replicate',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    href: '/media/heygen',
    label: 'HeyGen',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
      </svg>
    ),
  },
  {
    href: '/media/kling',
    label: 'Kling',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="14" height="16" rx="2" />
        <path d="M16 9l6-3v12l-6-3" />
        <path d="M7 9l4 3-4 3z" />
      </svg>
    ),
  },
  {
    href: '/media/luma',
    label: 'Luma',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 0 18" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: '/media/minimax',
    label: 'MiniMax',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 18V6l5 7 5-7v12" />
        <path d="M20 6v12" />
      </svg>
    ),
  },
  {
    href: '/media/qwen',
    label: 'Qwen',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M11 7v8" />
        <path d="M7 11h8" />
        <path d="M16 16l4 4" />
      </svg>
    ),
  },
  {
    href: '/media/togetherai',
    label: 'Together AI',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="18" r="3" />
        <path d="M9 6h6M6 9v6M18 9v6M9 18h6" />
      </svg>
    ),
  },
  {
    href: '/media/runway',
    label: 'Runway',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3l14 9-14 9V3z" />
      </svg>
    ),
  },
  {
    href: '/media/siliconflow',
    label: 'SiliconFlow',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 8h5a3 3 0 0 1 0 6H9l5 4" />
      </svg>
    ),
  },
  {
    href: '/media/groq',
    label: 'Groq',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 12a3 3 0 1 1 3 3v3" />
      </svg>
    ),
  },
  {
    href: '/media/openrouter',
    label: 'OpenRouter',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h6l3-4 3 8 3-4h0" />
        <circle cx="3" cy="12" r="1" />
        <circle cx="21" cy="12" r="1" />
      </svg>
    ),
  },
  {
    href: '/media/fireworks',
    label: 'Fireworks AI',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4" />
      </svg>
    ),
  },
  {
    href: '/media/deepinfra',
    label: 'DeepInfra',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l9-4 9 4-9 4-9-4z" />
        <path d="M3 12l9 4 9-4" />
        <path d="M3 17l9 4 9-4" />
      </svg>
    ),
  },
  {
    href: '/media/gateway',
    label: 'AI Gateway',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: '/media/bedrock',
    label: 'Amazon Bedrock',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7l8-4 8 4-8 4-8-4z" />
        <path d="M4 12l8 4 8-4" />
        <path d="M4 17l8 4 8-4" />
      </svg>
    ),
  },
  {
    href: '/media/azure',
    label: 'Azure OpenAI',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4L3 18h4l3-7 5 9 6-2L13 4H9z" />
      </svg>
    ),
  },
  {
    href: '/media/vertex',
    label: 'Vertex AI',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    href: '/media/black-forest-labs',
    label: 'Black Forest Labs',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />
        <path d="M12 12l9-5" />
        <path d="M12 12v10" />
        <path d="M12 12L3 7" />
      </svg>
    ),
  },
  {
    href: '/media/stability-ai',
    label: 'Stability AI',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M8 15c1.5 1 6.5 1 6.5-1.5S8 11 8 9s5-1.5 6.5-.5" />
      </svg>
    ),
  },
  {
    href: '/media/openai',
    label: 'OpenAI',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    href: '/media/elevenlabs',
    label: 'ElevenLabs',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    ),
  },
  {
    href: '/media/did',
    label: 'D-ID',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="4" />
        <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
        <path d="M19 8c1 1.333 1 4.667 0 6" />
        <path d="M21.5 6c1.5 2 1.5 8 0 10" />
      </svg>
    ),
  },
  {
    href: '/media/deepgram',
    label: 'Deepgram',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </svg>
    ),
  },
  {
    href: '/media/hedra',
    label: 'Hedra',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3z" />
      </svg>
    ),
  },
  {
    href: '/media/tavus',
    label: 'Tavus',
    section: 'Providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="12" cy="10" r="2.5" />
        <path d="M7.5 17a4.5 4.5 0 0 1 9 0" />
      </svg>
    ),
  },
  {
    href: '/media/stock-vectors',
    label: 'Vectors',
    section: 'Content Pack',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17c5-10 13-10 18 0" />
        <circle cx="3" cy="17" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="21" cy="17" r="1.5" />
      </svg>
    ),
  },
  {
    href: '/media/stock-stickers',
    label: 'Stickers',
    section: 'Content Pack',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9h.01" />
        <path d="M15 9h.01" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      </svg>
    ),
  },
  {
    href: '/media/stock-audio',
    label: 'Stock Audio',
    section: 'Content Pack',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    href: '/media/stock-icons',
    label: 'Icons',
    section: 'Content Pack',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
];

// Keep the section order, but sort entries alphabetically within each section.
// 'Platform' (Designer) renders header-less at the top; 'Providers' and
// 'Content Pack' get section headers.
const sectionOrder = ['Platform', 'Providers', 'Content Pack'];
const sortedTabs = [...tabs].sort((a, b) => {
  const sectionDiff =
    sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
  if (sectionDiff !== 0) return sectionDiff;
  return a.label.localeCompare(b.label);
});

export default function MediaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const { collapsed, toggle } = useSidebarCollapse('media:sidebar-collapsed');

  if (permissions.isLoaded && !permissions.hasPermission('media', 'read')) {
    return (
      <div className="flex flex-1 items-center justify-center h-full p-[20px] bg-newBgColorInner text-textColor">
        <div className="text-center">
          <div className="text-[16px] font-semibold mb-2">Media access required</div>
          <div className="text-[13px] text-newTableText/60">
            You don&apos;t have permission to access media tools.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full min-w-0 gap-[15px] p-[20px] mobile:p-0 mobile:gap-0 bg-newBgColorInner">
      {/* Desktop side rail (collapsible). Hidden on mobile — replaced by the strip. */}
      <div
        className={clsx(
          'mobile:hidden shrink-0 flex flex-col gap-[4px] transition-all',
          collapsed ? 'w-[56px]' : 'w-[220px]'
        )}
      >
        <div
          className={clsx(
            'flex items-center mb-[8px] px-[8px] h-[24px]',
            collapsed ? 'justify-center px-0' : 'justify-between'
          )}
        >
          {!collapsed && (
            <span className="text-[13px] font-[600] text-textColor">Media Tools</span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="flex w-[24px] h-[24px] items-center justify-center rounded-[6px] text-textColor/60 hover:text-textColor hover:bg-newColColor/50 transition-colors"
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

        {sortedTabs.map((t, i) => {
            const active = pathname.startsWith(t.href);
            // 'Platform' (Designer) is the lone built-in tool — no section header.
            const showHeader =
              t.section !== 'Platform' &&
              (i === 0 || sortedTabs[i - 1].section !== t.section);
            return (
              <React.Fragment key={t.href}>
                {showHeader && (
                  <div
                    className={clsx(
                      'text-[10px] font-semibold text-newTableText uppercase tracking-wider px-[4px] mt-[12px] mb-[4px]',
                      collapsed && 'hidden'
                    )}
                  >
                    {t.section}
                  </div>
                )}
                <Link
                  href={t.href}
                  title={t.label}
                  className={clsx(
                    'flex items-center gap-[10px] rounded-[6px] text-[13px] transition-all',
                    collapsed ? 'justify-center px-0 py-[10px]' : 'px-[12px] py-[8px]',
                    active
                      ? 'bg-designerAccent/20 text-textColor'
                      : 'text-textColor hover:bg-newColColor/50'
                  )}
                >
                  <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
                    {t.icon}
                  </span>
                  {!collapsed && <span className="truncate">{t.label}</span>}
                </Link>
              </React.Fragment>
            );
          })}
      </div>

      {/* Page area: mobile gets a horizontal sub-menu strip above the content. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <SubmenuStrip
          ariaLabel="Media tools"
          items={sortedTabs.map((t) => ({
            href: t.href,
            label: t.label,
            icon: t.icon,
            active: pathname.startsWith(t.href),
          }))}
        />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

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
    section: 'Tools',
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
    section: 'Tools',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
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
const sectionOrder = ['Tools', 'Content Pack'];
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
            const showHeader = i === 0 || sortedTabs[i - 1].section !== t.section;
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
                      ? 'bg-designerAccent/20 text-white'
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

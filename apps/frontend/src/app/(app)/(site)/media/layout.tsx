'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions } from '@gitroom/frontend/components/layout/use-permissions';

const tabs = [
  { href: '/media/stock-photos', label: 'Stock Photos' },
  { href: '/media/stock-videos', label: 'Stock Videos' },
  { href: '/media/designer', label: 'Designer' },
];

export default function MediaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (permissions.isLoaded && !permissions.hasPermission('media', 'read')) {
    return (
      <div className="flex flex-1 items-center justify-center h-full p-[20px] bg-newBgColorInner text-textColor">
        <div className="text-center">
          <div className="text-[16px] font-semibold mb-2">Media access required</div>
          <div className="text-[13px] text-newTextColor/60">
            You don&apos;t have permission to access media tools.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full min-w-0 gap-[15px] p-[20px] bg-newBgColorInner">
      <button
        className="lg:hidden fixed top-[16px] left-[16px] z-50 px-[10px] py-[8px] rounded-[6px] bg-designerAccent text-white text-[13px]"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle media sidebar"
      >
        {sidebarOpen ? 'Close' : 'Menu'}
      </button>

      <div
        className={`w-[220px] shrink-0 flex flex-col gap-[4px] lg:flex
          ${sidebarOpen ? 'fixed inset-0 z-40 bg-newBgColorInner p-[20px] pt-[60px]' : 'hidden'}
          lg:relative lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0 lg:pt-0`}
      >
        <div className="text-[13px] font-[600] text-textColor mb-[8px] px-[12px]">
          Media Tools
        </div>
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => setSidebarOpen(false)}
              className={`text-left px-[12px] py-[8px] rounded-[6px] text-[13px] transition-all ${
                active
                  ? 'bg-designerAccent/20 text-white'
                  : 'text-textColor hover:bg-newColColor/50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

'use client';

import React from 'react';
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
    <div className="flex flex-1 h-full gap-[15px] p-[20px] bg-newBgColorInner">
      <div className="w-[220px] shrink-0 flex flex-col gap-[4px]">
        <div className="text-[13px] font-[600] text-textColor mb-[8px] px-[12px]">
          Media Tools
        </div>
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`text-left px-[12px] py-[8px] rounded-[6px] text-[13px] transition-all ${
                active
                  ? 'bg-[#2B5CD3]/20 text-white'
                  : 'text-textColor hover:bg-newColColor/50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

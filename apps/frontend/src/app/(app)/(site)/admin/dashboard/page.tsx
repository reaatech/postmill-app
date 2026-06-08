export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import Link from 'next/link';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Admin Dashboard`,
  description: '',
};

const adminLinks = [
  {
    href: '/admin/ai',
    title: 'AI Settings',
    description: 'Manage AI model providers, governance, and media',
  },
  {
    href: '/admin/channels',
    title: 'Channel Config',
    description: 'Configure channel-specific settings and limits',
  },
  {
    href: '/admin/errors',
    title: 'Error Log',
    description: 'View and triage platform errors',
  },
  {
    href: '/admin/stats',
    title: 'Stats',
    description: 'Platform usage statistics and metrics',
  },
];

export default async function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px]">
      <h3 className="text-[20px]">Administration</h3>
      <p className="text-textColor/60 text-[13px]">
        Super admin tools for managing the platform
      </p>
      <div className="grid grid-cols-2 gap-[12px] mt-[8px]">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-newBgColor border border-tableBorder rounded-[8px] p-[16px] hover:bg-boxHover transition-colors"
          >
            <div className="text-[15px] font-semibold">{link.title}</div>
            <div className="text-[12px] text-textColor/60 mt-[4px]">
              {link.description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

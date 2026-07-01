'use client';

import { FC, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR from 'swr';
import dayjs from 'dayjs';
import Link from 'next/link';
import clsx from 'clsx';
import type { Campaign } from '@gitroom/frontend/components/campaigns/campaign-types';

interface CampaignEngagement {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  topPost: {
    id: string;
    title: string;
    lastViews: number | null;
    lastLikes: number | null;
    lastComments: number | null;
    integration: string;
  } | null;
}

const KebabIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="19" r="1.6" />
  </svg>
);

interface CampaignCardProps {
  campaign: Campaign;
  onEdit: () => void;
  onCopy: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export const CampaignCard: FC<CampaignCardProps> = ({
  campaign,
  onEdit,
  onCopy,
  onArchive,
  onDelete,
}) => {
  const t = useT();
  const fetch = useFetch();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const { data: engagement } = useSWR<CampaignEngagement>(
    `campaign-engagement-${campaign.id}`,
    async () => {
      const r = await fetch(`/campaigns/${campaign.id}/engagement`);
      if (!r.ok) throw new Error('Failed to load campaign engagement');
      return r.json();
    },
    { revalidateOnFocus: false },
  );

  // Menu actions live inside the card <Link>, so every handler must cancel navigation.
  const runAction = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    fn();
  };

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="flex items-stretch justify-between p-[16px] bg-newBgColor border border-newTableBorder rounded-[8px] gap-[16px] hover:bg-newBgColor/80 transition-colors"
      style={campaign.color ? { borderLeftColor: campaign.color, borderLeftWidth: 4 } : undefined}
    >
      <div className="flex-1 flex flex-col gap-[8px] min-w-0">
        <div className="flex items-center justify-between gap-[8px]">
          <div className="flex items-center gap-[8px] min-w-0">
            <span className="text-[15px] font-medium truncate">{campaign.name}</span>
            {campaign.archived && (
              <span className="shrink-0 text-[11px] bg-newTableText/20 text-newTableText px-[6px] py-[1px] rounded-full">
                {t('archived', 'Archived')}
              </span>
            )}
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-label={t('campaign_actions', 'Campaign actions')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="flex items-center justify-center w-[28px] h-[28px] rounded-[6px] text-newTableText hover:text-textColor hover:bg-newTableBorder/40 transition-colors"
            >
              {KebabIcon}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+4px)] z-[50] w-[168px] py-[4px] bg-newBgColorInner border border-newTableBorder rounded-[8px] shadow-lg"
              >
                <button role="menuitem" onClick={runAction(onEdit)} className="w-full text-left px-[12px] py-[8px] text-[13px] text-textColor hover:bg-newTableBorder/40">
                  {t('edit', 'Edit')}
                </button>
                <button role="menuitem" onClick={runAction(onCopy)} className="w-full text-left px-[12px] py-[8px] text-[13px] text-textColor hover:bg-newTableBorder/40">
                  {t('copy', 'Copy')}
                </button>
                <button role="menuitem" onClick={runAction(onArchive)} className="w-full text-left px-[12px] py-[8px] text-[13px] text-textColor hover:bg-newTableBorder/40">
                  {campaign.archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive')}
                </button>
                <button role="menuitem" onClick={runAction(onDelete)} className={clsx('w-full text-left px-[12px] py-[8px] text-[13px] text-red-500 hover:bg-red-500/10')}>
                  {t('delete', 'Delete')}
                </button>
              </div>
            )}
          </div>
        </div>
        {campaign.description && (
          <p className="text-[12px] text-newTableText">{campaign.description}</p>
        )}
        <div className="flex gap-[16px] text-[12px] text-newTableText flex-wrap">
          <span>{campaign._count.posts} {t('posts', 'posts')}</span>
          {campaign.startDate && (
            <span>{dayjs(campaign.startDate).format('MMM D')} - {campaign.endDate ? dayjs(campaign.endDate).format('MMM D, YYYY') : t('ongoing', 'Ongoing')}</span>
          )}
          {campaign.client && (
            <span>{t('client', 'Client')}: {campaign.client}</span>
          )}
          {campaign.project && (
            <span>{t('project', 'Project')}: {campaign.project}</span>
          )}
        </div>
        {!!campaign.tags?.length && (
          <div className="flex flex-wrap items-center gap-[6px]">
            {campaign.tags.map((tag) => (
              <span
                key={tag}
                className="px-[8px] py-[2px] rounded-full bg-btnPrimary/15 text-btnPrimary text-[11px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {engagement && (
          <div className="flex gap-[16px] text-[12px] flex-wrap">
            {engagement.totalViews > 0 && (
              <span className="text-newTableText">
                {t('views', 'Views')}: {Math.round(engagement.totalViews).toLocaleString()}
              </span>
            )}
            {engagement.totalLikes > 0 && (
              <span className="text-newTableText">
                {t('likes', 'Likes')}: {Math.round(engagement.totalLikes).toLocaleString()}
              </span>
            )}
            {engagement.totalComments > 0 && (
              <span className="text-newTableText">
                {t('comments', 'Comments')}: {Math.round(engagement.totalComments).toLocaleString()}
              </span>
            )}
          </div>
        )}
        {engagement?.topPost && (
          <div className="text-[11px] text-newTableText/70">
            {t('top_post', 'Top Post')}: {engagement.topPost.title} ({engagement.topPost.integration})
            {engagement.topPost.lastLikes ? ` — ${Math.round(engagement.topPost.lastLikes)} likes` : ''}
          </div>
        )}
      </div>
    </Link>
  );
};

'use client';

import { FC, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import useSWR, { mutate as swrMutate } from 'swr';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { DataTable, StatusPill } from '@gitroom/frontend/components/ui/data-table';

interface CampaignPost {
  id: string;
  title?: string;
  content?: string;
  publishDate?: string;
  state?: string;
  lastViews?: number | null;
  lastLikes?: number | null;
  lastComments?: number | null;
  integration?: {
    id: string;
    name: string;
    picture?: string;
    providerIdentifier?: string;
  };
}

const STATE_PILL: Record<string, { status: 'green' | 'blue' | 'amber' | 'red'; label: string }> = {
  PUBLISHED: { status: 'green', label: 'Published' },
  QUEUE: { status: 'blue', label: 'Scheduled' },
  DRAFT: { status: 'amber', label: 'Draft' },
};

export const CampaignPostsSection: FC<{ campaignId: string; posts: CampaignPost[] }> = ({
  campaignId,
  posts,
}) => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const setCampaignId = useLaunchStore((state) => state.setCampaignId);

  const { data: integrations } = useSWR<Integrations[]>(
    '/integrations/list',
    async () => {
      const r = await fetch('/integrations/list');
      if (!r.ok) throw new Error('Failed to load channels');
      return (await r.json()).integrations;
    },
    { revalidateOnFocus: false }
  );

  const rows = useMemo(() => {
    return (posts || []).slice().sort((a, b) => {
      const da = a.publishDate ? new Date(a.publishDate).getTime() : 0;
      const db = b.publishDate ? new Date(b.publishDate).getTime() : 0;
      return db - da;
    });
  }, [posts]);

  const grouped = useMemo(() => {
    const map = new Map<string, CampaignPost[]>();
    for (const post of rows) {
      const key = post.publishDate ? dayjs(post.publishDate).format('YYYY-MM-DD') : 'undated';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [rows]);

  const refreshDashboard = useCallback(() => {
    swrMutate(`campaign-dashboard-${campaignId}`);
  }, [campaignId]);

  const openNewDraft = useCallback(() => {
    setCampaignId(campaignId);
    modal.openModal({
      title: t('new_draft', 'New Draft'),
      withCloseButton: true,
      fullScreen: true,
      children: (
        <AddEditModal
          date={newDayjs()}
          integrations={integrations || []}
          allIntegrations={integrations || []}
          reopenModal={() => undefined}
          mutate={refreshDashboard}
          customClose={() => {
            useLaunchStore.getState().setCampaignId(null);
            modal.closeAll();
          }}
        />
      ),
    });
  }, [campaignId, integrations, modal, refreshDashboard, setCampaignId, t]);

  const columns = useMemo(
    () => [
      {
        key: 'date',
        header: t('date', 'Date'),
        width: '140px',
        render: (post: CampaignPost) => (
          <span className="text-[13px] text-textColor">
            {post.publishDate ? dayjs(post.publishDate).format('MMM D, YYYY HH:mm') : '—'}
          </span>
        ),
      },
      {
        key: 'channel',
        header: t('channel', 'Channel'),
        render: (post: CampaignPost) => (
          <div className="flex items-center gap-[8px]">
            {post.integration?.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.integration.picture}
                alt=""
                className="w-[24px] h-[24px] rounded-full object-cover"
              />
            ) : null}
            <span className="text-[13px] text-textColor">
              {post.integration?.name || '—'}
            </span>
          </div>
        ),
      },
      {
        key: 'content',
        header: t('content', 'Content'),
        render: (post: CampaignPost) => (
          <span className="text-[13px] text-textColor line-clamp-1">
            {post.title || post.content?.replace(/<[^>]+>/g, ' ') || '—'}
          </span>
        ),
      },
      {
        key: 'state',
        header: t('status', 'Status'),
        width: '110px',
        render: (post: CampaignPost) => {
          const pill = STATE_PILL[post.state || ''] || { status: 'blue' as const, label: post.state || '—' };
          return <StatusPill status={pill.status} label={pill.label} />;
        },
      },
      {
        key: 'engagement',
        header: t('engagement', 'Engagement'),
        width: '180px',
        render: (post: CampaignPost) => (
          <div className="flex items-center gap-[12px] text-[12px] text-newTableText">
            <span>{Math.round(post.lastViews || 0).toLocaleString()} {t('views', 'views')}</span>
            <span>{Math.round(post.lastLikes || 0).toLocaleString()} {t('likes', 'likes')}</span>
            <span>{Math.round(post.lastComments || 0).toLocaleString()} {t('comments', 'comments')}</span>
          </div>
        ),
      },
    ],
    [t]
  );

  return (
    <div className="p-[16px] border border-newTableBorder rounded-[12px] bg-newBgColor flex flex-col gap-[12px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-textColor">{t('posts', 'Posts')}</h3>
        <Button onClick={openNewDraft} className="!h-[32px] !px-[12px] text-[13px]">
          {t('new_draft', 'New Draft')}
        </Button>
      </div>

      {grouped.length === 0 ? (
        <DataTable<CampaignPost>
          columns={columns}
          data={[]}
          keyExtractor={(post) => post.id}
          emptyState={{
            title: t('no_posts', 'No posts yet'),
            description: t(
              'campaign_posts_empty_hint',
              'Create a draft to start building this campaign.'
            ),
            action: (
              <Button onClick={openNewDraft} className="!h-[32px] !px-[12px] text-[13px]">
                {t('new_draft', 'New Draft')}
              </Button>
            ),
          }}
        />
      ) : (
        <div className="flex flex-col gap-[16px]">
          {grouped.map(([dateKey, datePosts]) => (
            <div key={dateKey} className="flex flex-col gap-[8px]">
              <div className="text-[13px] font-medium text-textColor">
                {dateKey === 'undated'
                  ? t('undated', 'Undated')
                  : dayjs(dateKey).format('dddd, MMMM D, YYYY')}
              </div>
              <DataTable<CampaignPost>
                columns={columns}
                data={datePosts}
                keyExtractor={(post) => post.id}
                emptyState={{ title: t('no_posts', 'No posts yet') }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

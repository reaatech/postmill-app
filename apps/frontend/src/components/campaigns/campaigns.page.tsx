'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR, { mutate as swrMutate } from 'swr';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { PageHeader } from '@gitroom/frontend/components/ui/page-header';

const PAGE_SIZE = 25;

interface Campaign {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
  createdAt: string;
  _count: { posts: number };
}

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

const CreateEditCampaignModal: FC<{
  editing?: Campaign | null;
  onDone: () => void;
}> = ({ editing, onDone }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const [name, setName] = useState(editing?.name || '');
  const [color, setColor] = useState(editing?.color || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [startDate, setStartDate] = useState(editing?.startDate ? dayjs(editing.startDate).format('YYYY-MM-DD') : '');
  const [endDate, setEndDate] = useState(editing?.endDate ? dayjs(editing.endDate).format('YYYY-MM-DD') : '');

  const save = useCallback(async () => {
    if (!name.trim()) return;
    if (editing) {
      await fetch(`/campaigns/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          color: color || undefined,
          description: description.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      toast.show(t('campaign_updated', 'Campaign updated'), 'success');
    } else {
      await fetch('/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          color: color || undefined,
          description: description.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      toast.show(t('campaign_created', 'Campaign created'), 'success');
    }
    onDone();
  }, [name, color, description, startDate, endDate, editing, fetch, toast, t, onDone]);

  return (
    <div className="flex flex-col gap-[16px] p-[16px] min-w-[400px]">
      <div className="flex flex-col gap-[4px]">
        <label className="text-[12px] text-newTableText">{t('name', 'Name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          placeholder={t('campaign_name_placeholder', 'Campaign name')}
          autoFocus
        />
      </div>
      <div className="flex gap-[8px]">
        <div className="flex flex-col gap-[4px] flex-1">
          <label className="text-[12px] text-newTableText">{t('color', 'Color')}</label>
          <div className="flex gap-[8px] items-center">
            <input
              type="color"
              value={color || '#2b5cd3'}
              onChange={(e) => setColor(e.target.value)}
              className="w-[36px] h-[36px] rounded-[4px] cursor-pointer bg-transparent border-0"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none w-[100px]"
              placeholder="#2b5cd3"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-[4px]">
        <label className="text-[12px] text-newTableText">{t('description', 'Description')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none resize-none min-h-[60px]"
          placeholder={t('campaign_desc_placeholder', 'Optional description')}
        />
      </div>
      <div className="flex gap-[8px]">
        <div className="flex flex-col gap-[4px] flex-1">
          <label className="text-[12px] text-newTableText">{t('start_date', 'Start Date')}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none w-full"
          />
        </div>
        <div className="flex flex-col gap-[4px] flex-1">
          <label className="text-[12px] text-newTableText">{t('end_date', 'End Date')}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none w-full"
          />
        </div>
      </div>
      <div className="flex gap-[8px] justify-end mt-[8px]">
        <Button type="button" secondary onClick={onDone}>{t('cancel', 'Cancel')}</Button>
        <Button type="button" onClick={save} disabled={!name.trim()}>
          {editing ? t('update', 'Update') : t('create', 'Create')}
        </Button>
      </div>
    </div>
  );
};

const CampaignCard: FC<{ campaign: Campaign }> = ({ campaign }) => {
  const t = useT();
  const fetch = useFetch();
  const { data: engagement } = useSWR<CampaignEngagement>(
    `campaign-engagement-${campaign.id}`,
    async () => {
      const r = await fetch(`/campaigns/${campaign.id}/engagement`);
      if (!r.ok) throw new Error('Failed to load campaign engagement');
      return r.json();
    },
    { revalidateOnFocus: false },
  );

  return (
    <div
      className="flex items-stretch justify-between p-[16px] bg-newBgColor border border-newTableBorder rounded-[8px] gap-[16px]"
      style={campaign.color ? { borderLeftColor: campaign.color, borderLeftWidth: 4 } : undefined}
    >
      <div className="flex-1 flex flex-col gap-[8px]">
        <div className="flex items-center gap-[8px]">
          <span className="text-[15px] font-medium">{campaign.name}</span>
          {campaign.archived && (
            <span className="text-[11px] bg-newTableText/20 text-newTableText px-[6px] py-[1px] rounded-full">
              {t('archived', 'Archived')}
            </span>
          )}
        </div>
        {campaign.description && (
          <p className="text-[12px] text-newTableText">{campaign.description}</p>
        )}
        <div className="flex gap-[16px] text-[12px] text-newTableText flex-wrap">
          <span>{campaign._count.posts} {t('posts', 'posts')}</span>
          {campaign.startDate && (
            <span>{dayjs(campaign.startDate).format('MMM D')} - {campaign.endDate ? dayjs(campaign.endDate).format('MMM D, YYYY') : t('ongoing', 'Ongoing')}</span>
          )}
        </div>
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
    </div>
  );
};

export const CampaignsPage: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const toast = useToaster();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'posts'>('created');
  const [page, setPage] = useState(0);

  const { data: campaigns, error, isLoading } = useSWR<Campaign[]>(
    '/campaigns',
    async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error('Failed to load campaigns');
      return r.json();
    },
  );

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    let list = [...campaigns];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
    }
    if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'posts') list.sort((a, b) => b._count.posts - a._count.posts);
    else list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const start = page * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [campaigns, search, sortBy, page]);

  const totalPages = campaigns ? Math.ceil(campaigns.length / PAGE_SIZE) : 0;

  const openCreateModal = useCallback((campaign?: Campaign) => {
    modal.openModal({
      title: campaign ? t('edit_campaign', 'Edit Campaign') : t('new_campaign', 'New Campaign'),
      withCloseButton: true,
      children: (
        <CreateEditCampaignModal
          editing={campaign || null}
          onDone={() => {
            modal.closeAll();
            swrMutate('/campaigns');
          }}
        />
      ),
    });
  }, [modal, t]);

  const remove = useCallback(async (id: string) => {
    if (await deleteDialog(t('are_you_sure_delete_campaign', 'Are you sure you want to delete this campaign?'))) {
      await fetch(`/campaigns/${id}`, { method: 'DELETE' });
      toast.show(t('campaign_deleted', 'Campaign deleted'), 'success');
      swrMutate('/campaigns');
    }
  }, [fetch, toast, t]);

  const archiveCampaign = useCallback(async (campaign: Campaign) => {
    await fetch(`/campaigns/${campaign.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !campaign.archived }),
    });
    toast.show(
      campaign.archived ? t('campaign_unarchived', 'Campaign unarchived') : t('campaign_archived', 'Campaign archived'),
      'success',
    );
    swrMutate('/campaigns');
  }, [fetch, toast, t]);

  return (
    <div className="flex-1 flex flex-col p-[24px] gap-[24px]">
      <PageHeader title="Campaigns" description="Organize posts into campaign folders" />

      <div className="flex items-center gap-[12px]">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('search_campaigns', 'Search campaigns...')}
            className="w-full px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as 'name' | 'created' | 'posts'); setPage(0); }}
          className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
        >
          <option value="created">{t('newest_first', 'Newest')}</option>
          <option value="name">{t('name', 'Name')}</option>
          <option value="posts">{t('most_posts', 'Most Posts')}</option>
        </select>
        <Button onClick={() => openCreateModal()}>{t('create_campaign', 'Create Campaign')}</Button>
      </div>

      {error && (
        <div className="text-red-500 text-[13px]">
          {t('campaigns_load_error', 'Failed to load campaigns')}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-[60px] text-newTableText">
          {t('loading', 'Loading...')}
        </div>
      )}

      {!isLoading && campaigns && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-[60px] gap-[16px]">
          <div className="text-[16px] text-newTableText">{t('campaigns_empty', 'No campaigns yet')}</div>
          <p className="text-[13px] text-newTableText/70 max-w-[400px] text-center">
            {t('campaigns_empty_hint', 'Campaigns let you group related posts together to track their collective performance and measure the impact of your marketing initiatives.')}
          </p>
          <Button onClick={() => openCreateModal()}>{t('create_first_campaign', 'Create your first campaign')}</Button>
        </div>
      )}

      {!isLoading && campaigns && campaigns.length > 0 && (
        <div className="grid gap-[12px]">
          {filtered.map((campaign) => (
            <div
              key={campaign.id}
              className="flex flex-col bg-newBgColor border border-newTableBorder rounded-[8px]"
              style={campaign.color ? { borderLeftColor: campaign.color, borderLeftWidth: 4 } : undefined}
            >
              <CampaignCard campaign={campaign} />
              <div className="flex items-center gap-[8px] justify-end px-[16px] pb-[12px]">
                <button
                  onClick={() => openCreateModal(campaign)}
                  className="px-[8px] py-[4px] text-[12px] bg-btnPrimary text-white rounded-[8px]"
                >
                  {t('edit', 'Edit')}
                </button>
                {campaign.archived ? (
                  <button
                    onClick={() => archiveCampaign(campaign)}
                    className="px-[8px] py-[4px] text-[12px] border border-newTableBorder text-newTableText rounded-[4px]"
                  >
                    {t('unarchive', 'Unarchive')}
                  </button>
                ) : (
                  <button
                    onClick={() => archiveCampaign(campaign)}
                    className="px-[8px] py-[4px] text-[12px] bg-amber-500 text-white rounded-[4px]"
                  >
                    {t('archive', 'Archive')}
                  </button>
                )}
                <button
                  onClick={() => remove(campaign.id)}
                  className="px-[8px] py-[4px] text-[12px] bg-red-500 text-white rounded-[4px]"
                >
                  {t('delete', 'Delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-[16px]">
          <div className="text-[12px] text-newTableText">
            {t('page_of', 'Page {page} of {total}', { page: String(page + 1), total: String(totalPages) })}
          </div>
          <div className="flex gap-[8px]">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-newTableBorder rounded-[8px] disabled:opacity-40"
            >
              {t('previous', 'Previous')}
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-[12px] py-[6px] text-[13px] bg-newBgColor border border-newTableBorder rounded-[8px] disabled:opacity-40"
            >
              {t('next', 'Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

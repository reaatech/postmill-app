'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR, { mutate as swrMutate } from 'swr';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useToaster } from '@gitroom/react/toaster/toaster';
import dayjs from 'dayjs';
import { PageHeader } from '@gitroom/frontend/components/ui/page-header';
import { CreateEditCampaignModal } from '@gitroom/frontend/components/campaigns/index/create-edit-campaign.modal';
import { CopyCampaignModal } from '@gitroom/frontend/components/campaigns/index/copy-campaign.modal';
import { CampaignCard } from '@gitroom/frontend/components/campaigns/index/campaign-card';
import type { Campaign } from '@gitroom/frontend/components/campaigns/campaign-types';

const PAGE_SIZE = 25;

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

  const openCopyModal = useCallback((campaign: Campaign) => {
    modal.openModal({
      title: t('copy_campaign', 'Copy Campaign'),
      withCloseButton: true,
      children: (
        <CopyCampaignModal
          campaignId={campaign.id}
          name={campaign.name}
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
            >
              <CampaignCard campaign={campaign} />
              <div className="flex items-center gap-[8px] justify-end px-[16px] pb-[12px]">
                <button
                  onClick={(e) => { e.preventDefault(); openCreateModal(campaign); }}
                  className="px-[8px] py-[4px] text-[12px] bg-btnPrimary text-white rounded-[8px]"
                >
                  {t('edit', 'Edit')}
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); openCopyModal(campaign); }}
                  className="px-[8px] py-[4px] text-[12px] bg-newBgColor border border-newTableBorder text-textColor rounded-[4px]"
                >
                  {t('copy', 'Copy')}
                </button>
                {campaign.archived ? (
                  <button
                    onClick={(e) => { e.preventDefault(); archiveCampaign(campaign); }}
                    className="px-[8px] py-[4px] text-[12px] border border-newTableBorder text-newTableText rounded-[4px]"
                  >
                    {t('unarchive', 'Unarchive')}
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.preventDefault(); archiveCampaign(campaign); }}
                    className="px-[8px] py-[4px] text-[12px] bg-amber-500 text-white rounded-[4px]"
                  >
                    {t('archive', 'Archive')}
                  </button>
                )}
                <button
                  onClick={(e) => { e.preventDefault(); remove(campaign.id); }}
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

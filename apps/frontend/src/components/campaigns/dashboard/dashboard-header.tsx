'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import Link from 'next/link';
import dayjs from 'dayjs';
import { ChevronDownIcon } from '@gitroom/frontend/components/ui/icons';
import { CreateEditCampaignModal } from '@gitroom/frontend/components/campaigns/index/create-edit-campaign.modal';
import { CopyCampaignModal } from '@gitroom/frontend/components/campaigns/index/copy-campaign.modal';
import type { Campaign } from '@gitroom/frontend/components/campaigns/campaign-types';

interface DashboardHeaderProps {
  campaign: Campaign & {
    createdBy?: { id?: string | null; name?: string | null; email?: string | null } | null;
    shareToken?: string | null;
    shareEnabled?: boolean;
  };
  onMutate: () => void;
}

const StatusBadge: FC<{ archived: boolean }> = ({ archived }) => {
  const t = useT();
  if (archived) {
    return (
      <span className="text-[11px] bg-newTableText/20 text-newTableText px-[8px] py-[2px] rounded-full">
        {t('archived', 'Archived')}
      </span>
    );
  }
  return (
    <span className="text-[11px] bg-green-500/10 text-green-400 px-[8px] py-[2px] rounded-full">
      {t('active', 'Active')}
    </span>
  );
};

export const DashboardHeader: FC<DashboardHeaderProps> = ({ campaign, onMutate }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const modal = useModals();
  const [shareEnabled, setShareEnabled] = useState(!!campaign.shareEnabled);
  const [shareToken, setShareToken] = useState(campaign.shareToken || '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const publicUrl = useMemo(() => {
    if (!shareEnabled || !shareToken || !origin) return '';
    return `${origin}/share/campaign/${shareToken}`;
  }, [shareEnabled, shareToken, origin]);

  const openEditModal = useCallback(() => {
    modal.openModal({
      title: t('edit_campaign', 'Edit Campaign'),
      withCloseButton: true,
      children: (
        <CreateEditCampaignModal
          editing={campaign}
          onDone={() => {
            modal.closeAll();
            onMutate();
          }}
        />
      ),
    });
  }, [modal, t, campaign, onMutate]);

  const openCopyModal = useCallback(() => {
    modal.openModal({
      title: t('copy_campaign', 'Copy Campaign'),
      withCloseButton: true,
      children: <CopyCampaignModal campaignId={campaign.id} name={campaign.name} onDone={() => modal.closeAll()} />,
    });
  }, [modal, t, campaign]);

  const archiveCampaign = useCallback(async () => {
    await fetch(`/campaigns/${campaign.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !campaign.archived }),
    });
    toast.show(
      campaign.archived ? t('campaign_unarchived', 'Campaign unarchived') : t('campaign_archived', 'Campaign archived'),
      'success'
    );
    onMutate();
  }, [fetch, toast, t, campaign, onMutate]);

  const removeCampaign = useCallback(async () => {
    if (await deleteDialog(t('are_you_sure_delete_campaign', 'Are you sure you want to delete this campaign?'))) {
      await fetch(`/campaigns/${campaign.id}`, { method: 'DELETE' });
      toast.show(t('campaign_deleted', 'Campaign deleted'), 'success');
      onMutate();
    }
  }, [fetch, toast, t, campaign, onMutate]);

  const shareCampaign = useCallback(async () => {
    const r = await fetch(`/campaigns/${campaign.id}/share`, { method: 'POST' });
    if (!r.ok) {
      toast.show(t('share_failed', 'Failed to create share link'), 'warning');
      return;
    }
    const updated = await r.json();
    setShareEnabled(true);
    setShareToken(updated.shareToken || '');
    onMutate();
    toast.show(t('share_enabled', 'Public share link created'), 'success');
  }, [fetch, toast, t, campaign, onMutate]);

  const deleteShare = useCallback(async () => {
    const r = await fetch(`/campaigns/${campaign.id}/share`, { method: 'DELETE' });
    if (!r.ok) {
      toast.show(t('share_delete_failed', 'Failed to remove share link'), 'warning');
      return;
    }
    setShareEnabled(false);
    setShareToken('');
    onMutate();
    toast.show(t('share_removed', 'Public share link removed'), 'success');
  }, [fetch, toast, t, campaign, onMutate]);

  const copyPublicUrl = useCallback(() => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast.show(t('link_copied_to_clipboard', 'Link copied to clipboard'), 'success');
  }, [publicUrl, toast, t]);

  const exportUrl = useCallback((format: string) => `/campaigns/${campaign.id}/report?format=${format}`, [campaign.id]);

  const createdByName = campaign.createdBy?.name || campaign.createdBy?.email || t('unknown', 'Unknown');
  const createdByElement = campaign.createdBy?.id ? (
    <Link
      href={`/profile/${campaign.createdBy.id}`}
      className="text-btnPrimary hover:underline"
    >
      {createdByName}
    </Link>
  ) : (
    createdByName
  );

  return (
    <div className="flex flex-col gap-[16px] p-[16px] border border-newTableBorder rounded-[12px] bg-newBgColor">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-[12px]">
        <div className="flex flex-col gap-[8px]">
          <div className="flex items-center gap-[12px]">
            <div
              className="w-[16px] h-[16px] rounded-full border border-newTableBorder"
              style={{ backgroundColor: campaign.color || '#2b5cd3' }}
            />
            <h1 className="text-[24px] font-semibold text-textColor">{campaign.name}</h1>
            <StatusBadge archived={campaign.archived} />
          </div>
          {campaign.description && (
            <p className="text-[13px] text-newTableText">{campaign.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-[12px] text-[12px] text-newTableText">
            {(campaign.startDate || campaign.endDate) && (
              <span>
                {campaign.startDate ? dayjs(campaign.startDate).format('MMM D, YYYY') : t('no_start_date', 'No start date')}
                {' — '}
                {campaign.endDate ? dayjs(campaign.endDate).format('MMM D, YYYY') : t('ongoing', 'Ongoing')}
              </span>
            )}
            {campaign.client && (
              <span>{t('client', 'Client')}: {campaign.client}</span>
            )}
            {campaign.project && (
              <span>{t('project', 'Project')}: {campaign.project}</span>
            )}
            <span>{t('created_by', 'Created by')} {createdByElement}</span>
            <span>{t('created_on', 'Created on')} {dayjs(campaign.createdAt).format('MMM D, YYYY')}</span>
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
        </div>

        <div className="flex flex-wrap items-center gap-[8px]">
          <Button onClick={openEditModal}>{t('edit', 'Edit')}</Button>
          <Button secondary onClick={openCopyModal}>{t('copy', 'Copy')}</Button>
          <Button secondary onClick={archiveCampaign}>
            {campaign.archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive')}
          </Button>
          <Button danger onClick={removeCampaign}>{t('delete', 'Delete')}</Button>

          <details className="relative group">
            <summary className="list-none cursor-pointer">
              <Button secondary className="gap-[8px]">
                {t('export', 'Export')}
                <ChevronDownIcon size={16} />
              </Button>
            </summary>
            <div className="absolute right-0 mt-[8px] min-w-[160px] bg-newBgColor border border-newTableBorder rounded-[8px] shadow-lg overflow-hidden z-[20]">
              <a
                href={exportUrl('csv')}
                download
                className="block px-[12px] py-[8px] text-[13px] text-textColor hover:bg-newBgColor/80"
              >
                {t('download_csv', 'Download CSV')}
              </a>
              <a
                href={exportUrl('pdf')}
                download
                className="block px-[12px] py-[8px] text-[13px] text-textColor hover:bg-newBgColor/80"
              >
                {t('download_pdf', 'Download PDF')}
              </a>
            </div>
          </details>

          {shareEnabled && publicUrl ? (
            <Button danger onClick={deleteShare}>{t('delete_share', 'Delete Share')}</Button>
          ) : (
            <Button onClick={shareCampaign}>{t('share', 'Share')}</Button>
          )}
        </div>
      </div>

      {shareEnabled && publicUrl && (
        <div className="flex flex-col sm:flex-row gap-[8px] items-start sm:items-center p-[12px] bg-newBgColor border border-newTableBorder rounded-[8px]">
          <span className="text-[12px] text-newTableText flex-1 truncate">{publicUrl}</span>
          <Button onClick={copyPublicUrl}>{t('copy_link', 'Copy Link')}</Button>
        </div>
      )}
    </div>
  );
};

'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Button } from '@gitroom/react/form/button';
import {
  DataTable,
  StatusPill,
  AvatarCell,
} from '@gitroom/frontend/components/ui/data-table';
import { useCampaignDrafts } from '@gitroom/frontend/components/campaigns/hooks/campaign.hooks';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

interface DraftPost {
  id: string;
  content?: string;
  publishDate?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | null;
  integration?: {
    id: string;
    name: string;
    providerIdentifier: string;
    picture?: string | null;
  };
}

const stripHtml = (html?: string) => {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

export const PlanningWorkspace: FC<{ campaignId: string; onMutate: () => void }> = ({
  campaignId,
  onMutate,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const modals = useModals();
  const { data, error, mutate } = useCampaignDrafts(campaignId);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [blockedResults, setBlockedResults] = useState<
    Array<{ id: string; status: 'blocked' | 'not_found'; reason?: string }>
  >([]);

  const groups = useMemo(() => Object.entries(data || {}), [data]);
  const flatPosts = useMemo(
    () => groups.flatMap(([, posts]) => posts) as DraftPost[],
    [groups]
  );

  useEffect(() => {
    // Drop stale selections when drafts reload.
    setSelectedIds((prev) => prev.filter((id) => flatPosts.some((p) => p.id === id)));
  }, [flatPosts]);

  const handleApprove = useCallback(
    async (postId: string) => {
      setActingId(postId);
      const res = await fetch(`/campaigns/${campaignId}/drafts/${postId}/approve`, {
        method: 'POST',
      });
      setActingId(null);
      if (!res.ok) {
        toast.show(t('approve_failed', 'Failed to approve draft'), 'warning');
        return;
      }
      toast.show(t('draft_approved', 'Draft approved'), 'success');
      mutate();
      onMutate();
    },
    [campaignId, fetch, mutate, onMutate, t, toast]
  );

  const handleReject = useCallback(
    async (postId: string) => {
      setActingId(postId);
      const res = await fetch(`/campaigns/${campaignId}/drafts/${postId}/reject`, {
        method: 'POST',
      });
      setActingId(null);
      if (!res.ok) {
        toast.show(t('reject_failed', 'Failed to reject draft'), 'warning');
        return;
      }
      toast.show(t('draft_rejected', 'Draft rejected'), 'success');
      mutate();
      onMutate();
    },
    [campaignId, fetch, mutate, onMutate, t, toast]
  );

  const runPromote = useCallback(async (postIds: string[]) => {
    if (!postIds.length) return;
    setPromoting(true);
    const res = await fetch(`/campaigns/${campaignId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postIds }),
    });
    setPromoting(false);
    if (!res.ok) {
      toast.show(t('promote_failed', 'Failed to promote drafts'), 'warning');
      return;
    }
    const results = (await res.json()) as Array<{
      id: string;
      status: 'promoted' | 'blocked' | 'not_found';
      reason?: string;
    }>;
    const promoted = results.filter((r) => r.status === 'promoted');
    const blocked = results
      .filter((r) => r.status !== 'promoted')
      .map((r) => ({ id: r.id, status: r.status as 'blocked' | 'not_found', reason: r.reason }));

    if (promoted.length) {
      toast.show(
        t('promoted_n_drafts', 'Promoted {count} drafts', { count: promoted.length }),
        'success'
      );
    }
    setBlockedResults(blocked);
    setSelectedIds((prev) => prev.filter((id) => !postIds.includes(id)));
    mutate();
    onMutate();
  }, [campaignId, fetch, mutate, onMutate, t, toast]);

  const handlePromote = useCallback(() => runPromote(selectedIds), [runPromote, selectedIds]);

  const openNewDraft = useCallback(async () => {
    const listRes = await fetch('/integrations/list');
    if (!listRes.ok) {
      toast.show(t('failed_load_integrations', 'Failed to load channels'), 'warning');
      return;
    }
    const { integrations } = await listRes.json();
    if (!integrations?.length) {
      toast.show(t('no_integrations', 'No channels available'), 'warning');
      return;
    }

    useLaunchStore.getState().setCampaignId(campaignId);
    const dayjs = (await import('dayjs')).default;

    modals.openModal({
      fullScreen: true,
      removeLayout: true,
      withCloseButton: false,
      children: (
        <AddEditModal
          date={dayjs()}
          integrations={integrations}
          allIntegrations={integrations}
          mutate={() => {
            mutate();
            onMutate();
          }}
          reopenModal={() => {}}
          customClose={() => {
            useLaunchStore.getState().setCampaignId(null);
            modals.closeAll();
          }}
        />
      ),
    });
  }, [campaignId, fetch, modals, mutate, onMutate, t, toast]);

  const blockedMessages = useMemo(() => {
    return blockedResults.map((r) => {
      const post = flatPosts.find((p) => p.id === r.id);
      const label = post ? stripHtml(post.content).slice(0, 40) || post.id : r.id;
      return {
        id: r.id,
        text:
          r.status === 'not_found'
            ? t('draft_not_found', '"{label}" was not found', { label })
            : t('draft_blocked', '"{label}" blocked: {reason}', {
                label,
                reason: r.reason || t('unknown_reason', 'Unknown reason'),
              }),
      };
    });
  }, [blockedResults, flatPosts, t]);

  const renderTable = (group: string, posts: DraftPost[]) => {
    const groupIds = posts.map((p) => p.id);
    const handleGroupSelectionChange = (ids: string[]) => {
      setSelectedIds((prev) => [
        ...prev.filter((id) => !groupIds.includes(id)),
        ...ids,
      ]);
    };

    return (
      <DataTable<DraftPost>
        key={group}
        columns={[
          {
            key: 'content',
            header: t('content', 'Content'),
            render: (post) => (
              <span className="text-[13px] text-textColor line-clamp-2">
                {stripHtml(post.content) || t('no_content', 'No content')}
              </span>
            ),
          },
          {
            key: 'channel',
            header: t('channel', 'Channel'),
            render: (post) =>
              post.integration ? (
                <AvatarCell
                  src={post.integration.picture || `/icons/platforms/${post.integration.providerIdentifier}.png`}
                  name={post.integration.name}
                />
              ) : (
                '—'
              ),
          },
          {
            key: 'schedule',
            header: t('schedule', 'Schedule'),
            render: (post) =>
              post.publishDate ? (
                <span className="text-[13px] text-newTableText">
                  {dayjs(post.publishDate).format('MMM D, YYYY h:mm A')}
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'approval',
            header: t('approval', 'Approval'),
            render: (post) => {
              const status = post.approvalStatus || 'pending';
              const map: Record<string, { color: 'amber' | 'green' | 'red'; label: string }> = {
                pending: { color: 'amber', label: t('pending', 'Pending') },
                approved: { color: 'green', label: t('approved', 'Approved') },
                rejected: { color: 'red', label: t('rejected', 'Rejected') },
              };
              const pill = map[status] || map.pending;
              return <StatusPill status={pill.color} label={pill.label} />;
            },
          },
          {
            key: 'actions',
            header: '',
            width: '160px',
            render: (post) => {
              const busy = actingId === post.id;
              return (
                <div className="flex items-center gap-[6px]" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleApprove(post.id)}
                    disabled={busy || post.approvalStatus === 'approved'}
                    className={clsx(
                      'px-[8px] py-[4px] text-[11px] rounded-[6px] font-medium',
                      post.approvalStatus === 'approved'
                        ? 'bg-green-500/10 text-green-500 cursor-default'
                        : 'bg-btnPrimary text-white hover:bg-btnPrimary/90'
                    )}
                  >
                    {t('approve', 'Approve')}
                  </button>
                  <button
                    onClick={() => handleReject(post.id)}
                    disabled={busy || post.approvalStatus === 'rejected'}
                    className={clsx(
                      'px-[8px] py-[4px] text-[11px] rounded-[6px] font-medium',
                      post.approvalStatus === 'rejected'
                        ? 'bg-red-500/10 text-red-400 cursor-default'
                        : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    )}
                  >
                    {t('reject', 'Reject')}
                  </button>
                  {post.approvalStatus === 'approved' && (
                    <button
                      onClick={() => runPromote([post.id])}
                      disabled={promoting}
                      className="px-[8px] py-[4px] text-[11px] rounded-[6px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                    >
                      {t('promote', 'Promote')}
                    </button>
                  )}
                </div>
              );
            },
          },
        ]}
        data={posts}
        keyExtractor={(post) => post.id}
        selectedIds={selectedIds}
        onSelectionChange={handleGroupSelectionChange}
        emptyState={{
          title: t('no_drafts_in_group', 'No drafts in {group}', { group }),
          action: (
            <Button type="button" onClick={openNewDraft}>
              {t('new_draft', 'New Draft')}
            </Button>
          ),
        }}
      />
    );
  };

  return (
    <div className="p-[16px] border border-newTableBorder rounded-[12px] bg-newBgColor flex flex-col gap-[16px]">
      <div className="flex items-center justify-between gap-[12px]">
        <h3 className="text-[16px] font-semibold text-textColor">
          {t('planning_workspace', 'Planning Workspace')}
        </h3>
        <div className="flex items-center gap-[8px]">
          {selectedIds.length > 0 && (
            <Button type="button" onClick={handlePromote} loading={promoting}>
              {t('promote_selected', 'Promote {count}', { count: selectedIds.length })}
            </Button>
          )}
          <Button type="button" onClick={openNewDraft}>
            {t('new_draft', 'New Draft')}
          </Button>
        </div>
      </div>

      {blockedMessages.length > 0 && (
        <div className="rounded-[8px] border border-red-500/30 bg-red-500/10 p-[12px] flex flex-col gap-[6px]">
          <span className="text-[13px] font-medium text-red-400">
            {t('promote_blocked', 'Some drafts could not be promoted')}
          </span>
          <ul className="list-disc list-inside text-[12px] text-red-300">
            {blockedMessages.map((m) => (
              <li key={m.id}>{m.text}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="text-[13px] text-red-500">
          {t('drafts_load_error', 'Failed to load drafts')}
        </div>
      )}

      {!error && !data && (
        <div className="text-[13px] text-newTableText">
          {t('loading', 'Loading…')}
        </div>
      )}

      {!error && data && groups.length === 0 && (
        <div className="flex flex-col items-center gap-[12px] py-[32px]">
          <p className="text-[13px] text-newTableText">
            {t('no_drafts', 'No drafts yet')}
          </p>
          <Button type="button" onClick={openNewDraft}>
            {t('new_draft', 'New Draft')}
          </Button>
        </div>
      )}

      {!error &&
        data &&
        groups.map(([group, posts]) => (
          <div key={group} className="flex flex-col gap-[8px]">
            <div className="text-[13px] font-medium text-newTableText px-[4px]">
              {group}
            </div>
            {renderTable(group, posts as DraftPost[])}
          </div>
        ))}
    </div>
  );
};

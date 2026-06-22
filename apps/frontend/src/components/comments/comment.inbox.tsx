'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CommentInboxFilters, InboxFilters } from './comment.inbox.filters';
import { PageHeader } from '@gitroom/frontend/components/ui/page-header';

interface InboxComment {
  id: string;
  content: string;
  authorName: string;
  authorPicture?: string;
  platformCreatedAt: string;
  status?: string;
  isOwn: boolean;
  post?: {
    id: string;
    content?: string;
    integration?: {
      name: string;
      providerIdentifier: string;
      picture?: string;
    };
  };
}

interface InboxResponse {
  comments: InboxComment[];
  nextCursor?: string;
}

export const CommentInbox: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const [filters, setFilters] = useState<InboxFilters>({ unreadOnly: false });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const buildKey = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.unreadOnly) params.set('unreadOnly', 'true');
    if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
    if (cursor) params.set('cursor', cursor);
    return `/posts/inbox?${params.toString()}`;
  }, [filters, cursor]);

  const { data, isLoading, error, mutate } = useSWR<InboxResponse>(
    buildKey(),
    async (key: string) => {
      const res = await fetch(key);
      setStatusCode(res.status);
      if (!res.ok) throw new Error(res.status === 402 ? 'UPGRADE_REQUIRED' : 'Failed to fetch inbox');
      return res.json();
    },
    { revalidateOnFocus: false }
  );

  const handleMarkRead = useCallback(
    async (commentId: string) => {
      await fetch('/posts/inbox/bulk-read', {
        method: 'POST',
        body: JSON.stringify({ commentIds: [commentId] }),
      });
      mutate();
    },
    [fetch, mutate]
  );

  const loadMore = useCallback(() => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  }, [data]);

  const handleFiltersChange = useCallback((newFilters: InboxFilters) => {
    setFilters(newFilters);
    setCursor(undefined);
  }, []);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/posts/inbox/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setLastSynced(data.timestamp);
        mutate();
      }
    } catch {
      // sync failure is non-fatal
    } finally {
      setSyncing(false);
    }
  }, [fetch, mutate]);

  const syncAction = (
    <div className="flex items-center gap-[8px] shrink-0">
      {lastSynced && (
        <span className="text-[11px] text-newTableText">
          {t('comment_inbox.last_synced', 'Last synced')}: {dayjs(lastSynced).format('HH:mm')}
        </span>
      )}
      <button
        onClick={handleSyncNow}
        disabled={syncing}
        className="px-[12px] py-[6px] bg-btnPrimary text-white text-[12px] font-medium rounded-[6px] transition-colors hover:bg-btnPrimary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {syncing
          ? t('comment_inbox.syncing', 'Syncing...')
          : t('comment_inbox.sync_now', 'Sync now')}
      </button>
    </div>
  );

  if (error && statusCode === 402) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-[var(--negative,#f97066)]/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--negative,#f97066)]">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-textColor text-[14px] font-medium mb-[8px]">
          {t('comment_inbox.upgrade_required', 'Comments not available on your current plan')}
        </p>
        <p className="text-newTableText text-[12px] mb-[16px] max-w-[360px]">
          {t('comment_inbox.upgrade_description', 'Upgrade your plan to access the unified comment inbox across all your social channels.')}
        </p>
        <a
          href="/billing"
          className="px-[20px] py-[8px] bg-btnPrimary text-white text-[13px] font-medium rounded-[8px] transition-colors hover:opacity-80"
        >
          {t('comment_inbox.upgrade_cta', 'Upgrade Plan')}
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-[var(--negative,#f97066)]/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--negative,#f97066)]">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
        </div>
        <p className="text-newTableText text-[14px] mb-[12px]">
          {t('comment_inbox.failed_to_load', 'Failed to load inbox')}
        </p>
        <p className="text-[12px] text-newTableText/60">{error.message}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between gap-[12px]">
        <CommentInboxFilters filters={filters} onChange={handleFiltersChange} />
      </div>
        <div className="space-y-[8px] animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-newBgColorInner rounded-[8px] border border-newTableBorder p-[16px] flex items-start gap-[12px]">
              <div className="w-[36px] h-[36px] rounded-full bg-newTableHeader flex-shrink-0" />
              <div className="flex-1 space-y-[8px]">
                <div className="h-[14px] w-[180px] bg-newTableHeader rounded-[4px]" />
                <div className="h-[12px] w-full bg-newTableHeader rounded-[4px]" />
                <div className="h-[12px] w-3/4 bg-newTableHeader rounded-[4px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const comments = data?.comments || [];

  return (
    <div className="flex flex-col gap-[16px]">
      <PageHeader title="Inbox" description="Manage and respond to comments across channels" action={syncAction} />

      <div className="flex items-center justify-between gap-[12px]">
        <CommentInboxFilters filters={filters} onChange={handleFiltersChange} />
      </div>

      {!isLoading && comments.length === 0 && (
        <div className="flex items-center justify-center h-[200px] text-newTableText">
          {t('comment_inbox.no_comments', 'No comments found matching your filters')}
        </div>
      )}

      <div className="flex flex-col gap-[8px]">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="bg-newBgColorInner rounded-[8px] border border-newTableBorder p-[16px] flex items-start gap-[12px]"
          >
            {comment.authorPicture ? (
              <img
                src={comment.authorPicture}
                alt={comment.authorName}
                className="w-[36px] h-[36px] rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-[36px] h-[36px] rounded-full bg-btnPrimary flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0">
                {comment.authorName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[8px] mb-[4px]">
                <span className="text-[13px] font-semibold text-textColor">
                  {comment.authorName}
                </span>
                {comment.post?.integration && (
                  <span className="text-[11px] text-newTableText">
                    {t('comment_inbox.on_platform', `on ${comment.post.integration.name}`)}
                  </span>
                )}
                <span className="text-[11px] text-newTableText ml-auto">
                  {dayjs(comment.platformCreatedAt).fromNow()}
                </span>
              </div>
              <p className="text-[13px] text-textColor break-words mb-[8px]">
                {comment.content}
              </p>
              {comment.post && (
                <div className="text-[11px] text-newTableText mb-[8px]">
                    {t('comment_inbox.post_label', `Post: ${comment.post.content?.substring(0, 100) || comment.post.id}`)}
                </div>
              )}
              <div className="flex gap-[8px]">
                {comment.status !== 'handled' && (
                  <button
                    onClick={() => handleMarkRead(comment.id)}
                    className="text-[12px] text-textColor hover:underline"
                  >
                    {t('comment_inbox.mark_handled', 'Mark handled')}
                  </button>
                )}
                {comment.status && (
                  <span className="text-[11px] text-newTableText capitalize">
                    {comment.status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {data?.nextCursor && (
        <button
          onClick={loadMore}
          className="self-center px-[20px] py-[8px] bg-btnPrimary text-white text-[13px] font-medium rounded-[8px] transition-colors hover:bg-btnPrimary/90"
        >
          {t('comment_inbox.load_more', 'Load more')}
        </button>
      )}
    </div>
  );
};

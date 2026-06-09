'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CommentInboxFilters, InboxFilters } from './comment.inbox.filters';
import { useVariables } from '@gitroom/react/helpers/variable.context';

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
  const { runCron } = useVariables();
  const [filters, setFilters] = useState<InboxFilters>({ unreadOnly: false });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [statusCode, setStatusCode] = useState<number | null>(null);

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
          className="px-[20px] py-[8px] bg-forth text-white text-[13px] font-medium rounded-[8px] transition-colors hover:opacity-80"
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
        <CommentInboxFilters filters={filters} onChange={handleFiltersChange} />
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
      {!runCron && (
        <div className="flex items-center gap-[8px] px-[16px] py-[10px] bg-amber-500/10 border border-amber-500/30 rounded-[8px] text-[12px] text-amber-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {t('comment_inbox.cron_banner', 'Comment sync requires the background cron worker to be running. Set RUN_CRON=true in your environment to enable automatic comment collection.')}
          </span>
        </div>
      )}

      <CommentInboxFilters filters={filters} onChange={handleFiltersChange} />

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
              <div className="w-[36px] h-[36px] rounded-full bg-forth flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0">
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
                    className="text-[12px] text-forth hover:underline"
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
          className="self-center px-[20px] py-[8px] bg-forth text-white text-[13px] font-medium rounded-[8px] transition-colors hover:opacity-80"
        >
          {t('comment_inbox.load_more', 'Load more')}
        </button>
      )}
    </div>
  );
};

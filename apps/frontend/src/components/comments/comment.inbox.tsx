'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CommentInboxFilters, InboxFilters } from './comment.inbox.filters';

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
      if (!res.ok) throw new Error('Failed to fetch inbox');
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-[200px] text-[#F97066]">
        {t('comment_inbox.failed_to_load', 'Failed to load inbox')}
      </div>
    );
  }

  const comments = data?.comments || [];

  return (
    <div className="flex flex-col gap-[16px]">
      <CommentInboxFilters filters={filters} onChange={handleFiltersChange} />

      {isLoading && (
        <div className="flex items-center justify-center h-[200px] text-newTableText">
          {t('comment_inbox.loading', 'Loading comments...')}
        </div>
      )}

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

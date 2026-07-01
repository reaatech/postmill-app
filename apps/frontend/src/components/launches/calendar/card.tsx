'use client';

import React, { FC, memo, useCallback } from 'react';
import clsx from 'clsx';
import { useDrag } from 'react-dnd';
import { Post, State, Tags, Integration } from '@prisma/client';
import type { Integrations } from './context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { isUSCitizen } from '@gitroom/frontend/components/launches/helpers/isuscitizen.utils';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import {
  IconButton,
  EditSettings,
  CopyDebug,
  Duplicate,
  Preview,
  Statistics,
  DeletePost,
  formatCompactNumber,
  ViewsIcon,
  LikesIcon,
  CommentsIcon,
} from './helpers';
import dayjs from 'dayjs';

export const CalendarItem: FC<{
  date: dayjs.Dayjs;
  isBeforeNow: boolean;
  editPost: () => void;
  duplicatePost: () => void;
  copyDebugJson?: () => void;
  deletePost: () => void;
  statistics: () => void;
  missingRelease?: () => void;
  openPostDetail: (e: React.MouseEvent) => void;
  integrations: Integrations[];
  state: State;
  display: 'day' | 'week' | 'month';
  showTime?: boolean;
  post: Post & {
    integration: Integration;
    tags: {
      tag: Tags;
    }[];
    lastViews?: number | null;
    lastLikes?: number | null;
    lastComments?: number | null;
    commentCount?: number;
    unreadComments?: number;
  };
}> = memo((props) => {
  const t = useT();
  const {
    editPost,
    statistics,
    duplicatePost,
    copyDebugJson,
    post,
    date,
    isBeforeNow,
    state,
    display,
    deletePost,
    showTime,
    missingRelease,
    openPostDetail,
  } = props;
  const { disableXAnalytics } = useVariables();
  const user = useUser();
  const showCreationMethodBadge =
    user?.impersonate &&
    post.creationMethod &&
    post.creationMethod !== 'UNKNOWN';
  const preview = useCallback(() => {
    window.open(`/p/` + post.id + '?share=true', '_blank');
  }, [post]);
  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: 'post',
      item: {
        id: post.id,
        interval: !!post.intervalInDays,
        date,
      },
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0 : 1,
      }),
    }),
    [post.id, post.intervalInDays, date]
  );
  return (
    <div
      // @ts-ignore
      ref={dragRef}
      className={clsx(
        'w-full flex h-full flex-1 flex-col group',
        'relative',
        state === 'ERROR' && 'rounded-[10px] ring-2 ring-red-500'
      )}
      style={{
        opacity,
      }}
    >
      {state === 'ERROR' && (
        <div
          className="absolute -top-[6px] -left-[6px] z-20 w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
          data-tooltip-id="tooltip"
          data-tooltip-content={post.error || 'An error occurred while publishing this post'}
        >
          !
        </div>
      )}
      {(post.unreadComments || 0) > 0 && (
        <div
          className="absolute -top-[6px] -end-[6px] z-20 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
          data-tooltip-id="tooltip"
          data-tooltip-content={`${post.unreadComments} ${t('unread_comments', 'unread comments')}`}
        >
          {post.unreadComments > 99 ? '99+' : post.unreadComments}
        </div>
      )}
      {showCreationMethodBadge && (
        <div className="absolute -bottom-[4px] -right-[4px] z-10">
          <CreationMethodBadge
            creationMethod={post.creationMethod}
            ringColor="var(--new-bgColor)"
          />
        </div>
      )}
      <div
        className={clsx(
          'text-white text-[11px] max-h-[24px] h-[24px] min-h-[24px] w-full rounded-tr-[10px] rounded-tl-[10px] flex items-center justify-center gap-[10px] px-[5px] bg-btnPrimary'
        )}
        style={{
          backgroundColor: post?.tags?.[0]?.tag?.color,
        }}
      >
        <div
          className={clsx(
            post?.tags?.[0]?.tag?.color ? 'mix-blend-difference' : '',
            'group-hover:hidden cursor-pointer'
          )}
        >
          {post.tags.map((p) => p.tag.name).join(', ')}
        </div>
        <IconButton
          label={t('edit_post', 'Edit Post')}
          onClick={editPost}
          colored={!!post?.tags?.[0]?.tag?.color}
        >
          <EditSettings />
        </IconButton>
        {copyDebugJson && (
          <IconButton
            label={t('copy_debug_json', 'Copy debug JSON')}
            onClick={copyDebugJson}
            colored={!!post?.tags?.[0]?.tag?.color}
          >
            <CopyDebug />
          </IconButton>
        )}
        <IconButton
          label={t('duplicate_post', 'Duplicate Post')}
          onClick={duplicatePost}
          colored={!!post?.tags?.[0]?.tag?.color}
        >
          <Duplicate />
        </IconButton>
        <IconButton
          label={t('preview_post', 'Preview Post')}
          onClick={preview}
          colored={!!post?.tags?.[0]?.tag?.color}
        >
          <Preview />
        </IconButton>{' '}
        {((post.integration.providerIdentifier === 'x' && disableXAnalytics) || !post.releaseId) ? (
          <></>
        ) : post.releaseId === 'missing' && missingRelease ? (
          <IconButton
            label={t('link_release', 'Link to published post')}
            onClick={missingRelease}
            colored={!!post?.tags?.[0]?.tag?.color}
          >
            <Statistics />
          </IconButton>
        ) : post.releaseId !== 'missing' ? (
          <IconButton
            label={t('statistics', 'Statistics')}
            onClick={statistics}
            colored={!!post?.tags?.[0]?.tag?.color}
          >
            <Statistics />
          </IconButton>
        ) : (
          <></>
        )}{' '}
        <IconButton
          label={t('delete_post', 'Delete Post')}
          onClick={deletePost}
          colored={!!post?.tags?.[0]?.tag?.color}
        >
          <DeletePost />
        </IconButton>
      </div>
      <div
        onClick={openPostDetail}
        className={clsx(
          'gap-[5px] w-full flex h-full flex-1 rounded-br-[10px] rounded-bl-[10px] p-[8px] text-[14px] bg-newColColor cursor-pointer',
          'relative',
          isBeforeNow && '!grayscale'
        )}
      >
        <div className={clsx('relative min-w-[20px]')}>
          <img
            alt=""
            className="w-[20px] h-[20px] rounded-[8px]"
            src={post.integration.picture! || '/no-picture.jpg'}
          />
          <img
            alt=""
            className="w-[12px] h-[12px] rounded-[8px] absolute z-10 top-[10px] end-0 border border-newTableBorder"
            src={`/icons/platforms/${post.integration?.providerIdentifier}.png`}
          />
        </div>
        <div className="w-full flex-1 flex flex-col min-h-[40px] gap-[2px]">
          <div className="flex items-center gap-[6px] flex-wrap">
            <div className="text-start text-[12px]">
              {state === 'DRAFT' ? t('draft', 'Draft') + ': ' : ''}
            </div>
            {state === 'PUBLISHED' && (
              <div className="inline-flex items-center gap-[3px] bg-green-500 text-white text-[10px] px-[5px] py-[1px] rounded-full leading-[14px]">
                <div className="w-[4px] h-[4px] rounded-full bg-white" />
                {t('published', 'Published')}
              </div>
            )}
            {state === 'QUEUE' && (
              <div className="inline-flex items-center gap-[3px] bg-blue-500 text-white text-[10px] px-[5px] py-[1px] rounded-full leading-[14px]">
                <div className="w-[4px] h-[4px] rounded-full bg-white" />
                {t('scheduled', 'Scheduled')}
              </div>
            )}
            {state === 'DRAFT' && (
              <div className="inline-flex items-center gap-[3px] bg-amber-500 text-white text-[10px] px-[5px] py-[1px] rounded-full leading-[14px]">
                <div className="w-[4px] h-[4px] rounded-full bg-white" />
                {t('draft', 'Draft')}
              </div>
            )}
          </div>
            <div className="w-full text-ellipsis break-words line-clamp-1 text-start min-h-[18px]">
              {stripHtmlValidation('none', post.content, false, true, false) ||
                t('no_content', 'no content')}
            </div>
          {(post.lastViews !== undefined && post.lastViews !== null) ||
          (post.lastLikes !== undefined && post.lastLikes !== null) ||
          (post.lastComments !== undefined && post.lastComments !== null) ||
          post.commentCount ? (
            <div className="flex items-center gap-3 mt-2 text-[12px] text-textColor">
              {post.lastViews !== undefined && post.lastViews !== null && (
                <span className="flex items-center gap-1" title={t('views', 'Views')} aria-label={t('views', 'Views')}>
                  <ViewsIcon /> {formatCompactNumber(post.lastViews)}
                </span>
              )}
              {post.lastLikes !== undefined && post.lastLikes !== null && (
                <span className="flex items-center gap-1" title={t('likes', 'Likes')} aria-label={t('likes', 'Likes')}>
                  <LikesIcon /> {formatCompactNumber(post.lastLikes)}
                </span>
              )}
              {post.lastComments !== undefined && post.lastComments !== null ? (
                <span className="flex items-center gap-1" title={t('comments', 'Comments')} aria-label={t('comments', 'Comments')}>
                  <CommentsIcon /> {formatCompactNumber(post.lastComments)}
                </span>
              ) : post.commentCount ? (
                <span className="flex items-center gap-1" title={t('comments', 'Comments')} aria-label={t('comments', 'Comments')}>
                  <CommentsIcon /> {formatCompactNumber(post.commentCount)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {showTime && (
          <div className="text-textColor/50 text-[12px] whitespace-nowrap flex items-center">
            {newDayjs(post.publishDate).local().format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
          </div>
        )}
      </div>
    </div>
  );
});

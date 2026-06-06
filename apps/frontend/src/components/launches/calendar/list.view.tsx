'use client';

import React, { Fragment, useMemo } from 'react';
import { useCalendar } from './context';
import { CalendarItem } from './card';
import dayjs from 'dayjs';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { isUSCitizen } from '@gitroom/frontend/components/launches/helpers/isuscitizen.utils';
import { usePostActions } from './helpers';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

export const ListView = () => {
  const t = useT();
  const user = useUser();
  const { integrations, loading, listPosts, listState } = useCalendar();
  const emptyMessage =
    listState === 'scheduled'
      ? t('no_upcoming_posts', 'No upcoming posts scheduled')
      : listState === 'draft'
      ? t('no_draft_posts', 'No draft posts')
      : listState === 'published'
      ? t('no_published_posts', 'No published posts')
      : t('no_posts', 'No posts');

  const { editPost, deletePost, copyDebugJson, openStatistics, openMissingRelease, openPostDetail } = usePostActions();

  const groupedPosts = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    listPosts.forEach((post) => {
      const dateKey = newDayjs(post.publishDate).local().format('YYYY-MM-DD');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(post);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [listPosts]);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  if (listPosts.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <div className="text-textColor text-[16px]">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px] flex-1 relative">
      <div className="absolute start-0 top-0 w-full h-full flex flex-col overflow-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        {groupedPosts.map(([dateKey, datePosts]) => (
          <Fragment key={dateKey}>
            <div className="text-center text-[14px] min-h-[21px] text-textColor font-[500] mt-[10px]">
              {newDayjs(dateKey).format(isUSCitizen() ? 'dddd, MMMM D, YYYY' : 'dddd, D MMMM YYYY')}
            </div>
            <div className="flex flex-col gap-[10px] mb-[20px] px-[10px]">
              {datePosts.map((post) => (
                <CalendarItem
                  key={post.id}
                  display="day"
                  isBeforeNow={false}
                  date={newDayjs(post.publishDate)}
                  state={post.state}
                  statistics={openStatistics(post.id)}
                  missingRelease={openMissingRelease(post.id)}
                  editPost={editPost(post, false)}
                  duplicatePost={editPost(post, true)}
                  copyDebugJson={user?.isSuperAdmin ? copyDebugJson(post) : undefined}
                  openPostDetail={openPostDetail(post)}
                  post={post}
                  integrations={integrations}
                  deletePost={deletePost(post)}
                  showTime={true}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
};

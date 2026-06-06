'use client';

import { FC } from 'react';
import { CommentInbox } from '@gitroom/frontend/components/comments/comment.inbox';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const CommentsPage: FC = () => {
  const t = useT();
  return (
    <div className="flex-1 flex flex-col min-h-0 p-[24px]">
      <h1 className="text-[24px] font-bold text-textColor mb-[20px]">
        {t('comments_inbox', 'Comments Inbox')}
      </h1>
      <CommentInbox />
    </div>
  );
};

export default CommentsPage;

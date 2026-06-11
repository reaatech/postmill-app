'use client';

import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export interface InboxFilters {
  status?: string;
  assigneeId?: string;
  unreadOnly: boolean;
}

interface CommentInboxFiltersProps {
  filters: InboxFilters;
  onChange: (filters: InboxFilters) => void;
}

export const CommentInboxFilters: FC<CommentInboxFiltersProps> = ({ filters, onChange }) => {
  const t = useT();
  const setStatus = useCallback(
    (status: string | undefined) => {
      onChange({ ...filters, status });
    },
    [filters, onChange]
  );

  const toggleUnreadOnly = useCallback(() => {
    onChange({ ...filters, unreadOnly: !filters.unreadOnly });
  }, [filters, onChange]);

  return (
    <div className="flex items-center gap-[12px] flex-wrap">
      <div className="flex gap-[8px]">
        {[
          { label: t('comment_inbox.filter_all', 'All'), value: undefined },
          { label: t('comment_inbox.filter_needs_reply', 'Needs Reply'), value: 'needs_reply' },
          { label: t('comment_inbox.filter_handled', 'Handled'), value: 'handled' },
          { label: t('comment_inbox.filter_ignored', 'Ignored'), value: 'ignored' },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => setStatus(opt.value)}
            className={`px-[12px] py-[4px] text-[13px] font-medium rounded-[6px] transition-colors ${
              filters.status === opt.value
                ? 'bg-btnPrimary text-white'
                : 'bg-newBgColorInner text-newTableText hover:text-btnText border border-newTableBorder'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-[6px] text-[13px] text-newTableText cursor-pointer">
        <input
          type="checkbox"
          checked={filters.unreadOnly}
          onChange={toggleUnreadOnly}
          className="w-[16px] h-[16px] rounded-[4px] accent-btnPrimary [&:checked]:bg-btnPrimary"
        />
        {t('comment_inbox.filter_unread_only', 'Unread only')}
      </label>
    </div>
  );
};

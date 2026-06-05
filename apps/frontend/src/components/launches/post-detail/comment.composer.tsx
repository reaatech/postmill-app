'use client';

import React, { FC, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface CommentComposerProps {
  postId: string;
  replyToCommentId?: string;
  onClose: () => void;
  integrationName: string;
  onSubmitted: () => void;
}

export const CommentComposer: FC<CommentComposerProps> = ({
  postId,
  replyToCommentId,
  onClose,
  integrationName,
  onSubmitted,
}) => {
  const t = useT();
  const fetch = useFetch();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const url = replyToCommentId
        ? `/posts/${postId}/social-comments/${replyToCommentId}/reply`
        : `/posts/${postId}/social-comments`;
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        // Backends can return an HTML error page (e.g. a 500/502); don't dump
        // raw markup into the UI — fall back to a friendly message instead.
        const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text);
        throw new Error(!text || looksLikeHtml ? '' : text);
      }
      setMessage('');
      onSubmitted();
    } catch (err: any) {
      setError(err.message || t('failed_to_send', 'Failed to send reply'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-[6px] mt-[8px]">
      <div className="text-[11px] text-newTableText">
        {t('replying_as', 'Replying as')} {integrationName}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSend();
          }
        }}
        aria-label={t('reply_input', 'Reply')}
        placeholder={t('write_a_reply', 'Write a reply...')}
        rows={2}
        className="bg-newBgColor border border-newTableBorder rounded-[6px] px-[10px] py-[6px] text-[13px] text-textColor outline-none resize-none"
      />
      {error && (
        <div className="text-[12px] text-red-500" role="alert">{error}</div>
      )}
      <div className="flex gap-[6px] justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          className="text-[12px] text-newTableText hover:text-textColor px-[10px] py-[4px] disabled:opacity-50"
        >
          {t('cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className="bg-btnPrimary text-white text-[12px] rounded-[6px] px-[14px] py-[4px] disabled:opacity-50"
        >
          {sending
            ? t('sending', 'Sending...')
            : t('send', 'Send')}
        </button>
      </div>
    </div>
  );
};

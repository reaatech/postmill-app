'use client';

import { FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR, { mutate } from 'swr';

interface WatchedAccount {
  id: string;
  provider: string;
  handle: string;
  displayName: string | null;
  enabled: boolean;
  lastError: string | null;
  createdAt: string;
  metrics: { id: string; metric: string; value: number; capturedAt: string }[];
}

export const WatchlistTab: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const [provider, setProvider] = useState('x');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');

  const { data: accounts, error } = useSWR<WatchedAccount[]>(
    '/analytics/v2/watchlist',
    (url: string) => fetch(url).then((r: Response) => r.json()),
  );

  const addAccount = useCallback(async () => {
    if (!handle.trim()) return;
    await fetch('/analytics/v2/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        handle: handle.trim(),
        displayName: displayName.trim() || undefined,
      }),
    });
    setHandle('');
    setDisplayName('');
    mutate('/analytics/v2/watchlist');
  }, [provider, handle, displayName, fetch]);

  const toggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      await fetch(`/analytics/v2/watchlist/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      mutate('/analytics/v2/watchlist');
    },
    [fetch],
  );

  const removeAccount = useCallback(
    async (id: string) => {
      await fetch(`/analytics/v2/watchlist/${id}`, {
        method: 'DELETE',
      });
      mutate('/analytics/v2/watchlist');
    },
    [fetch],
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <h3 className="text-[16px] font-semibold">
        {t('watchlist', 'Watchlist')}
      </h3>
      <p className="text-[13px] text-newTableText">
        {t(
          'watchlist_desc',
          'Track public accounts and pages from supported platforms.',
        )}
      </p>

      <div className="flex gap-[8px] items-end">
        <div className="flex flex-col gap-[4px]">
          <label className="text-[12px] text-newTableText">
            {t('provider', 'Provider')}
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          >
            <option value="x">X/Twitter</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
        <div className="flex flex-col gap-[4px]">
          <label className="text-[12px] text-newTableText">
            {t('handle', 'Handle / Username')}
          </label>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@username"
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          />
        </div>
        <div className="flex flex-col gap-[4px]">
          <label className="text-[12px] text-newTableText">
            {t('display_name', 'Display Name (optional)')}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="px-[12px] py-[8px] bg-newBgColor border border-newTableBorder rounded-[8px] text-[14px] outline-none"
          />
        </div>
        <button
          onClick={addAccount}
          disabled={!handle.trim()}
          className="px-[16px] py-[8px] bg-forth text-white rounded-[8px] text-[14px] font-medium disabled:opacity-50"
        >
          {t('add', 'Add')}
        </button>
      </div>

      {error && (
        <div className="text-red-500 text-[13px]">
          {t('watchlist_error', 'Failed to load watchlist')}
        </div>
      )}

      {accounts && accounts.length === 0 && (
        <div className="text-[13px] text-newTableText">
          {t('watchlist_empty', 'No watched accounts yet. Add one above.')}
        </div>
      )}

      {accounts && accounts.length > 0 && (
        <div className="flex flex-col gap-[8px]">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-[12px] bg-newBgColor border border-newTableBorder rounded-[8px]"
            >
              <div className="flex items-center gap-[12px]">
                <div>
                  <span className="text-[14px] font-medium">
                    {account.displayName || account.handle}
                  </span>
                  <span className="text-[12px] text-newTableText ml-[8px]">
                    {account.provider}
                  </span>
                </div>
                {account.lastError && (
                  <span className="text-[11px] text-red-500" title={account.lastError}>
                    {t('error', 'Error')}
                  </span>
                )}
                {account.metrics?.[0] && (
                  <span className="text-[12px] text-newTableText">
                    {account.metrics[0].metric}: {account.metrics[0].value}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-[8px]">
                <button
                  onClick={() => toggleEnabled(account.id, account.enabled)}
                  className={`px-[8px] py-[4px] text-[12px] rounded-[4px] ${
                    account.enabled
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-500 text-white'
                  }`}
                >
                  {account.enabled
                    ? t('enabled', 'Enabled')
                    : t('disabled', 'Disabled')}
                </button>
                <button
                  onClick={() => removeAccount(account.id)}
                  className="px-[8px] py-[4px] text-[12px] bg-red-500 text-white rounded-[4px]"
                >
                  {t('remove', 'Remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

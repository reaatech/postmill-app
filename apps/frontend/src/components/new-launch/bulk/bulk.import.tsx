'use client';

import { FC, useCallback, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useBulkImport, BulkRow } from './useBulkImport';

export const BulkImport: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const { submit, loading, results, error } = useBulkImport();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkRow[]>([]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) return;
        const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const contentIdx = header.indexOf('content');
        const channelIdx = header.indexOf('channel');
        const dateIdx = header.indexOf('schedule_at') >= 0 ? header.indexOf('schedule_at') : header.indexOf('date');
        const mediaIdx = header.indexOf('media_url');
        const campaignIdx = header.indexOf('campaign_id');

        if (contentIdx < 0 || channelIdx < 0 || dateIdx < 0) {
          return;
        }

        const parsed: BulkRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim());
          parsed.push({
            content: cols[contentIdx] || '',
            channels: (cols[channelIdx] || '').split(';').filter(Boolean),
            scheduleAt: cols[dateIdx] || '',
            mediaUrl: mediaIdx >= 0 ? cols[mediaIdx] : undefined,
            campaignId: campaignIdx >= 0 ? cols[campaignIdx] : undefined,
          });
        }
        setRows(parsed);
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (rows.length === 0) return;
    await submit(rows);
  }, [rows, submit]);

  return (
    <div className="flex flex-col gap-[16px] p-[24px]">
      <h2 className="text-[20px] font-semibold">
        {t('bulk_import', 'Bulk Import')}
      </h2>
      <p className="text-[13px] text-newTableText">
        {t(
          'bulk_import_desc',
          'Upload a CSV with columns: content, channel, schedule_at, media_url (optional), campaign_id (optional). Rows are validated independently and errors do not block the batch.',
        )}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="px-[16px] py-[8px] bg-forth text-white rounded-[8px] text-[14px] font-medium self-start"
      >
        {t('upload_csv', 'Upload CSV')}
      </button>

      {rows.length > 0 && (
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-medium">
            {t('preview', 'Preview')} ({rows.length} {t('rows', 'rows')})
          </h3>
          <div className="max-h-[300px] overflow-y-auto border border-newTableBorder rounded-[8px]">
            <table className="w-full text-[13px]">
              <thead className="bg-newBgColor sticky top-0">
                <tr>
                  <th className="px-[8px] py-[4px] text-left">#</th>
                  <th className="px-[8px] py-[4px] text-left">
                    {t('content', 'Content')}
                  </th>
                  <th className="px-[8px] py-[4px] text-left">
                    {t('channels', 'Channels')}
                  </th>
                  <th className="px-[8px] py-[4px] text-left">
                    {t('schedule', 'Schedule')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-t border-newTableBorder">
                    <td className="px-[8px] py-[4px]">{i + 1}</td>
                    <td className="px-[8px] py-[4px] max-w-[200px] truncate">
                      {row.content}
                    </td>
                    <td className="px-[8px] py-[4px]">
                      {row.channels.join(', ')}
                    </td>
                    <td className="px-[8px] py-[4px]">{row.scheduleAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && (
            <p className="text-[12px] text-newTableText">
              {t(
                'showing_first_50',
                'Showing first 50 rows. All {{count}} rows will be imported.',
                { count: rows.length },
              )}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-[16px] py-[8px] bg-forth text-white rounded-[8px] text-[14px] font-medium self-start disabled:opacity-50"
          >
            {loading
              ? t('importing', 'Importing...')
              : t('import_all', 'Import All')}
          </button>
        </div>
      )}

      {error && <div className="text-red-500 text-[13px]">{error}</div>}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-medium">
            {t('results', 'Results')}
          </h3>
          <div className="max-h-[300px] overflow-y-auto border border-newTableBorder rounded-[8px]">
            <table className="w-full text-[13px]">
              <thead className="bg-newBgColor sticky top-0">
                <tr>
                  <th className="px-[8px] py-[4px] text-left">#</th>
                  <th className="px-[8px] py-[4px] text-left">
                    {t('status', 'Status')}
                  </th>
                  <th className="px-[8px] py-[4px] text-left">
                    {t('details', 'Details')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.index}
                    className={`border-t border-newTableBorder ${
                      r.success ? '' : 'bg-red-500/10'
                    }`}
                  >
                    <td className="px-[8px] py-[4px]">{r.index + 1}</td>
                    <td className="px-[8px] py-[4px]">
                      {r.success
                        ? t('success', 'Success')
                        : t('failed', 'Failed')}
                    </td>
                    <td className="px-[8px] py-[4px]">
                      {r.error && (
                        <span className="text-red-500">{r.error}</span>
                      )}
                      {r.warnings && r.warnings.length > 0 && (
                        <span className="text-yellow-500">
                          {r.warnings.join('; ')}
                        </span>
                      )}
                      {r.success && !r.warnings?.length && (
                        <span className="text-green-500">
                          {t('created', 'Created')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

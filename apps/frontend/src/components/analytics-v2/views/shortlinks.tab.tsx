'use client';

import React from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useShortLinks, useShortLinksTimeseries } from '../hooks/useShortLinks';
import { KpiCard } from '../cards/kpi.card';
import { useShortlinksConfig } from '@gitroom/frontend/components/settings/shortlinks/hooks/useShortlinksConfig';

interface ShortlinksTabProps {
  from: string;
  to: string;
}

export const ShortlinksTab = ({ from, to }: ShortlinksTabProps) => {
  const t = useT();
  const { data: links, isLoading, error } = useShortLinks(from, to);
  const { data: timeseries } = useShortLinksTimeseries(from, to);

  const { data: shortlinksConfig } = useShortlinksConfig();
  const activeProviderHasStats = shortlinksConfig?.active?.capabilities?.statistics ?? true;

  const totalClicks = timeseries?.reduce((sum, p) => sum + p.clicks, 0) || 0;
  const totalLinks = links?.length || 0;

  if (error) {
    return (
      <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] flex flex-col items-center gap-[12px]">
        <span className="text-[14px] text-red-500">{t('failed_to_load', 'Failed to load short links')}</span>
      </div>
    );
  }

  if (isLoading) {
    return <div className="animate-pulse">{t('loading', 'Loading...')}</div>;
  }

  if (!links || links.length === 0) {
    return (
      <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] text-center">
        <div className="text-[14px] text-newTableText">
          {activeProviderHasStats
            ? t('no_links_yet', 'No short links have been created yet.')
            : t('no_stats_for_provider', 'Your active short-link provider doesn\'t expose click analytics.')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex gap-[16px]">
        <KpiCard label={t('total_clicks', 'Total Clicks')} value={String(totalClicks)} />
        <KpiCard label={t('total_links', 'Total Links')} value={String(totalLinks)} />
      </div>

      <div className="bg-sixth border border-fifth rounded-[4px] p-[24px]">
        <div className="text-[14px] font-semibold mb-[16px]">{t('top_links', 'Top Links')}</div>
        {totalLinks > 50 && (
          <div className="text-[12px] text-newTableText mb-[8px]">
            {t('top_n_of_m', 'Top 50 of {{count}}', { count: totalLinks })}
          </div>
        )}
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-tableBorder">
              <th className="text-left py-[8px] px-[4px]">{t('short_url', 'Short URL')}</th>
              <th className="text-left py-[8px] px-[4px]">{t('original_url', 'Original URL')}</th>
              <th className="text-right py-[8px] px-[4px]">{t('clicks', 'Clicks')}</th>
            </tr>
          </thead>
          <tbody>
            {[...links]
              .sort((a, b) => b.clicks - a.clicks)
              .slice(0, 50)
              .map((link) => (
                <tr key={link.id} className="border-b border-tableBorder hover:bg-boxHover">
                  <td className="py-[8px] px-[4px]">
                    <a href={link.shortUrl} target="_blank" rel="noopener noreferrer" className="text-btnPrimary hover:underline">
                      {link.shortUrl}
                    </a>
                  </td>
                  <td className="py-[8px] px-[4px] text-newTableText max-w-[300px] truncate" title={link.originalUrl}>
                    {link.originalUrl}
                  </td>
                  <td className="py-[8px] px-[4px] text-right font-medium">
                    {link.clicks}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

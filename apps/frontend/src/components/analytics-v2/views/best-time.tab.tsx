'use client';

import { FC } from 'react';
import { useBestTime } from '../hooks/useBestTime';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface BestTimeTabProps {
  integrations?: string[];
}

function getColorClass(avgEngagement: number, maxAvg: number): string {
  if (maxAvg === 0) return 'bg-newTableHeader opacity-20';
  const ratio = avgEngagement / maxAvg;
  if (ratio < 0.1) return 'bg-green-900/30';
  if (ratio < 0.25) return 'bg-green-700/40';
  if (ratio < 0.5) return 'bg-green-500/50';
  if (ratio < 0.75) return 'bg-yellow-500/60';
  return 'bg-orange-500/70';
}

export const BestTimeTab: FC<BestTimeTabProps> = ({ integrations }) => {
  const t = useT();
  const { data, isLoading, DAY_LABELS, HOUR_LABELS } = useBestTime(integrations);

  if (isLoading) {
    return (
      <div className="text-newTableText p-[24px]">
        {t('loading', 'Loading...')}
      </div>
    );
  }

  if (!data?.heatmap?.length) {
    return (
      <div className="text-newTableText p-[24px]">
        {t('no_data', 'No data available yet. Publish posts to see best time insights.')}
      </div>
    );
  }

  const maxAvg = Math.max(...data.heatmap.map((e) => e.avgEngagement), 1);

  return (
    <div className="p-[24px]">
      <h2 className="text-[18px] font-semibold mb-[16px]">
        {t('best_time_to_post', 'Best Time to Post')}
      </h2>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-[60px_repeat(24,1fr)] gap-[2px] min-w-[800px]">
          <div className="text-[11px] text-newTableText font-medium" />
          {HOUR_LABELS.map((label, i) => (
            <div
              key={i}
              className="text-[10px] text-newTableText text-center font-medium"
            >
              {label}
            </div>
          ))}

          {data.heatmap.map((entry) => {
            if (entry.hour === 0) {
              const dayEntries = data.heatmap.filter((e) => e.day === entry.day);
              return (
                <div key={`row-${entry.day}`} className="contents">
                  <div className="text-[11px] text-newTableText font-medium flex items-center">
                    {DAY_LABELS[entry.day]}
                  </div>
                  {dayEntries.map((de) => (
                    <div
                      key={`${de.day}-${de.hour}`}
                      className={`h-[28px] rounded-[2px] ${getColorClass(de.avgEngagement, maxAvg)}`}
                      title={`${DAY_LABELS[de.day]} ${HOUR_LABELS[de.hour]}: ${de.avgEngagement} avg engagement (${de.postCount} posts)`}
                    />
                  ))}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      {data.bestSlots?.length > 0 && (
        <div className="mt-[24px]">
          <h3 className="text-[14px] font-medium mb-[8px]">
            {t('top_slots', 'Top Posting Slots')}
          </h3>
          <div className="flex flex-wrap gap-[8px]">
            {data.bestSlots.map((slot, i) => (
              <div
                key={i}
                className="bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] py-[8px] text-[13px]"
              >
                <span className="font-medium">{DAY_LABELS[slot.day]}</span>{' '}
                <span>{HOUR_LABELS[slot.hour]}</span>
                <span className="text-newTableText ml-[4px]">
                  ({slot.avgEngagement} avg)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

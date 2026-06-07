'use client';

import { FC, useMemo } from 'react';
import { OverviewResponse } from '../utils';
import { useChannelDetail } from '../hooks/useChannelDetail';
import { ChannelDetailPanel } from '../drill/channel.detail.panel';

interface ChannelsTabProps {
  data?: OverviewResponse;
  loading: boolean;
  error?: Error;
  focusIntegration?: string;
  from: string;
  to: string;
  compare: boolean;
  integrations: string[];
  channels: { integrationId: string; name: string; identifier: string; picture: string }[];
  onSelectChannel: (integrationId: string) => void;
}

export const ChannelsTab: FC<ChannelsTabProps> = ({
  data,
  loading,
  error,
  focusIntegration,
  from,
  to,
  compare,
  integrations,
  channels,
  onSelectChannel,
}) => {
  const { data: channelDetail } = useChannelDetail({
    integrationId: focusIntegration || '',
    from,
    to,
    compare,
  });

  const focusedChannel = useMemo(() => {
    if (!focusIntegration) return undefined;
    return channels.find(
      (c) => c.integrationId === focusIntegration
    );
  }, [focusIntegration, channels]);
  if (loading) {
    return (
      <div className="space-y-[12px] animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[72px] bg-newTableHeader rounded-[10px]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <p className="text-newTableText text-[14px]">
          Failed to load channel data
        </p>
      </div>
    );
  }

  if (!data?.byChannel?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <p className="text-newTableText text-[14px]">
          No channel data available
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-[8px]">
      {data.byChannel.map((ch) => {
        const mainKpi = ch.kpis?.[0];
        return (
          <div
            key={ch.integrationId}
            onClick={() => onSelectChannel(ch.integrationId)}
            className="flex items-center gap-[12px] px-[16px] py-[12px] bg-newTableHeader border border-newTableBorder rounded-[10px] cursor-pointer hover:border-newTableText/30 transition-colors"
          >
            <img
              src={ch.picture}
              alt=""
              className="w-[36px] h-[36px] rounded-[8px]"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium truncate">{ch.name}</div>
              <div className="text-[12px] text-newTableText">
                {ch.identifier}
              </div>
            </div>
            {mainKpi && (
              <div className="text-right">
                <div className="text-[16px] font-semibold tabular-nums">
                  {new Intl.NumberFormat().format(Math.round(mainKpi.total))}
                </div>
                {mainKpi.percentageChange !== 0 && (
                  <div
                    className={`text-[12px] tabular-nums ${
                      mainKpi.percentageChange >= 0
                        ? 'text-[var(--positive,#32d583)]'
                        : 'text-[var(--negative,#f97066)]'
                    }`}
                  >
                    {mainKpi.percentageChange >= 0 ? '+' : ''}
                    {mainKpi.percentageChange.toFixed(1)}%
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <ChannelDetailPanel
        channel={focusedChannel || { integrationId: '', name: '', identifier: '', picture: '' }}
        data={channelDetail}
        open={!!focusIntegration && !!focusedChannel}
        onClose={() => onSelectChannel('')}
        from={from}
        to={to}
        compare={compare}
      />
    </div>
  );
};

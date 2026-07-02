'use client';

import { FC, useMemo } from 'react';
import { OverviewResponse } from '../utils';
import { KPICard } from '../cards/kpi.card';
import { LineChart } from '../charts/line.chart';
import { PieChart } from '../charts/pie.chart';
import { BarChart } from '../charts/bar.chart';
import { MetricDetailPanel } from '../drill/metric.detail.panel';
import { useMetricDrill } from '../hooks/useMetricDrill';
import { DayDetailPanel } from '../drill/day.detail.panel';
import { useDayDrill } from '../hooks/useDayDrill';

const KPI_COLORS = [
  'var(--chart-1, #2b5cd3)',
  'var(--chart-2, #32d583)',
  'var(--chart-3, #1d9bf0)',
  'var(--chart-4, #f97066)',
  'var(--chart-5, #ffac30)',
  'var(--chart-6, #8b90ff)',
];

interface OverviewTabProps {
  data?: OverviewResponse;
  loading: boolean;
  error?: Error;
  from: string;
  to: string;
  integrations: string[];
  compare: boolean;
  selectedMetric?: string;
  selectedDate?: string;
  focusIntegration?: string;
  onSelectMetric: (metric: string) => void;
  onSelectDate?: (date: string) => void;
  onSelectChannel?: (integrationId: string) => void;
}

export const OverviewTab: FC<OverviewTabProps> = ({
  data,
  loading,
  error,
  from,
  to,
  integrations,
  compare,
  selectedMetric,
  selectedDate,
  focusIntegration,
  onSelectMetric,
  onSelectDate,
  onSelectChannel,
}) => {
  const { data: metricDrillData } = useMetricDrill({
    metric: selectedMetric || '',
    from,
    to,
    integrations,
    compare,
  });

  const { data: dayDrillData } = useDayDrill({
    date: selectedDate || '',
    metric: selectedMetric || '',
    integrations,
  });

  const mainMetric = useMemo(() => {
    if (!data?.kpis?.length) return undefined;
    return data.kpis[0];
  }, [data]);

  const series = useMemo(() => {
    if (!data?.series || !mainMetric) return [];
    const s = data.series[mainMetric.metric];
    return s || [];
  }, [data, mainMetric]);

  const comparisonSeries = useMemo(() => {
    if (!data?.series || !mainMetric || !compare) return undefined;
    const s = data.series[mainMetric.metric];
    if (!s?.length) return undefined;
    const hasPrev = s.some((p) => p.previousValue !== undefined);
    if (!hasPrev) return undefined;
    return s.map((p) => ({ date: p.date, value: p.previousValue ?? 0 }));
  }, [data, mainMetric, compare]);

  const breakdownData = useMemo(() => {
    if (!data?.breakdown?.byPlatform?.length) return [];
    return data.breakdown.byPlatform.map((b) => ({
      label: b.identifier,
      value: b.value,
    }));
  }, [data]);

  const channelBarData = useMemo(() => {
    if (!data?.byChannel?.length)
      return {
        labels: [] as string[],
        values: [] as number[],
        integrationIds: [] as string[],
      };
    return {
      labels: data.byChannel.map((c) => c.name),
      values: data.byChannel.map((c) => {
        if (!c.kpis?.length) return 0;
        return c.kpis[0]?.total || 0;
      }),
      integrationIds: data.byChannel.map((c) => c.integrationId),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-[16px] animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px] mobile:gap-[8px]">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[180px] mobile:h-[112px] bg-newTableHeader rounded-[12px]"
            />
          ))}
        </div>
        <div className="h-[320px] bg-newTableHeader rounded-[12px]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px]">
          <div className="h-[280px] bg-newTableHeader rounded-[12px]" />
          <div className="h-[280px] bg-newTableHeader rounded-[12px]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-[var(--negative,#f97066)]/10 flex items-center justify-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-[var(--negative,#f97066)]"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
        </div>
        <p className="text-newTableText text-[14px] mb-[12px]">
          Failed to load analytics data
        </p>
        <p className="text-[12px] text-newTableText/60">{error.message}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-newTableHeader flex items-center justify-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-newTableText"
          >
            <path d="M3 3v18h18M7 16l4-8 4 4 4-6" />
          </svg>
        </div>
        <p className="text-newTableText text-[14px] mb-[8px]">
          No data available yet
        </p>
        <p className="text-[12px] text-newTableText/60">
          Analytics will appear once snapshots start accumulating.
        </p>
      </div>
    );
  }

  if (!data.kpis?.length && !data.byChannel?.length && !data.series) {
    return (
      <div className="flex flex-col items-center justify-center py-[48px] text-center">
        <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-newTableHeader flex items-center justify-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-newTableText"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <p className="text-newTableText text-[14px] mb-[8px]">
          No channels connected
        </p>
        <p className="text-[12px] text-newTableText/60">
          Connect social media channels to see analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-[16px]">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px] mobile:gap-[8px]">
        {data.kpis.map((kpi, i) => (
          <KPICard
            key={kpi.metric}
            kpi={kpi}
            color={KPI_COLORS[i % KPI_COLORS.length]}
            onClick={() => {
              onSelectMetric(kpi.metric);
            }}
          />
        ))}
      </div>

      <div className="bg-newTableHeader border border-newTableBorder rounded-[12px] p-[16px]">
        <div className="h-[320px]">
          <LineChart
            series={series}
            comparisonSeries={comparisonSeries}
            height={320}
            format={mainMetric?.format}
            onPointClick={(date) => onSelectDate?.(date)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[12px]">
        {breakdownData.length > 0 && (
          <div className="bg-newTableHeader border border-newTableBorder rounded-[12px] p-[16px]">
            <h3 className="text-[13px] font-medium text-newTableText mb-[12px]">
              By Platform
            </h3>
            <PieChart
              data={breakdownData}
              height={250}
              centerLabel="Total"
              onSliceClick={(identifier) => {
                const integrationId = data?.byChannel?.find(
                  (c) => c.identifier === identifier
                )?.integrationId;
                if (integrationId) onSelectChannel?.(integrationId);
              }}
            />
          </div>
        )}
        {channelBarData.labels.length > 0 && (
          <div className="bg-newTableHeader border border-newTableBorder rounded-[12px] p-[16px]">
            <h3 className="text-[13px] font-medium text-newTableText mb-[12px]">
              Channel Comparison
            </h3>
            <div className="h-[250px]">
              <BarChart
                labels={channelBarData.labels}
                values={channelBarData.values}
                height={250}
                onBarClick={(index) => {
                  const integrationId = channelBarData.integrationIds[index];
                  if (integrationId) onSelectChannel?.(integrationId);
                }}
              />
            </div>
          </div>
        )}
      </div>

      <MetricDetailPanel
        data={metricDrillData}
        open={!!selectedMetric}
        onClose={() => {
          onSelectMetric('');
        }}
      />
      <DayDetailPanel
        data={dayDrillData}
        open={!!selectedDate}
        onClose={() => onSelectDate?.('')}
      />
    </div>
  );
};

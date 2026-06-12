'use client';

import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useDashboardSummary } from './hooks/useDashboardSummary';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { PageHeader } from '@gitroom/frontend/components/ui/page-header';
import { DashboardSetup } from './dashboard.setup';
import { KpiCard } from '@gitroom/frontend/components/analytics-v2/cards/kpi.card';
import { LineChart } from '@gitroom/frontend/components/analytics-v2/charts/line.chart';
import { BarChart } from '@gitroom/frontend/components/analytics-v2/charts/bar.chart';
import { useOverview } from '@gitroom/frontend/components/analytics-v2/hooks/useOverview';
import { useRecommendations, RecommendationItem } from '@gitroom/frontend/components/analytics-v2/hooks/useRecommendations';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';

export function greetingForUser(name: string, hour: number) {
  if (hour < 5) return `Working late, ${name}?`;
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  if (hour < 22) return `Good evening, ${name}`;
  return `Good night, ${name}`;
}

export const DashboardComponent = () => {
  const router = useRouter();
  const user = useUser();
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: integrations } = useIntegrationList();

  const greeting = useMemo(() => {
    const firstName = user?.profile?.name?.trim().split(/\s+/)[0] || 'there';
    const hour = dayjs().tz(getTimezone()).hour();
    return greetingForUser(firstName, hour);
  }, [user?.profile?.name]);

  const activeIntegrations = useMemo(() => {
    if (!integrations?.length) return [];
    return integrations.map((i: { id: string }) => i.id);
  }, [integrations]);

  const from = useMemo(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'), []);
  const to = useMemo(() => dayjs().format('YYYY-MM-DD'), []);

  const { data: overviewData, isLoading: overviewLoading } = useOverview({
    from,
    to,
    integrations: activeIntegrations,
    compare: false,
  });

  const { data: recommendationsData, isLoading: recsLoading } = useRecommendations();

  const mainKPI = overviewData?.kpis?.[0];
  const series = useMemo(() => {
    if (!overviewData?.series || !mainKPI) return [];
    const points = overviewData.series[mainKPI.metric] || [];
    // Reformat ISO ledger dates (2026-05-12) to a compact m/DD axis label.
    return points.map((p) => ({ ...p, date: dayjs(p.date).format('M/DD') }));
  }, [overviewData, mainKPI]);

  const channelBarData = useMemo(() => {
    if (!overviewData?.byChannel?.length) return { labels: [] as string[], values: [] as number[] };
    return {
      labels: overviewData.byChannel.map((c) => c.name),
      values: overviewData.byChannel.map((c) => c.kpis?.[0]?.total || 0),
    };
  }, [overviewData]);

  const recItems = recommendationsData?.recommendations || [];
  const hasOverview = !!overviewData && (series.length > 0 || channelBarData.labels.length > 0);

  return (
    <div className="p-[24px]">
      <PageHeader title={greeting} description="Overview of your social presence" />

      <DashboardSetup />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[16px] mb-[24px]">
        <KpiCard label="Total Posts" value={summaryLoading ? '...' : String(summary?.totalPosts ?? 0)} color="var(--chart-1, #2b5cd3)" />
        <KpiCard label="Scheduled" value={summaryLoading ? '...' : String(summary?.scheduledPosts ?? 0)} color="var(--chart-5, #ffac30)" />
        <KpiCard label="Published (7d)" value={summaryLoading ? '...' : String(summary?.publishedNext7 ?? 0)} color="var(--chart-2, #32d583)" />
        <KpiCard label="Channels" value={String(summary?.channelsConnected ?? integrations?.length ?? 0)} color="var(--chart-3, #1d9bf0)" />
      </div>

      {overviewLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px] mb-[24px]">
          <div className="h-[300px] bg-newTableHeader rounded-[12px] animate-pulse" />
          <div className="h-[300px] bg-newTableHeader rounded-[12px] animate-pulse" />
        </div>
      ) : hasOverview ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px] mb-[24px]">
          {series.length > 0 && (
            <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px]">
              <h3 className="text-[13px] font-medium text-newTableText mb-[12px]">
                {mainKPI?.label || 'Engagement'} Over Time
              </h3>
              <div className="h-[280px]">
                <LineChart
                  series={series}
                  height={280}
                  format={mainKPI?.format}
                />
              </div>
            </div>
          )}
          {channelBarData.labels.length > 0 && (
            <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[16px]">
              <h3 className="text-[13px] font-medium text-newTableText mb-[12px]">
                Posts by Channel
              </h3>
              <div className="h-[280px]">
                <BarChart
                  labels={channelBarData.labels}
                  values={channelBarData.values}
                  height={280}
                />
              </div>
            </div>
          )}
          {series.length === 0 && channelBarData.labels.length === 0 && (
            <div className="lg:col-span-2 bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[32px] flex items-center justify-center">
              <p className="text-[13px] text-newTableText">Not enough data for charts yet. Publish posts to see analytics trends.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[20px] mb-[24px]">
        <h2 className="text-[18px] font-[600] mb-[12px]">Upcoming Posts</h2>
        {summary?.upcomingPosts?.length > 0 ? (
          <div className="flex flex-col gap-[8px]">
            {summary.upcomingPosts.map((post: any) => (
              <div key={post.id} className="font-playwrite flex items-center gap-[12px] text-[13px] text-newTableText py-[8px] border-b border-newTableBorder last:border-b-0">
                <span className="flex-1 truncate">{post.content}</span>
                <span className="text-newTableText">{new Date(post.publishDate).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : !summaryLoading ? (
          <p className="text-[13px] text-newTableText">No upcoming posts. Create your first post!</p>
        ) : (
          <div className="animate-pulse h-[40px] bg-newTableHeader rounded-[4px]" />
        )}
      </div>

      {recsLoading ? (
        <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[20px]">
          <h2 className="text-[18px] font-[600] mb-[12px]">Recommendations</h2>
          <div className="animate-pulse h-[100px] bg-newTableHeader rounded-[4px]" />
        </div>
      ) : recItems.length > 0 ? (
        <div>
          <h2 className="text-[18px] font-[600] mb-[12px]">Recommendations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
            {recItems.map((item: RecommendationItem, index: number) => (
              <div
                key={`rec-${index}`}
                className="bg-newBgColorInner rounded-[12px] border border-newTableBorder p-[20px] flex flex-col gap-[12px]"
              >
                <div className="flex items-center gap-[8px]">
                  <span className={`text-[11px] font-semibold px-[8px] py-[2px] rounded-full border ${
                    item.priority === 1 ? 'text-[#F97066] border-[#F97066]' :
                    item.priority === 2 ? 'text-[#FFAC30] border-[#FFAC30]' :
                    'text-[#1D9BF0] border-[#1D9BF0]'
                  }`}>
                    {item.priority === 1 ? 'High' : item.priority === 2 ? 'Medium' : 'Low'}
                  </span>
                  <span className="text-[11px] text-newTableText capitalize">{item.type.replace(/_/g, ' ')}</span>
                </div>
                <h3 className="text-[15px] font-semibold text-newTextColor/80">{item.title}</h3>
                <p className="text-[13px] text-newTableText leading-relaxed">{item.description}</p>
                <button
                  type="button"
                  onClick={() => router.push(item.link)}
                  className="self-start mt-auto px-[14px] py-[6px] bg-btnPrimary text-white text-[13px] font-medium rounded-[8px] transition-colors hover:bg-btnPrimary/90"
                >
                  {item.action}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { useOverview } from './hooks/useOverview';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { DateRangePicker } from './filters/date.range.picker';
import { ChannelMultiSelect } from './filters/channel.multiselect';
import { OverviewTab } from './views/overview.tab';
import { ChannelsTab } from './views/channels.tab';
import { PostsTab } from './views/posts.tab';
import { DrillBreadcrumb } from './drill/drill.breadcrumb';
import { DrillState, OverviewResponse } from './utils';
import { usePosts } from './hooks/usePosts';
import { ErrorBoundary } from './error.boundary';
import { ExportButton } from './export.button';
import { BestTimeTab } from './views/best-time.tab';
import { RecommendationsTab } from './views/recommendations.tab';
import { WatchlistTab } from './views/watchlist.tab';
import { ShortlinksTab } from './views/shortlinks.tab';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

function getDefaultFrom(): string {
  return dayjs().subtract(30, 'day').format('YYYY-MM-DD');
}

function getDefaultTo(): string {
  return dayjs().format('YYYY-MM-DD');
}

function isDataEmpty(data: OverviewResponse | undefined): boolean {
  if (!data) return true;
  const hasKpis = !!data.kpis?.length;
  const hasSeries = !!data.series && Object.keys(data.series).length > 0;
  const hasChannels = !!data.byChannel?.length;
  return !hasKpis && !hasSeries && !hasChannels;
}

export const AnalyticsDashboard: FC = () => {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get('from') || getDefaultFrom();
  const to = searchParams.get('to') || getDefaultTo();
  const compare = searchParams.get('compare') !== 'false';
  const tab = (searchParams.get('tab') as DrillState['tab']) || 'overview';
  const drillMetric = searchParams.get('metric') || undefined;
  const focusIntegration = searchParams.get('focusIntegration') || undefined;
  const focusDate = searchParams.get('focusDate') || undefined;
  const focusPost = searchParams.get('focusPost') || undefined;

  const { data: integrationsData } = useIntegrationList();

  const channels = useMemo(() => {
    if (!integrationsData?.length) return [];
    return (
      integrationsData as Array<{
        id: string;
        name: string;
        identifier: string;
        picture: string;
      }>
    ).map((i) => ({
      integrationId: i.id,
      name: i.name,
      identifier: i.identifier,
      picture: i.picture,
    }));
  }, [integrationsData]);

  const urlIntegrations = searchParams.get('integrations');
  const allIntegrationIds = useMemo(
    () => channels.map((c: { integrationId: string }) => c.integrationId),
    [channels]
  );

  const [selected, setSelected] = useState<string[]>(() => {
    if (urlIntegrations) return urlIntegrations.split(',');
    return allIntegrationIds;
  });

  useEffect(() => {
    if (
      !urlIntegrations &&
      allIntegrationIds.length > 0 &&
      selected.length === 0
    ) {
      setSelected(allIntegrationIds);
    }
  }, [allIntegrationIds, urlIntegrations]);

  const activeIntegrations = selected.length > 0 ? selected : allIntegrationIds;

  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
  } = useOverview({
    from,
    to,
    integrations: activeIntegrations,
    compare,
  });

  const {
    data: postsData,
    isLoading: postsLoading,
    error: postsError,
  } = usePosts(
    tab === 'posts'
      ? {
          from,
          to,
          integrations: activeIntegrations,
          sort: searchParams.get('sort') || 'publishedAt',
          dir: (searchParams.get('dir') as 'asc' | 'desc') || 'desc',
          page: +(searchParams.get('page') || 1),
          limit: 25,
        }
      : undefined
  );

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      router.replace(`/analytics/v2?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleChannelChange = useCallback(
    (newSelected: string[]) => {
      setSelected(newSelected);
      if (
        newSelected.length === 0 ||
        newSelected.length >= allIntegrationIds.length
      ) {
        updateParams({ integrations: undefined });
      } else {
        updateParams({ integrations: newSelected.join(',') });
      }
    },
    [allIntegrationIds, updateParams]
  );

  const handleRangeChange = useCallback(
    (range: { from: string; to: string; compare: boolean }) => {
      updateParams({
        from: range.from,
        to: range.to,
        compare: String(range.compare),
      });
    },
    [updateParams]
  );

  const handleTabChange = useCallback(
    (newTab: string) => {
      updateParams({ tab: newTab });
    },
    [updateParams]
  );

  const handleSelectMetric = useCallback(
    (metric: string) => {
      updateParams({ metric: metric || undefined });
    },
    [updateParams]
  );

  const handleSelectChannel = useCallback(
    (integrationId: string) => {
      updateParams({ focusIntegration: integrationId, tab: 'channels' });
    },
    [updateParams]
  );

  const handleSelectDate = useCallback(
    (date: string) => {
      updateParams({ focusDate: date || undefined });
    },
    [updateParams]
  );

  const handleSelectPost = useCallback(
    (postId: string) => {
      updateParams({ focusPost: postId || undefined });
    },
    [updateParams]
  );

  const handleReset = useCallback(() => {
    updateParams({
      metric: undefined,
      focusIntegration: undefined,
      focusDate: undefined,
      focusPost: undefined,
      tab: undefined,
    });
  }, [updateParams]);

  const handlePageChange = useCallback(
    (page: number) => {
      updateParams({ page: String(page) });
    },
    [updateParams]
  );

  const handleSortChange = useCallback(
    (sort: string, dir: 'asc' | 'desc') => {
      updateParams({ sort, dir, page: '1' });
    },
    [updateParams]
  );

  const drill: DrillState = {
    metric: drillMetric,
    focusIntegration,
    focusDate,
    focusPost,
    tab,
  };
  const tabLabels: Record<string, string> = {
    overview: t('analytics_tab_overview', 'Overview'),
    channels: t('analytics_tab_channels', 'Channels'),
    posts: t('analytics_tab_posts', 'Posts'),
    'best-time': t('analytics_tab_best_time', 'Best time'),
    recommendations: t('analytics_tab_recommendations', 'Recommendations'),
    watchlist: t('analytics_tab_watchlist', 'Watchlist'),
    shortlinks: t('analytics_tab_shortlinks', 'Links'),
  };

  return (
    <ErrorBoundary>
      <div
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="sticky top-0 z-40 bg-newBgColor border-b border-newTableBorder px-[24px] py-[12px] flex items-center gap-[12px] flex-wrap">
          <DateRangePicker
            from={from}
            to={to}
            compare={compare}
            onChange={handleRangeChange}
          />
          <div className="flex-1" />
          <ChannelMultiSelect
            channels={channels}
            selected={selected}
            onChange={handleChannelChange}
          />
          <ExportButton
            from={from}
            to={to}
            integrations={activeIntegrations}
            compare={compare}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-[24px] py-[16px]">
          <DrillBreadcrumb
            drill={drill}
            onReset={handleReset}
            onNavigate={(updates) =>
              updateParams(updates as Record<string, string>)
            }
          />

          <div className="flex gap-[8px] mb-[16px]">
            {(['overview', 'channels', 'posts', 'best-time', 'recommendations', 'watchlist', 'shortlinks'] as const).map((tabName) => (
              <button
                key={tabName}
                onClick={() => handleTabChange(tabName)}
                className={`px-[14px] py-[6px] text-[13px] font-medium rounded-[8px] transition-colors capitalize ${
                  tab === tabName
                    ? 'bg-btnPrimary text-white'
                    : 'text-newTableText hover:text-btnText'
                }`}
                aria-pressed={tab === tabName}
              >
                {tabLabels[tabName]}
              </button>
            ))}
          </div>

          {!overviewLoading && !overviewError && (tab === 'overview' || tab === 'channels') && isDataEmpty(overviewData) && (
            <div className="flex flex-col items-center justify-center py-[48px] px-[24px] mb-[16px] bg-newBgColorInner border border-newTableBorder rounded-[12px]">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-newTableText mb-[16px]">
                <path d="M18 20V10" />
                <path d="M12 20V4" />
                <path d="M6 20v-6" />
              </svg>
              <div className="text-[16px] font-[600] text-textColor mb-[8px]">
                {t('analytics_empty_title', 'No analytics data yet')}
              </div>
              <div className="text-[13px] text-newTableText text-center max-w-[420px] mb-[20px]">
                {t('analytics_empty_desc', 'Analytics appears after your first scheduled collection (requires connected channels and background jobs configured).')}
              </div>
              <a
                href="/third-party"
                className="inline-flex items-center gap-[8px] px-[16px] py-[8px] bg-btnPrimary text-white text-[13px] font-[500] rounded-[8px] hover:opacity-90 transition-opacity"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                </svg>
                {t('analytics_connect_channels', 'Connect channels')}
              </a>
            </div>
          )}

          {tab === 'overview' && (
            <OverviewTab
              data={overviewData}
              loading={overviewLoading}
              error={overviewError}
              from={from}
              to={to}
              integrations={activeIntegrations}
              compare={compare}
              selectedMetric={drillMetric}
              selectedDate={focusDate}
              focusIntegration={focusIntegration}
              onSelectMetric={handleSelectMetric}
              onSelectDate={handleSelectDate}
              onSelectChannel={handleSelectChannel}
            />
          )}
          {tab === 'channels' && (
            <ChannelsTab
              data={overviewData}
              loading={overviewLoading}
              error={overviewError}
              focusIntegration={focusIntegration}
              from={from}
              to={to}
              compare={compare}
              integrations={activeIntegrations}
              channels={channels}
              onSelectChannel={handleSelectChannel}
            />
          )}
          {tab === 'best-time' && (
            <BestTimeTab integrations={activeIntegrations} />
          )}
          {tab === 'recommendations' && (
            <RecommendationsTab />
          )}
          {tab === 'watchlist' && (
            <WatchlistTab />
          )}
          {tab === 'shortlinks' && (
            <ShortlinksTab from={from} to={to} />
          )}
          {tab === 'posts' && (
            <PostsTab
              posts={postsData?.posts}
              total={postsData?.total || 0}
              loading={postsLoading}
              error={postsError}
              page={+(searchParams.get('page') || 1)}
              limit={25}
              sort={searchParams.get('sort') || 'publishedAt'}
              dir={(searchParams.get('dir') as 'asc' | 'desc') || 'desc'}
              onPageChange={handlePageChange}
              onSortChange={handleSortChange}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

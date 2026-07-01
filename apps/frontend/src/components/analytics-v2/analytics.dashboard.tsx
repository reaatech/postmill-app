'use client';

import { FC, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import clsx from 'clsx';
import dayjs from 'dayjs';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { KebabMenu } from '@gitroom/frontend/components/ui/kebab-menu';
import { useOverview } from './hooks/useOverview';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { AnalyticsFilterBar } from './filters/filter.bar';
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
  const integrations = useMemo(
    () => (integrationsData || []) as Integrations[],
    [integrationsData]
  );
  const allIntegrationIds = useMemo(
    () => integrations.map((i) => i.id),
    [integrations]
  );
  // Display shape consumed by ChannelsTab (name/picture lookup).
  const channels = useMemo(
    () =>
      integrations.map((i) => ({
        integrationId: i.id,
        name: i.name,
        identifier: i.identifier,
        picture: i.picture,
      })),
    [integrations]
  );

  // Channels & campaigns are URL-driven; empty selection means "all".
  const urlIntegrations = searchParams.get('integrations');
  const selectedChannels = useMemo(
    () => (urlIntegrations ? urlIntegrations.split(',') : []),
    [urlIntegrations]
  );

  const urlCampaigns = searchParams.get('campaigns');
  const selectedCampaigns = useMemo(
    () => (urlCampaigns ? urlCampaigns.split(',') : []),
    [urlCampaigns]
  );

  const fetch = useFetch();
  const { data: campaignData } = useSWR('/campaigns', (url: string) =>
    fetch(url).then((r: Response) => r.json())
  );
  const campaignList = useMemo(
    () =>
      (campaignData as Array<{
        id: string;
        name: string;
        integrationIds?: string[];
      }>) || [],
    [campaignData]
  );
  const campaigns = useMemo(
    () => campaignList.map((c) => ({ id: c.id, name: c.name })),
    [campaignList]
  );

  // Selected campaigns narrow the channel set to the channels they publish to,
  // so every tab (which already reads `activeIntegrations`) respects the filter.
  const activeIntegrations = useMemo(() => {
    let base = selectedChannels.length ? selectedChannels : allIntegrationIds;
    if (selectedCampaigns.length) {
      const campaignChannels = new Set(
        campaignList
          .filter((c) => selectedCampaigns.includes(c.id))
          .flatMap((c) => c.integrationIds || [])
      );
      base = base.filter((id) => campaignChannels.has(id));
    }
    return base;
  }, [selectedChannels, allIntegrationIds, selectedCampaigns, campaignList]);

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
      router.replace(`/analytics?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleChannelChange = useCallback(
    (ids: string[]) => {
      updateParams({
        integrations:
          ids.length && ids.length < allIntegrationIds.length
            ? ids.join(',')
            : undefined,
      });
    },
    [allIntegrationIds, updateParams]
  );

  const handleCampaignsChange = useCallback(
    (ids: string[]) => {
      updateParams({ campaigns: ids.length ? ids.join(',') : undefined });
    },
    [updateParams]
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

  // Tabs — first 3 inline; the rest fold into a right-aligned kebab on mobile
  // (inline on desktop). The kebab sits OUTSIDE the scrolling track so its menu
  // isn't clipped. Mirrors the /campaigns dashboard pattern.
  const tabItems = (
    [
      'overview',
      'channels',
      'posts',
      'best-time',
      'recommendations',
      'watchlist',
      'shortlinks',
    ] as const
  ).map((key) => ({ key, label: tabLabels[key] }));
  const primaryTabs = tabItems.slice(0, 3);
  const overflowTabs = tabItems.slice(3);
  const overflowActive = overflowTabs.some((o) => o.key === tab);

  const renderTab = (item: { key: string; label: string }, extra = '') => (
    <button
      key={item.key}
      type="button"
      onClick={() => handleTabChange(item.key)}
      aria-current={tab === item.key ? 'page' : undefined}
      className={clsx(
        'px-[16px] py-[10px] text-[14px] font-[500] whitespace-nowrap border-b-2 -mb-[1px] transition-colors',
        extra,
        tab === item.key
          ? 'border-btnPrimary text-textColor'
          : 'border-transparent text-newTableText hover:text-textColor'
      )}
    >
      {item.label}
    </button>
  );

  return (
    <ErrorBoundary>
      <div
        className="flex-1 flex flex-col min-h-0 min-w-0"
      >
        <div className="sticky top-0 z-40 bg-newBgColor border-b border-newTableBorder px-[24px] py-[12px] mobile:px-[16px]">
          <AnalyticsFilterBar
            from={from}
            to={to}
            compare={compare}
            onRangeChange={handleRangeChange}
            integrations={integrations}
            selectedChannels={selectedChannels}
            onChannelsChange={handleChannelChange}
            campaigns={campaigns}
            selectedCampaigns={selectedCampaigns}
            onCampaignsChange={handleCampaignsChange}
            exportSlot={
              <ExportButton
                from={from}
                to={to}
                integrations={activeIntegrations}
                compare={compare}
              />
            }
          />
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto px-[24px] py-[16px] mobile:px-[16px]">
          <DrillBreadcrumb
            drill={drill}
            onReset={handleReset}
            onNavigate={(updates) =>
              updateParams(updates as Record<string, string>)
            }
          />

          <div className="flex items-stretch border-b border-newTableBorder mb-[16px]">
            <div className="flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              <div className="flex items-center gap-[2px] min-w-max">
                {primaryTabs.map((item) => renderTab(item))}
                {overflowTabs.map((item) => renderTab(item, 'hidden lg:block'))}
              </div>
            </div>
            <div className="lg:hidden flex items-center shrink-0 ps-[8px]">
              <KebabMenu
                ariaLabel={t('more_tabs', 'More tabs')}
                active={overflowActive}
                align="right"
                items={overflowTabs.map((item) => ({
                  label:
                    tab === item.key ? (
                      <span className="text-btnPrimary">{item.label}</span>
                    ) : (
                      item.label
                    ),
                  onClick: () => handleTabChange(item.key),
                }))}
              />
            </div>
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
                href="/settings/channels"
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

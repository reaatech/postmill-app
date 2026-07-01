'use client';

import { FC, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useCampaignDashboard } from '@gitroom/frontend/components/campaigns/hooks/campaign.hooks';
import { DashboardHeader } from '@gitroom/frontend/components/campaigns/dashboard/dashboard-header';
import { DashboardKpis } from '@gitroom/frontend/components/campaigns/dashboard/dashboard-kpis';
import { TaggedItemsPanels } from '@gitroom/frontend/components/campaigns/dashboard/tagged-items-panels';
import { CampaignChannelsSection } from '@gitroom/frontend/components/campaigns/dashboard/campaign-channels-section';
import { CampaignPostsSection } from '@gitroom/frontend/components/campaigns/dashboard/campaign-posts-section';
import { PlanningWorkspace } from '@gitroom/frontend/components/campaigns/dashboard/planning-workspace';
import { ChangelogPanel } from '@gitroom/frontend/components/campaigns/dashboard/changelog-panel';
import { CampaignCommentsSection } from '@gitroom/frontend/components/campaigns/dashboard/campaign-comments-section';
import { ChannelOption } from '@gitroom/frontend/components/comments/comment.inbox.filters';
import { KebabMenu } from '@gitroom/frontend/components/ui/kebab-menu';

type TabKey =
  | 'posts'
  | 'channels'
  | 'items'
  | 'planning'
  | 'comments'
  | 'activity';

export const CampaignDashboardPage: FC = () => {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, mutate } = useCampaignDashboard(id);
  const [tab, setTab] = useState<TabKey>('posts');

  // Unique channels across the campaign's posts power the comments channel filter.
  const channels = useMemo<ChannelOption[]>(() => {
    const map = new Map<string, ChannelOption>();
    for (const p of data?.posts || []) {
      const integ = p.integration;
      if (integ?.id && !map.has(integ.id)) {
        map.set(integ.id, {
          id: integ.id,
          name: integ.name,
          providerIdentifier: integ.providerIdentifier,
        });
      }
    }
    return [...map.values()];
  }, [data]);

  if (error) {
    return (
      <div className="p-[24px] text-center text-red-500">
        Failed to load campaign dashboard.
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="p-[24px] text-center text-newTableText">Loading…</div>;
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'posts', label: t('posts', 'Posts') },
    { key: 'channels', label: t('channels', 'Channels') },
    { key: 'items', label: t('tagged_items', 'Tagged Items') },
    { key: 'planning', label: t('planning', 'Planning') },
    { key: 'comments', label: t('comments', 'Comments') },
    { key: 'activity', label: t('activity', 'Activity') },
  ];
  // On mobile only the first three are shown inline; the rest fold into a menu.
  const primaryTabs = tabs.slice(0, 3);
  const overflowTabs = tabs.slice(3);
  const overflowActive = overflowTabs.some((o) => o.key === tab);

  const renderTab = (item: { key: TabKey; label: string }, extra = '') => (
    <button
      key={item.key}
      type="button"
      onClick={() => setTab(item.key)}
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
    <div className="w-full flex flex-col gap-[24px] p-[24px]">
      <DashboardHeader campaign={data.campaign} onMutate={mutate} />
      <DashboardKpis dashboard={data} />

      {/* Section tabs — first 3 inline; the rest fold into a kebab on mobile, inline on desktop.
          The kebab lives OUTSIDE the horizontally-scrolling track so its menu isn't clipped. */}
      <div className="flex items-stretch border-b border-newTableBorder">
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex items-center gap-[2px] min-w-max">
            {primaryTabs.map((item) => renderTab(item))}
            {overflowTabs.map((item) => renderTab(item, 'hidden lg:block'))}
          </div>
        </div>
        <div className="lg:hidden flex items-center shrink-0 ps-[8px]">
          <KebabMenu
            ariaLabel={t('more_sections', 'More sections')}
            active={overflowActive}
            align="right"
            items={overflowTabs.map((item) => ({
              label:
                tab === item.key ? (
                  <span className="text-btnPrimary">{item.label}</span>
                ) : (
                  item.label
                ),
              onClick: () => setTab(item.key),
            }))}
          />
        </div>
      </div>

      {tab === 'posts' && (
        <CampaignPostsSection campaignId={id} posts={data.posts} />
      )}
      {tab === 'channels' && (
        <CampaignChannelsSection
          campaignId={id}
          channels={data.channels || []}
          onMutate={mutate}
        />
      )}
      {tab === 'items' && (
        <TaggedItemsPanels
          campaignId={id}
          items={data.itemPanels}
          posts={data.posts}
          onMutate={mutate}
        />
      )}
      {tab === 'planning' && <PlanningWorkspace campaignId={id} onMutate={mutate} />}
      {tab === 'comments' && (
        <CampaignCommentsSection campaignId={id} channels={channels} onMutate={mutate} />
      )}
      {tab === 'activity' && <ChangelogPanel logs={data.recentChangelog} />}
    </div>
  );
};

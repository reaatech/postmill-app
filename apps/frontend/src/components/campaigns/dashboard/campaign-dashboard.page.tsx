'use client';

import { FC, useMemo } from 'react';
import { useParams } from 'next/navigation';
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

export const CampaignDashboardPage: FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, mutate } = useCampaignDashboard(id);

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

  return (
    <div className="flex flex-col gap-[24px] p-[24px]">
      <DashboardHeader campaign={data.campaign} onMutate={mutate} />
      <DashboardKpis dashboard={data} />
      <CampaignChannelsSection campaignId={id} channels={data.channels || []} onMutate={mutate} />
      <TaggedItemsPanels campaignId={id} items={data.itemPanels} posts={data.posts} onMutate={mutate} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[24px]">
        <CampaignPostsSection campaignId={id} posts={data.posts} />
        <PlanningWorkspace campaignId={id} onMutate={mutate} />
      </div>
      <CampaignCommentsSection campaignId={id} channels={channels} onMutate={mutate} />
      <ChangelogPanel logs={data.recentChangelog} />
    </div>
  );
};

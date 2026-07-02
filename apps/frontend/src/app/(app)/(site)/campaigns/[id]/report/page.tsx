'use client';

import { useParams } from 'next/navigation';
import { useCampaignReport } from '@gitroom/frontend/components/campaigns/hooks/campaign.hooks';
import { CampaignReportView } from '@gitroom/frontend/components/campaigns/report/campaign-report-view';

export default function CampaignReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useCampaignReport(id, 'json');

  if (error) return <div className="p-[24px] text-center text-red-500">Failed to load report.</div>;
  if (isLoading || !data) return <div className="p-[24px] text-center">Loading…</div>;

  return <CampaignReportView report={data} />;
}

'use client';

import { useParams } from 'next/navigation';
import { usePublicAnalyticsReport } from '@gitroom/frontend/components/analytics-v2/hooks/usePublicAnalyticsReport';
import { PublicAnalyticsReportView } from '@gitroom/frontend/components/analytics-v2/views/public-analytics-report';

export default function PublicAnalyticsSharePage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = usePublicAnalyticsReport(token);

  if (error)
    return <div className="p-[24px] text-center text-amber-600">Report unavailable.</div>;
  if (isLoading || !data)
    return <div className="p-[24px] text-center">Loading…</div>;

  return <PublicAnalyticsReportView report={data} />;
}

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AnalyticsDashboard } from '@gitroom/frontend/components/analytics-v2/analytics.dashboard';

export const metadata: Metadata = {
  title: `Postmill Analytics v2`,
  description: '',
};

export default function AnalyticsV2Page() {
  return <AnalyticsDashboard />;
}

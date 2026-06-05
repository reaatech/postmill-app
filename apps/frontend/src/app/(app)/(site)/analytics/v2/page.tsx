export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { AnalyticsDashboard } from '@gitroom/frontend/components/analytics-v2/analytics.dashboard';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Analytics v2`,
  description: '',
};

export default function AnalyticsV2Page() {
  return <AnalyticsDashboard />;
}

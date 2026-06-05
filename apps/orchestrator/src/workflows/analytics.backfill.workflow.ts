import { proxyActivities } from '@temporalio/workflow';
import type { AnalyticsActivity } from '@gitroom/orchestrator/activities/analytics.activity';

const { backfillIntegration } = proxyActivities<AnalyticsActivity>({
  startToCloseTimeout: '30 minutes',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function analyticsBackfillWorkflow(
  integrationId: string
): Promise<void> {
  await backfillIntegration(integrationId);
}

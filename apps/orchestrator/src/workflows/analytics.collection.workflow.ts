import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { AnalyticsActivity } from '@gitroom/orchestrator/activities/analytics.activity';

const {
  getAllOrganizationIds,
  collectChannelSnapshots,
  collectPostSnapshots,
  pruneAndRollupSnapshots,
} = proxyActivities<AnalyticsActivity>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const CHANNEL_DAYS_BACK = 7;
const POST_DAYS_BACK = 30;

export async function analyticsCollectionWorkflow(): Promise<void> {
  const orgIds = await getAllOrganizationIds();

  for (const orgId of orgIds) {
    await collectChannelSnapshots(orgId, CHANNEL_DAYS_BACK);
    await collectPostSnapshots(orgId, POST_DAYS_BACK);
    await pruneAndRollupSnapshots(orgId);
  }

  await sleep('24h');

  // Reset the workflow history each cycle. Fanning out over every org × 2
  // activities daily would otherwise accumulate events without bound in a
  // single execution and eventually hit Temporal's history limit.
  await continueAsNew();
}

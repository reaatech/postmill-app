import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { CommentsActivity } from '@gitroom/orchestrator/activities/comments.activity';
import type { AnalyticsActivity } from '@gitroom/orchestrator/activities/analytics.activity';

const {
  getAllOrganizationIds,
  syncPostComments,
  pruneComments,
  notifyNewComments,
  dispatchWebhookForComments,
  getSweepIntervalMinutes,
  getDaysBack,
} = proxyActivities<CommentsActivity>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3, backoffCoefficient: 2, initialInterval: '2 minutes' },
});

export async function commentsCollectionWorkflow(): Promise<void> {
  const orgIds = await getAllOrganizationIds();
  const daysBack = await getDaysBack();

  const CONCURRENCY = 5;
  for (let i = 0; i < orgIds.length; i += CONCURRENCY) {
    const batch = orgIds.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (orgId) => {
        await syncPostComments(orgId, daysBack);
        await pruneComments(orgId);
        try {
          await notifyNewComments(orgId);
        } catch (err) {
          // notifications are best-effort; don't abort the sweep
        }
        try {
          await dispatchWebhookForComments(orgId, daysBack);
        } catch (err) {
          // webhook dispatch is best-effort
        }
      })
    );
  }

  const sweepIntervalMinutes = await getSweepIntervalMinutes();
  await sleep(`${sweepIntervalMinutes}m`);
  await continueAsNew();
}

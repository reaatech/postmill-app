import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { AnalyticsActivity } from '@gitroom/nestjs-libraries/inngest/activities/analytics.activity';
import { InngestRunRepository } from '@gitroom/nestjs-libraries/database/prisma/inngest-runs/inngest-run.repository';
import { trackRun } from './track-run';

// The cron only fans out one `analytics/sync-org` event per org; the per-org work runs in
// `analytics-sync-org` (below) with its own concurrency cap. A slow org never blocks the rest
// of the daily sweep (separate invocations), parallelism is bounded by that cap, and each
// per-org operation keeps its own memoized step.run so a retry/resume stays idempotent.
export const createAnalyticsCollection = (
  analyticsActivity: AnalyticsActivity,
  runRepo: InngestRunRepository
) =>
  inngest.createFunction(
    { id: 'analytics-collection', concurrency: 1 },
    { cron: 'TZ=UTC 0 2 * * *' },
    async ({ step }) =>
      trackRun(step, runRepo, 'analytics-collection', async () => {
        const orgIds = await step.run('get-org-ids', () =>
          analyticsActivity.getAllOrganizationIds()
        );

        // Fan out one event per org. No event `id` (idempotency key) — each daily sweep must
        // produce a fresh sync, and a stable id would dedupe all later sweeps into the first.
        if (orgIds.length > 0) {
          await step.sendEvent(
            'fan-out-analytics',
            orgIds.map((organizationId) => ({
              name: 'analytics/sync-org' as const,
              data: { organizationId },
            }))
          );
        }

        await step
          .run('prune-email-logs', () => analyticsActivity.pruneEmailLogs())
          .catch(() => {});
      })
  );

// Per-org analytics sync, triggered by the cron's fan-out. `concurrency` bounds how many orgs
// sync at once. Each operation is its OWN step.run, so on a retry/resume the already-completed
// steps are skipped; the four side-effect steps swallow errors so one failing side-effect can't
// fail the org. Mirrors `createCommentsSyncOrg`.
export const createAnalyticsSyncOrg = (analyticsActivity: AnalyticsActivity) =>
  inngest.createFunction(
    { id: 'analytics-sync-org', concurrency: 5 },
    { event: 'analytics/sync-org' },
    async ({ step, event }) => {
      const { organizationId } = event.data;

      await step.run('collect-channel', () =>
        analyticsActivity.collectChannelSnapshots(organizationId, 7)
      );
      await step.run('collect-post', () =>
        analyticsActivity.collectPostSnapshots(organizationId, 30)
      );
      await step.run('prune', () =>
        analyticsActivity.pruneAndRollupSnapshots(organizationId)
      );
      await step
        .run('side-effects', () =>
          analyticsActivity.notifySnapshotComplete(organizationId)
        )
        .catch(() => {});
      await step
        .run('probe-watched', () =>
          analyticsActivity.probeWatchedAccounts(organizationId)
        )
        .catch(() => {});
      await step
        .run('shortlink-snap', () =>
          analyticsActivity.collectShortLinkSnapshots(organizationId)
        )
        .catch(() => {});
      await step
        .run('shortlink-prune', () =>
          analyticsActivity.pruneShortLinkSnapshots(organizationId)
        )
        .catch(() => {});
    }
  );

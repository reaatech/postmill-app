import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { AnalyticsActivity } from '@gitroom/nestjs-libraries/inngest/activities/analytics.activity';

export const createAnalyticsCollection = (analyticsActivity: AnalyticsActivity) =>
  inngest.createFunction(
    { id: 'analytics-collection', concurrency: 1 },
    { cron: 'TZ=UTC 0 2 * * *' },
    async ({ step }) => {
      const orgIds = await step.run('get-org-ids', () =>
        analyticsActivity.getAllOrganizationIds()
      );

      for (const orgId of orgIds) {
        await step.run(`collect-channel-${orgId}`, () =>
          analyticsActivity.collectChannelSnapshots(orgId, 7)
        );
        await step.run(`collect-post-${orgId}`, () =>
          analyticsActivity.collectPostSnapshots(orgId, 30)
        );
        await step.run(`prune-${orgId}`, () =>
          analyticsActivity.pruneAndRollupSnapshots(orgId)
        );
        await step
          .run(`side-effects-${orgId}`, () =>
            analyticsActivity.notifySnapshotComplete(orgId)
          )
          .catch(() => {});
        await step
          .run(`probe-watched-${orgId}`, () =>
            analyticsActivity.probeWatchedAccounts(orgId)
          )
          .catch(() => {});
        await step
          .run(`shortlink-snap-${orgId}`, () =>
            analyticsActivity.collectShortLinkSnapshots(orgId)
          )
          .catch(() => {});
        await step
          .run(`shortlink-prune-${orgId}`, () =>
            analyticsActivity.pruneShortLinkSnapshots(orgId)
          )
          .catch(() => {});
      }

      await step
        .run('prune-email-logs', () => analyticsActivity.pruneEmailLogs())
        .catch(() => {});
    }
  );

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { CommentsActivity } from '@gitroom/nestjs-libraries/inngest/activities/comments.activity';
import { InngestRunRepository } from '@gitroom/nestjs-libraries/database/prisma/inngest-runs/inngest-run.repository';
import { trackRun } from './track-run';

// The cron only fans out one `comments/sync-org` event per org; the per-org work runs in
// `comments-sync-org` (below) with its own concurrency cap. This means: a slow org never
// blocks the rest of the sweep (separate invocations), parallelism is bounded by that
// cap, and — crucially — each per-org operation keeps its own memoized step.run, so a
// retry/resume never re-fires the non-idempotent webhook/notification a second time.
export const createCommentsCollection = (
  commentsActivity: CommentsActivity,
  runRepo: InngestRunRepository
) =>
  inngest.createFunction(
    { id: 'comments-collection', concurrency: 1 },
    {
      cron: 'TZ=UTC * * * * *',
    },
    async ({ step }) => {
      // Pure env-parse reads (no I/O, deterministic across replays) — intentionally NOT
      // wrapped in step.run; a durable step would only bloat memoization for nothing.
      const daysBack = await commentsActivity.getDaysBack();
      const intervalMinutes = await commentsActivity.getSweepIntervalMinutes();

      // Track only the fan-out work; the trailing sleep is excluded from the recorded duration.
      await trackRun(step, runRepo, 'comments-collection', async () => {
        const orgIds = await step.run('get-org-ids', () =>
          commentsActivity.getAllOrganizationIds()
        );

        // Fan out one event per org. No event `id` (idempotency key) — each sweep must
        // produce a fresh sync, and a stable id would dedupe all later sweeps into the first.
        // The cron's concurrency:1 + the trailing sleep already throttle this to one fan-out
        // per interval despite the minutely cron trigger.
        if (orgIds.length > 0) {
          await step.sendEvent(
            'fan-out-org-sync',
            orgIds.map((organizationId) => ({
              name: 'comments/sync-org' as const,
              data: { organizationId, daysBack },
            }))
          );
        }
      });

      // Wait for the configured interval before the next sweep.
      await step.sleep('wait-interval', `${intervalMinutes}m`);
    }
  );

// Per-org comment sync, triggered by the cron's fan-out. `concurrency` bounds how many
// orgs sync at once (provider rate limits). Each operation is its OWN step.run, so on a
// retry/resume the already-completed webhook/notify steps are skipped (no double-send);
// the non-sync steps swallow errors so one failing side-effect can't fail the org.
export const createCommentsSyncOrg = (commentsActivity: CommentsActivity) =>
  inngest.createFunction(
    { id: 'comments-sync-org', concurrency: 5 },
    { event: 'comments/sync-org' },
    async ({ step, event }) => {
      const { organizationId, daysBack } = event.data;

      await step.run('sync-comments', () =>
        commentsActivity.syncPostComments(organizationId, daysBack)
      );
      await step
        .run('dispatch-webhook', () =>
          commentsActivity.dispatchWebhookForComments(organizationId, daysBack)
        )
        .catch(() => {});
      await step
        .run('prune-comments', () =>
          commentsActivity.pruneComments(organizationId)
        )
        .catch(() => {});
      await step
        .run('notify-comments', () =>
          commentsActivity.notifyNewComments(organizationId)
        )
        .catch(() => {});
    }
  );

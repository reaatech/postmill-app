import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { CommentsActivity } from '@gitroom/nestjs-libraries/inngest/activities/comments.activity';

// The cron only fans out one `comments/sync-org` event per org; the per-org work runs in
// `comments-sync-org` (below) with its own concurrency cap. This means: a slow org never
// blocks the rest of the sweep (separate invocations), parallelism is bounded by that
// cap, and — crucially — each per-org operation keeps its own memoized step.run, so a
// retry/resume never re-fires the non-idempotent webhook/notification a second time.
export const createCommentsCollection = (commentsActivity: CommentsActivity) =>
  inngest.createFunction(
    { id: 'comments-collection', concurrency: 1 },
    {
      cron: 'TZ=UTC * * * * *',
    },
    async ({ step }) => {
      const orgIds = await step.run('get-org-ids', () =>
        commentsActivity.getAllOrganizationIds()
      );

      const daysBack = await step.run('get-days-back', () =>
        commentsActivity.getDaysBack()
      );

      const intervalMinutes = await step.run('get-interval', () =>
        commentsActivity.getSweepIntervalMinutes()
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

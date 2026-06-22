import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { CommentsActivity } from '@gitroom/nestjs-libraries/inngest/activities/comments.activity';

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

      for (const orgId of orgIds) {
        await step.run(`sync-comments-${orgId}`, () =>
          commentsActivity.syncPostComments(orgId, daysBack)
        );
        await step
          .run(`dispatch-webhook-${orgId}`, () =>
            commentsActivity.dispatchWebhookForComments(orgId, daysBack)
          )
          .catch(() => {});
        await step
          .run(`prune-comments-${orgId}`, () =>
            commentsActivity.pruneComments(orgId)
          )
          .catch(() => {});
        await step
          .run(`notify-comments-${orgId}`, () =>
            commentsActivity.notifyNewComments(orgId)
          )
          .catch(() => {});
      }

      // Wait for the configured interval before the next sweep.
      await step.sleep('wait-interval', `${intervalMinutes}m`);
    }
  );

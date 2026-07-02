import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { PostActivity } from '@gitroom/nestjs-libraries/inngest/activities/post.activity';
import { InngestRunRepository } from '@gitroom/nestjs-libraries/database/prisma/inngest-runs/inngest-run.repository';
import { trackRun } from './track-run';

export const createMissingPostFinder = (
  postActivity: PostActivity,
  runRepo: InngestRunRepository
) =>
  inngest.createFunction(
    { id: 'missing-post-finder', concurrency: 1 },
    { cron: 'TZ=UTC 0 * * * *' },
    async ({ step }) =>
      trackRun(step, runRepo, 'missing-post-finder', async () => {
        await step.run('find-missing', () =>
          postActivity.searchForMissingThreeHoursPosts()
        );
      })
  );

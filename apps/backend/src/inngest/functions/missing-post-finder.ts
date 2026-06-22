import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { PostActivity } from '@gitroom/nestjs-libraries/inngest/activities/post.activity';

export const createMissingPostFinder = (postActivity: PostActivity) =>
  inngest.createFunction(
    { id: 'missing-post-finder', concurrency: 1 },
    { cron: 'TZ=UTC 0 * * * *' },
    async ({ step }) => {
      await step.run('find-missing', () =>
        postActivity.searchForMissingThreeHoursPosts()
      );
    }
  );

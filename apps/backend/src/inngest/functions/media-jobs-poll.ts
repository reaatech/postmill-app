import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { MediaJobsActivity } from '@gitroom/nestjs-libraries/inngest/activities/media-jobs.activity';

export const createMediaJobsPoll = (mediaJobsActivity: MediaJobsActivity) =>
  inngest.createFunction(
    { id: 'media-jobs-poll', concurrency: 1 },
    { cron: 'TZ=UTC * * * * *' },
    async ({ step }) => {
      await step.run('poll-media-jobs', () =>
        mediaJobsActivity.processPendingMediaJobs()
      );
    }
  );

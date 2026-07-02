import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { MediaJobsActivity } from '@gitroom/nestjs-libraries/inngest/activities/media-jobs.activity';
import { InngestRunRepository } from '@gitroom/nestjs-libraries/database/prisma/inngest-runs/inngest-run.repository';
import { trackRun } from './track-run';

export const createMediaJobsPoll = (
  mediaJobsActivity: MediaJobsActivity,
  runRepo: InngestRunRepository
) =>
  inngest.createFunction(
    { id: 'media-jobs-poll', concurrency: 1 },
    { cron: 'TZ=UTC * * * * *' },
    async ({ step }) =>
      trackRun(step, runRepo, 'media-jobs-poll', async () => {
        await step.run('poll-media-jobs', () =>
          mediaJobsActivity.processPendingMediaJobs()
        );
      })
  );

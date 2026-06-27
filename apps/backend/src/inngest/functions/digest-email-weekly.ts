import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { DigestActivity } from '@gitroom/nestjs-libraries/inngest/activities/digest.activity';

export const createDigestEmailWeekly = (digestActivity: DigestActivity) =>
  inngest.createFunction(
    { id: 'digest-email-weekly' },
    { cron: 'TZ=America/New_York 0 9 * * 1' },
    async ({ step }) => {
      await step.run('send-weekly-digests', () =>
        digestActivity.sendPendingDigests('weekly')
      );
    }
  );

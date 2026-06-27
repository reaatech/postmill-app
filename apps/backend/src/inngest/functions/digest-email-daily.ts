import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { DigestActivity } from '@gitroom/nestjs-libraries/inngest/activities/digest.activity';

export const createDigestEmailDaily = (digestActivity: DigestActivity) =>
  inngest.createFunction(
    { id: 'digest-email-daily' },
    { cron: 'TZ=America/New_York 0 9 * * *' },
    async ({ step }) => {
      await step.run('send-daily-digests', () =>
        digestActivity.sendPendingDigests('daily')
      );
    }
  );

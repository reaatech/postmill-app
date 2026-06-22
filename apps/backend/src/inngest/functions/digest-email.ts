import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { EmailActivity } from '@gitroom/nestjs-libraries/inngest/activities/email.activity';

export const createDigestEmail = (emailActivity: EmailActivity) =>
  inngest.createFunction(
    {
      id: 'digest-email',
      batchEvents: {
        maxSize: 100,
        timeout: '3600s',
        key: 'event.data.organizationId',
      },
    },
    { event: 'email/digest' },
    async ({ step, events }) => {
      const items = events.map((e) => e.data);
      const organizationId = events[0].data.organizationId;
      await step.run('send-digest', () =>
        emailActivity.sendEmail(
          organizationId,
          '[Postmill] Digest',
          items.map((i) => `<p><strong>${i.title}</strong><br/>${i.message}</p>`).join(''),
          undefined
        )
      );
    }
  );

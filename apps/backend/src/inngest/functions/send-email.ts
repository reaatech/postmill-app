import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { EmailActivity } from '@gitroom/nestjs-libraries/inngest/activities/email.activity';

export const createSendEmail = (emailActivity: EmailActivity) =>
  inngest.createFunction(
    {
      id: 'send-email',
      rateLimit: {
        key: 'email-send',
        limit: 1,
        period: '1s',
      },
    },
    { event: 'email/send' },
    async ({ step, event }) => {
      const { to, subject, html, replyTo } = event.data;
      await step.run('send', () =>
        emailActivity.sendEmail(to, subject, html, replyTo)
      );
    }
  );

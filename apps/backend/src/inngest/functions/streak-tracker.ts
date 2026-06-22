import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { EmailActivity } from '@gitroom/nestjs-libraries/inngest/activities/email.activity';

export const createStreakTracker = (emailActivity: EmailActivity) =>
  inngest.createFunction(
    {
      id: 'streak-tracker',
      cancelOn: [
        {
          event: 'streak/cancel',
          if: 'async.data.organizationId == event.data.organizationId',
        },
      ],
    },
    { event: 'streak/start' },
    async ({ step, event }) => {
      const { organizationId } = event.data;
      await step.run('set-streak-start', () =>
        emailActivity.setStreak(organizationId, 'start')
      );
      await step.sleep('wait-22h', '22h');
      await step.run('send-reminder', async () => {
        const users = await emailActivity.getUserOrgs(organizationId);
        const members = (users as any)?.users || [];
        for (const member of members) {
          const email = member?.user?.email;
          if (!email) continue;
          await emailActivity.sendEmailAsync(
            email,
            'Keep your streak alive!',
            '<p>You have 2 hours left to keep your posting streak alive.</p>',
            'top'
          );
        }
      });
      await step.sleep('wait-2h', '2h');
      await step.run('set-streak-end', () =>
        emailActivity.setStreak(organizationId, 'end')
      );
    }
  );

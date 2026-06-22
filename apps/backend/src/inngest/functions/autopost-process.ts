import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { AutopostActivity } from '@gitroom/nestjs-libraries/inngest/activities/autopost.activity';

export const createAutopostProcess = (autopostActivity: AutopostActivity) =>
  inngest.createFunction(
    {
      id: 'autopost-process',
      cancelOn: [
        {
          event: 'autopost/cancel',
          if: 'async.data.id == event.data.id',
        },
      ],
    },
    { event: 'autopost/process' },
    async ({ step, event }) => {
      await step.run('process', () => autopostActivity.autoPost(event.data.id));
      await step.sleep('wait-1h', '1h');
      await step.sendEvent('autopost/process', {
        name: 'autopost/process',
        data: { id: event.data.id },
        id: `autopost-${event.data.id}`,
      });
    }
  );

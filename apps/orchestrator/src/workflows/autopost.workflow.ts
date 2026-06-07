import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';

const { autoPost } = proxyActivities<AutopostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function autoPostWorkflow({
  id,
  immediately,
}: {
  id: string;
  immediately: boolean;
}) {
  let iterations = 0;
  while (true) {
    try {
      if (immediately) {
        await autoPost(id);
      }
    } catch (err) {}
    immediately = true;
    iterations += 1;

    if (iterations >= 24) {
      await continueAsNew({ id, immediately });
    }

    await sleep(3600000);
  }
}

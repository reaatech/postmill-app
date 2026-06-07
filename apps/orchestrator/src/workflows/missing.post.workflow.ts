import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';

const { searchForMissingThreeHoursPosts } = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function missingPostWorkflow() {
  await searchForMissingThreeHoursPosts();
  let iterations = 1;
  while (true) {
    await sleep('1 hour');
    await searchForMissingThreeHoursPosts();
    iterations += 1;

    if (iterations >= 24) {
      await continueAsNew();
    }
  }
}

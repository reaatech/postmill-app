import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { MediaJobsActivity } from '@gitroom/orchestrator/activities/media-jobs.activity';

const { processPendingMediaJobs } = proxyActivities<MediaJobsActivity>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3, backoffCoefficient: 2, initialInterval: '30 seconds' },
});

// Async media jobs run 3–30 minutes (§11.2) — sweep every minute, and continueAsNew
// after a bounded number of iterations (never an unbounded while(true) history).
const SWEEP_INTERVAL = '1m';
const ITERATIONS_PER_RUN = 240;

export async function mediaJobsPollWorkflow(): Promise<void> {
  for (let i = 0; i < ITERATIONS_PER_RUN; i++) {
    await processPendingMediaJobs();
    await sleep(SWEEP_INTERVAL);
  }
  await continueAsNew();
}

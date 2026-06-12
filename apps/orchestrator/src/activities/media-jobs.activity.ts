import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';
import { log } from '@temporalio/activity';

// Polling fallback for async media generations (§11.2): drives `adapter.pollJob()` for
// every pending/processing AIMediaJob via the shared lifecycle service (which also
// handles the webhook path). Never throws — a sweep failure must not crash the workflow.
@Injectable()
@Activity()
export class MediaJobsActivity {
  constructor(private _lifecycle: MediaJobLifecycleService) {}

  @ActivityMethod()
  async processPendingMediaJobs(): Promise<{ processed: number; completed: number; failed: number }> {
    try {
      const result = await this._lifecycle.processPendingJobs();
      if (result.processed > 0) {
        log.info(
          `media jobs sweep: processed=${result.processed} completed=${result.completed} failed=${result.failed}`,
        );
      }
      return result;
    } catch (err) {
      log.warn(`media jobs sweep failed: ${(err as Error).message}`);
      return { processed: 0, completed: 0, failed: 0 };
    }
  }
}

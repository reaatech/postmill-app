import { Injectable, Logger } from '@nestjs/common';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';

// Polling fallback for async media generations (§11.2): drives `adapter.pollJob()` for
// every pending/processing AIMediaJob via the shared lifecycle service (which also
// handles the webhook path). Never throws — a sweep failure must not crash the workflow.
@Injectable()
export class MediaJobsActivity {
  private readonly logger = new Logger(MediaJobsActivity.name);

  constructor(private _lifecycle: MediaJobLifecycleService) {}

  async processPendingMediaJobs(): Promise<{ processed: number; completed: number; failed: number }> {
    try {
      const result = await this._lifecycle.processPendingJobs();
      if (result.processed > 0) {
        this.logger.log(
          `media jobs sweep: processed=${result.processed} completed=${result.completed} failed=${result.failed}`,
        );
      }
      return result;
    } catch (err) {
      this.logger.warn(`media jobs sweep failed: ${(err as Error).message}`);
      return { processed: 0, completed: 0, failed: 0 };
    }
  }
}

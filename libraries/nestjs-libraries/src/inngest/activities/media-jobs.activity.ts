import { Injectable, Logger } from '@nestjs/common';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { VideoRenderService } from '@gitroom/nestjs-libraries/media/design-render/video-render.service';

// Polling fallback for async media generations (§11.2): drives `adapter.pollJob()` for
// every pending/processing AIMediaJob via the shared lifecycle service (which also
// handles the webhook path). Never throws — a sweep failure must not crash the workflow.
@Injectable()
export class MediaJobsActivity {
  private readonly logger = new Logger(MediaJobsActivity.name);

  constructor(
    private _lifecycle: MediaJobLifecycleService,
    private _aiSettings: AiSettingsService,
    private _videoRenderService: VideoRenderService,
  ) {}

  async processPendingMediaJobs(): Promise<{ processed: number; completed: number; failed: number }> {
    let result = { processed: 0, completed: 0, failed: 0 };
    try {
      result = await this._lifecycle.processPendingJobs();
      if (result.processed > 0) {
        this.logger.log(
          `media jobs sweep: processed=${result.processed} completed=${result.completed} failed=${result.failed}`,
        );
      }
    } catch (err) {
      this.logger.warn(`media jobs sweep failed: ${(err as Error).message}`);
    }

    let videoProcessed = 0;
    try {
      const videoJobs = await this._aiSettings.getPendingMediaJobs(10);
      for (const job of videoJobs) {
        if (job.provider !== 'chromium-ffmpeg') continue;
        try {
          await this._videoRenderService.processVideoRender(job.id);
          result.processed++;
          result.completed++;
          videoProcessed++;
        } catch (err) {
          result.processed++;
          result.failed++;
          videoProcessed++;
          this.logger.warn(`Video render sweep error for ${job.id}: ${(err as Error).message}`);
        }
      }
      if (videoProcessed > 0) {
        this.logger.log(`video render sweep: processed=${videoProcessed}`);
      }
    } catch (err) {
      this.logger.warn(`Video render sweep failed: ${(err as Error).message}`);
    }

    return result;
  }
}

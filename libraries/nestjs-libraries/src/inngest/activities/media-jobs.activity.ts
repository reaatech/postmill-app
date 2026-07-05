import { Injectable, Logger } from '@nestjs/common';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { VideoRenderService } from '@gitroom/nestjs-libraries/media/design-render/video-render.service';
import { inngest, isInngestEnabled } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { getRenderConcurrency } from '@gitroom/nestjs-libraries/media/design-render/render-config';
import { mapWithConcurrency } from '@gitroom/nestjs-libraries/utils/concurrency';

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

  /**
   * A still-pending local render is only re-enqueued once it has been pending longer than this
   * (its original `media/render` event was likely lost). Freshly-enqueued jobs — including ones
   * legitimately waiting behind the `concurrency:3` cap — are left alone, so the sweep does not
   * stack a duplicate run for every job every minute.
   */
  private static readonly STALE_RENDER_MS = 90_000;

  /** True for the two local-compute render kinds (design timeline render + clip merge). */
  private isLocalRender(job: { provider: string; model?: string | null }): boolean {
    return job.provider === 'chromium-ffmpeg' || job.model === 'local/ffmpeg-merge';
  }

  private isStaleRender(job: { updatedAt?: Date | string | null; createdAt?: Date | string | null }): boolean {
    const ts = job.updatedAt ?? job.createdAt;
    if (!ts) return true;
    return Date.now() - new Date(ts).getTime() > MediaJobsActivity.STALE_RENDER_MS;
  }

  /**
   * Process one local render job (invoked by the concurrency-limited `media-render`
   * Inngest function). No-ops unless the job is still pending.
   */
  async processRenderJob(jobId: string): Promise<void> {
    const job = await this._aiSettings.getMediaJobById(jobId);
    if (!job) return;
    if (job.model === 'local/ffmpeg-merge') {
      await this._videoRenderService.processMergeRender(jobId);
    } else if (job.provider === 'chromium-ffmpeg') {
      await this._videoRenderService.processVideoRender(jobId);
    }
  }

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

    // Local renders are processed by the concurrency-limited `media-render` Inngest
    // function. This sweep is a safety net: re-enqueue any still-pending local render
    // (idempotent — processRenderJob no-ops once status != pending). When Inngest is off
    // there is no event consumer, so render inline through a host semaphore that holds the
    // same 3-concurrent cap.
    try {
      const pending = await this._aiSettings.getPendingMediaJobs(50);
      const localJobs = pending.filter(
        (j) => this.isLocalRender(j) && this.isStaleRender(j),
      );
      if (localJobs.length > 0) {
        if (isInngestEnabled()) {
          for (const job of localJobs) {
            await inngest.send({
              name: 'media/render',
              // Deterministic id: a stale-job re-enqueue dedups against the initial dispatch
              // (and other sweeps) within the same minute bucket, so at most one run is queued.
              id: `media-render-${job.id}-${Math.floor(Date.now() / 60000)}`,
              data: {
                jobId: job.id,
                op: job.model === 'local/ffmpeg-merge' ? 'merge' : 'design',
              },
            });
          }
        } else {
          await mapWithConcurrency(localJobs, getRenderConcurrency(), async (job) => {
            try {
              await this.processRenderJob(job.id);
              result.processed++;
              result.completed++;
            } catch (err) {
              result.processed++;
              result.failed++;
              this.logger.warn(
                `Inline render error for ${job.id}: ${(err as Error).message}`,
              );
            }
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Local render sweep failed: ${(err as Error).message}`);
    }

    return result;
  }
}

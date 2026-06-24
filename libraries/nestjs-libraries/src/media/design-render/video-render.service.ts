import { Injectable, Logger } from '@nestjs/common';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { FfmpegVideoEncoderService } from './ffmpeg-video-encoder.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { mediaJobWebhookToken } from '@gitroom/nestjs-libraries/media/media-job-token';
import * as fs from 'fs';
import * as path from 'path';

const MAX_DURATION_MS = 60000;
const RENDER_PAYLOAD_TTL_SECONDS = 24 * 60 * 60;

function payloadKey(jobId: string): string {
  return `video-render:payload:${jobId}`;
}

@Injectable()
export class VideoRenderService {
  private readonly logger = new Logger(VideoRenderService.name);

  constructor(
    private _lifecycle: MediaJobLifecycleService,
    private _aiSettings: AiSettingsService,
    private _encoder: FfmpegVideoEncoderService,
  ) {}

  async enqueueRender(
    orgId: string,
    body: {
      composition: any;
      outputIndex?: number;
      format?: string;
      quality?: number;
      bitrateKbps?: number;
      posterUrl?: string;
      folderId?: string;
    },
  ) {
    const composition = body.composition || {};
    const durationMs = composition.durationMs || 10000;
    if (durationMs > MAX_DURATION_MS) {
      throw new Error(
        `Composition duration ${durationMs}ms exceeds the 60 s hard cap`,
      );
    }

    const job = await this._lifecycle.createPendingJob({
      organizationId: orgId,
      provider: 'chromium-ffmpeg',
      operation: 'video',
      costUsd: 0,
      creditType: 'ai_videos',
    });

    const payload = {
      organizationId: orgId,
      composition: body.composition,
      outputIndex: body.outputIndex,
      format: body.format,
      quality: body.quality,
      bitrateKbps: body.bitrateKbps,
      posterUrl: body.posterUrl,
      folderId: body.folderId,
      enqueuedAt: new Date().toISOString(),
    };

    await ioRedis.set(
      payloadKey(job.id),
      JSON.stringify(payload),
      'EX',
      RENDER_PAYLOAD_TTL_SECONDS,
    );

    this.logger.log(`Enqueued video render job ${job.id} for org ${orgId}`);
    return { id: job.id, status: job.status };
  }

  async getJob(orgId: string, jobId: string) {
    return this._aiSettings.getMediaJobById(jobId);
  }

  async processVideoRender(jobId: string) {
    const job = await this._aiSettings.getMediaJobById(jobId);
    if (!job || job.provider !== 'chromium-ffmpeg' || job.status !== 'pending') {
      return;
    }

    let tmpDir: string | undefined;

    try {
      await this._aiSettings.updateMediaJob(jobId, { status: 'processing' });

      const raw = await ioRedis.get(payloadKey(jobId));
      if (!raw) {
        throw new Error(`No pending composition found for job ${jobId}`);
      }
      await ioRedis.del(payloadKey(jobId));
      const input = JSON.parse(raw);

      const composition = input.composition || {};
      const fps = composition.fps || 30;
      const durationMs = composition.durationMs || 10000;
      if (durationMs > MAX_DURATION_MS) {
        throw new Error(
          `Composition duration ${durationMs}ms exceeds the 60 s hard cap`,
        );
      }
      const totalFrames = Math.ceil((durationMs / 1000) * fps);

      this.logger.log(
        `Video render job ${jobId}: rendering ${totalFrames} frames at ${fps}fps, ` +
          `${composition.width}x${composition.height}, ${durationMs}ms`,
      );

      const format = ['webm', 'gif', 'webp-animated'].includes(input.format)
        ? input.format
        : 'mp4';
      const renderToken = mediaJobWebhookToken(jobId, job.organizationId);
      const result = await this._encoder.encode(composition, {
        fps,
        bitrateKbps: input.bitrateKbps || composition.bitrateKbps || 8000,
        format,
        quality: input.quality,
        jobId,
        orgId: job.organizationId,
        renderToken,
      });

      const videoBuffer = fs.readFileSync(result.videoPath);
      const thumbnailBuffer = fs.existsSync(result.thumbnailPath)
        ? fs.readFileSync(result.thumbnailPath)
        : undefined;

      this._encoder.cleanup(path.dirname(result.videoPath));

      const mimeType =
        format === 'webm'
          ? 'video/webm'
          : format === 'gif'
            ? 'image/gif'
            : format === 'webp-animated'
              ? 'image/webp'
              : 'video/mp4';

      const ok = await this._lifecycle.completeJobWithBuffer(
        job,
        videoBuffer,
        mimeType,
        {
          width: composition.width,
          height: composition.height,
          durationSeconds: durationMs / 1000,
          fps,
          provider: 'chromium-ffmpeg',
        },
        thumbnailBuffer,
      );

      if (!ok) {
        throw new Error('Lifecycle service failed to store artifact');
      }
    } catch (err) {
      this.logger.error(
        `Video render failed: ${jobId}: ${(err as Error).message}`,
      );
      await this._aiSettings.updateMediaJob(jobId, {
        status: 'failed',
        error: (err as Error).message.slice(0, 1000),
      });
    }
  }
}

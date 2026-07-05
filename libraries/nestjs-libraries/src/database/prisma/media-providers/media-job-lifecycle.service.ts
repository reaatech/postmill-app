import { Injectable, Logger } from '@nestjs/common';
import { AIMediaJob } from '@prisma/client';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { MediaArtifactMetadata } from '@gitroom/nestjs-libraries/media/media-provider-adapter.interface';
import { mediaJobWebhookToken } from '@gitroom/nestjs-libraries/media/media-job-token';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

// AIMediaJob has no dedicated provider-job-id column; while a job is pending the
// provider's external reference is stored in `artifactUrl` under this scheme and is
// replaced by the final stored-artifact URL on completion.
const PENDING_REF_PREFIX = 'pending://';

// Async jobs run 3–30 minutes (§11.2); anything older than this is dead.
const JOB_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// Defensive cap when downloading provider artifacts.
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;

// 'stt' jobs are created already-complete (transcript stored inline via
// completeJobWithBuffer), so they never enter the async poll path — but the type must
// admit them so the Deepgram studio can record transcript history as media jobs.
type AsyncOperation = 'video' | 'audio' | 'avatar' | 'image' | 'stt' | 'slide' | 'caption' | 'video-bg' | 'video-upscale';

const OPERATION_FOLDER: Record<string, string> = {
  image: 'images',
  video: 'video',
  avatar: 'video',
  audio: 'audio',
  tts: 'audio',
  stt: 'documents',
  slide: 'video',
  caption: 'video',
  'video-bg': 'video',
  'video-upscale': 'video',
};

const OPERATION_MEDIA_TYPE: Record<string, string> = {
  image: 'image',
  video: 'video',
  avatar: 'video',
  audio: 'audio',
  tts: 'audio',
  stt: 'document',
  slide: 'video',
  caption: 'video',
  'video-bg': 'video',
  'video-upscale': 'video',
};

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'text/plain': 'txt',
  'application/json': 'json',
};

export interface StoredArtifact {
  mediaId: string;
  path: string;
  fileSize: number;
}

@Injectable()
export class MediaJobLifecycleService {
  private readonly _logger = new Logger(MediaJobLifecycleService.name);

  constructor(
    private _aiSettings: AiSettingsService,
    private _orgMediaProviderSettings: OrgMediaProviderSettingsService,
    private _resolution: ProviderResolutionService,
    private _storageService: StorageService,
    private _fileService: FileService,
    private _notificationService: NotificationService,
  ) {}

  // ── Job creation / provider-reference tracking ──

  async createPendingJob(params: {
    organizationId: string;
    userId?: string;
    provider: string;
    operation: AsyncOperation;
    costUsd?: number;
    creditType?: string;
    folderId?: string | null;
    model?: string | null;
    version?: string | null;
    inputJson?: string | null;
  }): Promise<AIMediaJob> {
    return this._aiSettings.createMediaJob({
      organizationId: params.organizationId,
      userId: params.userId,
      provider: params.provider,
      operation: params.operation,
      status: 'pending',
      costUsd: params.costUsd,
      creditType: params.creditType,
      folderId: params.folderId,
      model: params.model,
      version: params.version ?? 'v1',
      inputJson: params.inputJson,
    });
  }

  // Webhook completion URL (§11.2) — unguessable (HMAC token) and org-bound.
  // Returns undefined when no backend base URL is configured (polling still covers it).
  // Only a public HTTPS base produces a webhook: providers (e.g. Replicate) reject
  // non-HTTPS webhook URLs with a 422, and a webhook pointed at http/localhost can
  // never be delivered anyway. For those bases we omit the webhook and let the
  // polling sweep / per-request poll complete the job.
  webhookUrlFor(jobId: string, organizationId: string): string | undefined {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!base) return undefined;
    let parsed: URL;
    try {
      parsed = new URL(base);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'https:') return undefined;
    try {
      const token = mediaJobWebhookToken(jobId, organizationId);
      return `${base.replace(/\/+$/, '')}/media-jobs/webhook/${jobId}/${token}`;
    } catch {
      return undefined;
    }
  }

  async attachProviderJob(jobId: string, providerJobId: string): Promise<void> {
    await this._aiSettings.updateMediaJob(jobId, {
      artifactUrl: `${PENDING_REF_PREFIX}${providerJobId}`,
    });
  }

  providerJobRef(job: AIMediaJob): string | null {
    if (job.artifactUrl?.startsWith(PENDING_REF_PREFIX)) {
      return job.artifactUrl.slice(PENDING_REF_PREFIX.length);
    }
    return null;
  }

  getJob(jobId: string): Promise<AIMediaJob | null> {
    return this._aiSettings.getMediaJobById(jobId);
  }

  // ── Completion paths ──

  // Single completion driver, used by both the webhook endpoint (as a trigger — the
  // webhook body is never trusted for the artifact; the provider's status API is the
  // source of truth) and the polling sweep.
  async processJob(jobId: string): Promise<'pending' | 'completed' | 'failed' | 'skipped'> {
    const job = await this._aiSettings.getMediaJobById(jobId);
    if (!job || (job.status !== 'pending' && job.status !== 'processing')) return 'skipped';

    if (Date.now() - job.createdAt.getTime() > JOB_TIMEOUT_MS) {
      await this.failJob(job, 'Job timed out waiting for the provider');
      return 'failed';
    }

    const providerJobId = this.providerJobRef(job);
    if (!providerJobId) return 'skipped';

    const config = await this._orgMediaProviderSettings.getConfigForProvider(
      job.organizationId,
      job.provider,
    );
    if (!config) {
      await this.failJob(job, `Provider "${job.provider}" is no longer configured`);
      return 'failed';
    }

    let adapter;
    try {
      adapter = this._resolution.resolveMedia(job.provider, {
        // 4.10: an in-flight render must be polled through the version it was
        // CREATED under (pinned on the job row) — not the config's current
        // version, which may have been upgraded mid-render and parse the
        // namespaced `<op>:<id>` provider ref differently.
        version: job.version ?? config.version ?? 'v1',
        credentials: config.credentials,
        orgId: job.organizationId,
      });
    } catch (err) {
      // Unknown/retired provider version throws — fail the job cleanly instead of
      // leaving it pending until the 24h timeout (and 500-ing the webhook path).
      await this.failJob(
        job,
        `Provider "${job.provider}" could not be resolved: ${(err as Error).message}`,
      );
      return 'failed';
    }
    if (!adapter?.pollJob) {
      await this.failJob(job, `Provider "${job.provider}" cannot report job status`);
      return 'failed';
    }

    let poll;
    try {
      poll = await adapter.pollJob(providerJobId, { credentials: config.credentials });
    } catch (err) {
      // Transient polling errors leave the job pending — the next sweep retries
      // until the 24h timeout fails it.
      this._logger.warn(`Polling ${job.provider} job ${jobId} failed: ${(err as Error).message}`);
      return 'pending';
    }

    if (poll.status === 'failed') {
      await this.failJob(job, poll.error || 'Provider reported failure');
      return 'failed';
    }
    if (poll.status === 'completed' && poll.artifactUrl) {
      const ok = await this.completeJob(job, poll.artifactUrl, poll.metadata, job.folderId);
      // Land any additional artifacts from the SAME generation (e.g. Suno returns 2 clips) as
      // sibling completed jobs. Done after the primary completes: once the primary flips to
      // `completed`, processJob short-circuits to 'skipped' on later sweeps, so siblings are
      // created exactly once. (Primary-first ordering means a mid-fan-out crash loses an extra
      // clip rather than duplicating the set on the next retry.)
      if (ok && poll.extraArtifactUrls?.length) {
        await this._landExtraArtifacts(job, poll.extraArtifactUrls, poll.metadata);
      }
      return ok ? 'completed' : 'failed';
    }

    if (job.status === 'pending') {
      await this._aiSettings.updateMediaJob(job.id, { status: 'processing' });
    }
    return 'pending';
  }

  // Land extra artifacts from a single provider job (e.g. a music provider returning multiple
  // takes) as independent sibling jobs, each already completed, so every clip becomes its own
  // File row + render-queue card. Best-effort: a failed sibling is logged and never fails the
  // primary job's completion.
  private async _landExtraArtifacts(
    primary: AIMediaJob,
    urls: string[],
    metadata?: MediaArtifactMetadata,
  ): Promise<void> {
    for (const url of urls) {
      try {
        const sibling = await this.createPendingJob({
          organizationId: primary.organizationId,
          userId: primary.userId ?? undefined,
          provider: primary.provider,
          operation: primary.operation as AsyncOperation,
          folderId: primary.folderId,
          model: primary.model,
          version: primary.version,
          inputJson: primary.inputJson,
        });
        await this.completeJob(sibling, url, metadata, primary.folderId);
      } catch (err) {
        this._logger.warn(
          `Failed to land extra artifact for job ${primary.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // Download the artifact (provider URLs expire), land it in tenant storage under the
  // provider root's typed folder, persist metadata, mark completed and notify (§11.2/11.5/11.7).
  /**
   * Complete a job where the artifact is already a local Buffer (e.g. the
   * chromium-ffmpeg render pipeline). Stores the buffer in tenant storage,
   * persists metadata, and notifies the org.
   */
  async completeJobWithBuffer(
    job: AIMediaJob,
    buffer: Buffer,
    mime: string,
    metadata?: MediaArtifactMetadata,
    thumbnailBuffer?: Buffer,
    folderId?: string,
  ): Promise<boolean> {
    try {
      const stored = await this._writeToTenantStorage({
        organizationId: job.organizationId,
        provider: job.provider,
        operation: job.operation,
        baseName: `${job.operation}-${job.id}`,
        buffer,
        mime,
        folderId,
        metadata: {
          ...metadata,
          provider: metadata?.provider || job.provider,
          mime,
          source: 'ai-media',
        },
      });

      let thumbnailPath: string | undefined;
      if (thumbnailBuffer) {
        const thumbStored = await this._writeToTenantStorage({
          organizationId: job.organizationId,
          provider: job.provider,
          operation: 'image',
          baseName: `${job.operation}-${job.id}-thumb`,
          buffer: thumbnailBuffer,
          mime: 'image/jpeg',
          folderId,
          metadata: {
            provider: job.provider,
            mime: 'image/jpeg',
            source: 'ai-media-thumbnail',
          },
        });
        thumbnailPath = thumbStored.path;
      }

      await this._aiSettings.updateMediaJob(job.id, {
        status: 'completed',
        artifactUrl: stored.path,
        error: null,
      });

      if (thumbnailPath) {
        await this._fileService.saveMediaInformation(job.organizationId, {
          id: stored.mediaId,
          thumbnail: thumbnailPath,
          alt: '',
          thumbnailTimestamp: 0,
        });
      }

      await this._notify(
        job,
        'success',
        `AI ${job.operation} ready`,
        `Your generated ${job.operation} is ready in the media library.`,
      );
      return true;
    } catch (err) {
      await this.failJob(job, `Failed to store generated artifact: ${(err as Error).message}`);
      return false;
    }
  }

  async completeJob(
    job: AIMediaJob,
    artifactUrl: string,
    metadata?: MediaArtifactMetadata,
    folderId?: string | null,
  ): Promise<boolean> {
    try {
      const stored = await this.storeArtifact({
        organizationId: job.organizationId,
        provider: job.provider,
        operation: job.operation,
        jobId: job.id,
        artifactUrl,
        metadata,
        folderId,
      });

      await this._aiSettings.updateMediaJob(job.id, {
        status: 'completed',
        artifactUrl: stored.path,
        error: null,
      });

      await this._notify(
        job,
        'success',
        `AI ${job.operation} ready`,
        `Your generated ${job.operation} is ready in the media library.`,
      );
      return true;
    } catch (err) {
      await this.failJob(job, `Failed to store generated artifact: ${(err as Error).message}`);
      return false;
    }
  }

  async failJob(job: AIMediaJob, error: string, options?: { notify?: boolean }): Promise<void> {
    await this._aiSettings.updateMediaJob(job.id, {
      status: 'failed',
      error: error.slice(0, 1000),
      ...(this.providerJobRef(job) ? { artifactUrl: null } : {}),
    });
    if (options?.notify === false) return;
    await this._notify(
      job,
      'fail',
      `AI ${job.operation} failed`,
      `Your ${job.operation} generation with ${job.provider} failed: ${error.slice(0, 200)}`,
    );
  }

  // ── Artifact / transcript storage (§11.5) ──

  async storeArtifact(params: {
    organizationId: string;
    provider: string;
    operation: string;
    jobId: string;
    artifactUrl: string;
    metadata?: MediaArtifactMetadata;
    folderId?: string | null;
  }): Promise<StoredArtifact> {
    const { buffer, mime } = await this._download(params.artifactUrl, params.metadata?.mime);
    const metadata: Record<string, unknown> = {
      ...params.metadata,
      provider: params.metadata?.provider || params.provider,
      mime,
      source: 'ai-media',
    };
    return this._writeToTenantStorage({
      organizationId: params.organizationId,
      provider: params.provider,
      operation: params.operation,
      baseName: `${params.operation}-${params.jobId}`,
      buffer,
      mime,
      folderId: params.folderId,
      metadata,
    });
  }

  // §11.1: STT output is a transcript document under documents/ with the source and
  // segments captured in Media.metadata.
  async storeTranscript(params: {
    organizationId: string;
    provider: string;
    text: string;
    segments?: { start: number; end: number; text: string }[];
  }): Promise<StoredArtifact> {
    const metadata: Record<string, unknown> = {
      provider: params.provider,
      mime: 'text/plain',
      source: 'stt',
      ...(params.segments ? { segments: params.segments } : {}),
    };
    return this._writeToTenantStorage({
      organizationId: params.organizationId,
      provider: params.provider,
      operation: 'stt',
      baseName: `transcript-${Date.now()}`,
      buffer: Buffer.from(params.text, 'utf-8'),
      mime: 'text/plain',
      metadata,
    });
  }

  // ── Polling sweep entrypoint (Temporal activity) ──

  async processPendingJobs(limit = 100): Promise<{ processed: number; completed: number; failed: number }> {
    const jobs = await this._aiSettings.getPendingMediaJobs(limit);
    let completed = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        const result = await this.processJob(job.id);
        if (result === 'completed') completed++;
        if (result === 'failed') failed++;
      } catch (err) {
        // One broken job never crashes the sweep.
        this._logger.warn(`Media job sweep error for ${job.id}: ${(err as Error).message}`);
      }
    }
    return { processed: jobs.length, completed, failed };
  }

  // ── internals ──

  private async _download(
    artifactUrl: string,
    mimeHint?: string,
  ): Promise<{ buffer: Buffer; mime: string }> {
    if (artifactUrl.startsWith('data:')) {
      const commaIdx = artifactUrl.indexOf(',');
      if (commaIdx === -1) throw new Error('Invalid data URI artifact');
      const header = artifactUrl.slice(5, commaIdx);
      const payload = artifactUrl.slice(commaIdx + 1);
      const isBase64 = header.endsWith(';base64');
      const mime = (isBase64 ? header.slice(0, -7) : header) || mimeHint || 'application/octet-stream';
      const buffer = isBase64
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf-8');
      if (buffer.length > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the size limit');
      return { buffer, mime };
    }

    const res = await safeFetch(artifactUrl);
    if (!res.ok) throw new Error(`Artifact download failed (${res.status})`);
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the size limit');
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the size limit');
    const mime = res.headers.get('content-type')?.split(';')[0] || mimeHint || 'application/octet-stream';
    return { buffer, mime };
  }

  private async _writeToTenantStorage(params: {
    organizationId: string;
    provider: string;
    operation: string;
    baseName: string;
    buffer: Buffer;
    mime: string;
    folderId?: string;
    metadata: Record<string, unknown>;
  }): Promise<StoredArtifact> {
    const config = await this._orgMediaProviderSettings.getConfigForProvider(
      params.organizationId,
      params.provider,
    );

    const adapter = config?.storageProviderId
      ? await this._storageService.getAdapter(config.storageProviderId, params.organizationId)
      : await this._storageService.getLocalAdapterForOrg(params.organizationId, true);

    const path = await adapter.writeBuffer(params.buffer, params.mime);

    const folderName = OPERATION_FOLDER[params.operation] || 'other';
    const folderId =
      params.folderId ??
      (config?.storageRootFolderId
        ? await this._orgMediaProviderSettings.getStandardFolderId(
            params.organizationId,
            config.storageRootFolderId,
            folderName,
          )
        : null);

    const ext = MIME_EXT[params.mime] || 'bin';
    const media = await this._fileService.saveGeneratedMedia(params.organizationId, {
      name: `${params.baseName}.${ext}`,
      path,
      type: OPERATION_MEDIA_TYPE[params.operation] || 'other',
      folderId,
      fileSize: params.buffer.length,
      metadata: params.metadata,
    });

    return { mediaId: media.id, path, fileSize: params.buffer.length };
  }

  private async _notify(
    job: AIMediaJob,
    type: 'success' | 'fail',
    subject: string,
    message: string,
  ): Promise<void> {
    try {
      await this._notificationService.notify({
        orgId: job.organizationId,
        category: 'media',
        title: subject,
        message,
        metadata: { mediaJobId: job.id, operation: job.operation },
        channels: { email: false, push: false, inApp: true },
      });
    } catch (err) {
      this._logger.warn(`Media job notification failed: ${(err as Error).message}`);
    }
  }
}

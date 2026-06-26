import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AIMediaJob } from '@prisma/client';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { MediaJobLifecycleService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/media-job-lifecycle.service';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { MediaProviderRegistry } from '@gitroom/nestjs-libraries/media/media-provider.registry';
import { MediaGenerateOptions, MediaModelOption, MediaOperation } from '@gitroom/nestjs-libraries/media/media-provider-adapter.interface';
import { RedisService } from '@gitroom/nestjs-libraries/redis/redis.service';

export interface StudioGenerateParams {
  operation: 'video' | 'image' | 'audio';
  model?: string;
  input: Record<string, string | number | boolean>;
  mediaInputs?: Record<string, string>;
  folderId?: string | null;
}

// Provider-agnostic studio backend. Every provider difference lives in its adapter +
// the frontend descriptor — this service only resolves credentials, creates the job
// ledger row, dispatches to the registry adapter by operation, and tracks completion
// through the shared MediaJobLifecycleService (webhook-first, poll-cron fallback).
@Injectable()
export class MediaStudioService {
  private readonly _logger = new Logger(MediaStudioService.name);

  constructor(
    private readonly _orgMediaProviderSettings: OrgMediaProviderSettingsService,
    private readonly _lifecycle: MediaJobLifecycleService,
    private readonly _aiSettings: AiSettingsService,
    private readonly _registry: MediaProviderRegistry,
    private readonly _storage: StorageService,
    private readonly _fileService: FileService,
    private readonly _redis: RedisService,
  ) {}

  // Runtime model catalog for a modality, feeding the studio's dynamic model dropdown.
  // Cached ~60s per (provider, operation, org) — catalogs are large but change rarely, and
  // every render's status poll must not re-hit the provider's /models endpoint. Returns []
  // when the adapter exposes no catalog (the descriptor's static options then apply).
  async listModels(orgId: string, provider: string, operation: MediaOperation): Promise<MediaModelOption[]> {
    const adapter = this._registry.get(provider);
    if (!adapter?.listModels) return [];

    const cacheKey = `studio:models:${provider}:${operation}:${orgId}`;
    const cached = await this._redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as MediaModelOption[];
      } catch {
        /* fall through to refetch */
      }
    }

    const config = await this._orgMediaProviderSettings.getConfigForProvider(orgId, provider);
    if (!config?.credentials || Object.keys(config.credentials).length === 0) return [];

    let models: MediaModelOption[] = [];
    try {
      models = await adapter.listModels(operation, { credentials: config.credentials });
    } catch (err) {
      this._logger.warn(`listModels failed for ${provider}/${operation}: ${(err as Error).message}`);
      return [];
    }
    await this._redis.set(cacheKey, JSON.stringify(models), 60).catch(() => {});
    return models;
  }

  async getStatus(orgId: string, provider: string): Promise<{ configured: boolean; enabled: boolean }> {
    const providers = await this._orgMediaProviderSettings.getProviders(orgId);
    const match = providers.find((p) => p.identifier === provider);
    if (!match) throw new ForbiddenException(`Unknown media provider "${provider}"`);
    return { configured: match.isConfigured, enabled: match.enabled };
  }

  async generate(
    orgId: string,
    userId: string,
    provider: string,
    params: StudioGenerateParams,
  ): Promise<{ jobId: string }> {
    const adapter = this._registry.get(provider);
    if (!adapter) throw new ForbiddenException(`Unknown media provider "${provider}"`);

    const config = await this._orgMediaProviderSettings.getConfigForProvider(orgId, provider);
    const credentials = config?.credentials;
    if (!credentials || Object.keys(credentials).length === 0) {
      throw new ForbiddenException(`${provider} is not configured. Add credentials in Settings → Media.`);
    }

    // Resolve media-field file references to provider-reachable URLs (server-side, so
    // local-storage assets get a usable URL rather than an internal /files path).
    const input: Record<string, string | number | boolean> = { ...params.input };
    if (params.mediaInputs) {
      for (const [field, fileId] of Object.entries(params.mediaInputs)) {
        if (fileId) input[field] = await this._resolvePublicUrl(orgId, fileId);
      }
    }

    const { prompt, model: inputModel, ...rest } = input;
    const model = params.model || (typeof inputModel === 'string' ? inputModel : undefined);
    const promptStr = typeof prompt === 'string' ? prompt : '';

    const job = await this._lifecycle.createPendingJob({
      organizationId: orgId,
      userId: userId || undefined,
      provider,
      operation: params.operation,
      model: model ?? provider,
      folderId: params.folderId,
      inputJson: JSON.stringify({ operation: params.operation, model, prompt: promptStr, input: rest }),
    });

    const webhookUrl = this._lifecycle.webhookUrlFor(job.id, orgId);
    const options: MediaGenerateOptions = {
      credentials,
      webhookUrl,
      model,
      input: rest,
    };

    try {
      if (params.operation === 'image') {
        const result = await adapter.generateImage(promptStr, options);
        const url = result.image || result.images?.[0];
        if (!url) throw new Error('Provider returned no image');
        const ok = await this._lifecycle.completeJob(job, url, result.metadata, job.folderId);
        if (!ok) throw new Error('Failed to store generated image');
        return { jobId: job.id };
      }

      const submit =
        params.operation === 'audio'
          ? await adapter.generateAudio(promptStr, options)
          : await adapter.generateVideo(promptStr, options);

      // Sync providers return the finished artifact inline — complete immediately.
      if (submit.artifactUrl) {
        const ok = await this._lifecycle.completeJob(job, submit.artifactUrl, submit.metadata, job.folderId);
        if (!ok) throw new Error('Failed to store generated artifact');
        return { jobId: job.id };
      }

      await this._lifecycle.attachProviderJob(job.id, submit.jobId);
      return { jobId: job.id };
    } catch (err) {
      await this._lifecycle.failJob(job, (err as Error).message, { notify: false });
      throw err;
    }
  }

  // Lists recent jobs for the render queue. Drives completion on read so the queue
  // advances even where no public webhook can reach this instance (local dev / private
  // deploys); the media-jobs-poll cron is the backstop.
  async listJobs(orgId: string, provider: string, limit = 30) {
    const pending = await this._aiSettings.getMediaJobsByProvider(orgId, provider, limit);
    await Promise.all(
      pending
        .filter((j) => j.status === 'pending' || j.status === 'processing')
        .map((j) => this._lifecycle.processJob(j.id).catch(() => undefined)),
    );
    const jobs = await this._aiSettings.getMediaJobsByProvider(orgId, provider, limit);
    return Promise.all(jobs.map((j) => this._presentJob(orgId, j)));
  }

  private async _presentJob(orgId: string, job: AIMediaJob) {
    // The pending `pending://` ref is internal and must never reach the client; only a
    // completed job has a real /files URL. Resolve the File id too so the composer
    // handoff ("Post") can attach it.
    const completed = job.status === 'completed' && job.artifactUrl;
    let fileId: string | null = null;
    if (completed) {
      const file = await this._fileService.getFileByPath(orgId, job.artifactUrl!).catch(() => null);
      fileId = file?.id ?? null;
    }
    return {
      id: job.id,
      operation: job.operation,
      status: job.status,
      artifactUrl: completed ? job.artifactUrl : null,
      fileId,
      error: job.error || null,
      createdAt: job.createdAt,
    };
  }

  // Resolve a /files asset to a URL the provider can fetch (cloud → public URL, local →
  // media-directory URL). Mirrors the HeyGen/Replicate resolvers.
  private async _resolvePublicUrl(orgId: string, fileId: string): Promise<string> {
    const file = await this._fileService.getFileById(fileId);
    if (!file || file.organizationId !== orgId) {
      throw new ForbiddenException('File not found');
    }
    if (file.path.startsWith('https://')) return file.path;
    const adapter = file.folderId
      ? await this._storage.resolveAdapterForFolder(file.folderId, orgId)
      : await this._storage.getLocalAdapterForOrg(orgId, true);
    return adapter.getFileUrl(file.path);
  }
}

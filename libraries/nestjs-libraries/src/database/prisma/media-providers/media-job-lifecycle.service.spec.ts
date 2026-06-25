import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSafeFetch = vi.fn();
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch', () => ({
  safeFetch: (url: string, init?: RequestInit) => mockSafeFetch(url, init),
}));

import { MediaJobLifecycleService } from './media-job-lifecycle.service';
import { AIMediaJob } from '@prisma/client';

function makeJob(overrides: Partial<AIMediaJob> = {}): AIMediaJob {
  return {
    id: 'job-1',
    organizationId: 'org-1',
    userId: 'user-1',
    provider: 'luma',
    operation: 'video',
    status: 'pending',
    artifactUrl: 'pending://luma-ext-1',
    provenance: null,
    costUsd: 0.5,
    creditType: 'ai_videos',
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AIMediaJob;
}

function makeService() {
  const jobs = new Map<string, AIMediaJob>();
  const aiSettings = {
    createMediaJob: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
      const job = makeJob({ ...(data as Partial<AIMediaJob>), id: 'created-1', artifactUrl: null });
      jobs.set(job.id, job);
      return job;
    }),
    updateMediaJob: vi.fn().mockImplementation(async (id: string, data: Partial<AIMediaJob>) => {
      const job = { ...(jobs.get(id) || makeJob({ id })), ...data };
      jobs.set(id, job as AIMediaJob);
      return job;
    }),
    getMediaJobById: vi.fn().mockImplementation(async (id: string) => jobs.get(id) || null),
    getPendingMediaJobs: vi.fn().mockResolvedValue([]),
  };

  const pollJob = vi.fn();
  const adapter = { identifier: 'luma', pollJob };
  const registry = { get: vi.fn().mockReturnValue(adapter) };

  const orgSettings = {
    getConfigForProvider: vi.fn().mockResolvedValue({
      credentials: { apiKey: 'luma-key' },
      storageProviderId: null,
      storageRootFolderId: null,
    }),
    getStandardFolderId: vi.fn().mockResolvedValue('folder-video-1'),
  };

  const storageAdapter = { writeBuffer: vi.fn().mockResolvedValue('/uploads/org-1/artifact.mp4') };
  const storageService = {
    getAdapter: vi.fn().mockResolvedValue(storageAdapter),
    getLocalAdapterForOrg: vi.fn().mockResolvedValue(storageAdapter),
  };

  const mediaRepository = {
    saveGeneratedMedia: vi.fn().mockResolvedValue({ id: 'media-1', path: '/uploads/org-1/artifact.mp4' }),
  };

  const notificationService = { inAppNotification: vi.fn().mockResolvedValue(undefined) };

  const service = new MediaJobLifecycleService(
    aiSettings as never,
    orgSettings as never,
    registry as never,
    storageService as never,
    mediaRepository as never,
    notificationService as never,
  );

  return {
    service,
    jobs,
    aiSettings,
    pollJob,
    registry,
    orgSettings,
    storageAdapter,
    storageService,
    mediaRepository,
    notificationService,
  };
}

describe('MediaJobLifecycleService (§11.2 async job lifecycle)', () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  const originalJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeFetch.mockReset();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com';
  });

  afterEach(() => {
    if (originalBackendUrl === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL;
    else process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
  });

  describe('job creation + provider reference', () => {
    it('creates a pending AIMediaJob row', async () => {
      const { service, aiSettings } = makeService();
      const job = await service.createPendingJob({
        organizationId: 'org-1',
        userId: 'user-1',
        provider: 'luma',
        operation: 'video',
        costUsd: 0.5,
        creditType: 'ai_videos',
      });
      expect(job.id).toBe('created-1');
      expect(aiSettings.createMediaJob).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', provider: 'luma', operation: 'video' }),
      );
    });

    it('stores the provider job reference under the pending:// scheme', async () => {
      const { service, aiSettings } = makeService();
      await service.attachProviderJob('job-1', 'ext-99');
      expect(aiSettings.updateMediaJob).toHaveBeenCalledWith('job-1', { artifactUrl: 'pending://ext-99' });
    });

    it('extracts the provider job ref only from pending:// values', () => {
      const { service } = makeService();
      expect(service.providerJobRef(makeJob({ artifactUrl: 'pending://abc' }))).toBe('abc');
      expect(service.providerJobRef(makeJob({ artifactUrl: 'https://real/url.mp4' }))).toBeNull();
      expect(service.providerJobRef(makeJob({ artifactUrl: null }))).toBeNull();
    });

    it('builds an org-bound webhook URL and omits it when no base URL is set', () => {
      const { service } = makeService();
      const url = service.webhookUrlFor('job-1', 'org-1');
      expect(url).toMatch(/^https:\/\/api\.example\.com\/media-jobs\/webhook\/job-1\/[0-9a-f]{64}$/);

      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      expect(service.webhookUrlFor('job-1', 'org-1')).toBeUndefined();
    });

    it('omits the webhook for a non-HTTPS base (providers reject http/localhost)', () => {
      const { service } = makeService();
      const prev = process.env.NEXT_PUBLIC_BACKEND_URL;
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:3000';
      expect(service.webhookUrlFor('job-1', 'org-1')).toBeUndefined();
      process.env.NEXT_PUBLIC_BACKEND_URL = prev;
    });
  });

  describe('processJob', () => {
    it('skips unknown or already-finished jobs', async () => {
      const { service, jobs } = makeService();
      expect(await service.processJob('nope')).toBe('skipped');

      jobs.set('done-1', makeJob({ id: 'done-1', status: 'completed' }));
      expect(await service.processJob('done-1')).toBe('skipped');
    });

    it('fails jobs that exceeded the 24h timeout', async () => {
      const { service, jobs, aiSettings, notificationService } = makeService();
      jobs.set('old-1', makeJob({ id: 'old-1', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }));

      expect(await service.processJob('old-1')).toBe('failed');
      expect(aiSettings.updateMediaJob).toHaveBeenCalledWith(
        'old-1',
        expect.objectContaining({ status: 'failed' }),
      );
      expect(notificationService.inAppNotification).toHaveBeenCalled();
    });

    it('stays pending while the provider is still working (and marks processing)', async () => {
      const { service, jobs, pollJob, aiSettings } = makeService();
      jobs.set('job-1', makeJob());
      pollJob.mockResolvedValue({ status: 'pending' });

      expect(await service.processJob('job-1')).toBe('pending');
      expect(pollJob).toHaveBeenCalledWith('luma-ext-1', { credentials: { apiKey: 'luma-key' } });
      expect(aiSettings.updateMediaJob).toHaveBeenCalledWith('job-1', { status: 'processing' });
    });

    it('treats transient poll errors as pending (retried next sweep)', async () => {
      const { service, jobs, pollJob } = makeService();
      jobs.set('job-1', makeJob());
      pollJob.mockRejectedValue(new Error('network blip'));

      expect(await service.processJob('job-1')).toBe('pending');
    });

    it('fails the job when the provider reports failure', async () => {
      const { service, jobs, pollJob, notificationService } = makeService();
      jobs.set('job-1', makeJob());
      pollJob.mockResolvedValue({ status: 'failed', error: 'NSFW rejected' });

      expect(await service.processJob('job-1')).toBe('failed');
      expect(jobs.get('job-1')!.status).toBe('failed');
      expect(jobs.get('job-1')!.error).toContain('NSFW rejected');
      expect(notificationService.inAppNotification).toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining('failed'),
        expect.any(String),
        false,
        false,
        'fail',
      );
    });

    it('downloads, stores under the typed folder, completes, and notifies on success', async () => {
      const { service, jobs, pollJob, orgSettings, storageAdapter, mediaRepository, notificationService } =
        makeService();
      jobs.set('job-1', makeJob());
      orgSettings.getConfigForProvider.mockResolvedValue({
        credentials: { apiKey: 'luma-key' },
        storageProviderId: null,
        storageRootFolderId: 'root-1',
      });
      pollJob.mockResolvedValue({
        status: 'completed',
        artifactUrl: 'https://provider.example.com/out.mp4',
        metadata: { durationSeconds: 5, model: 'dream-machine' },
      });
      mockSafeFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '4' }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      });

      expect(await service.processJob('job-1')).toBe('completed');

      // artifact downloaded via safeFetch (provider URLs expire)
      expect(mockSafeFetch).toHaveBeenCalledWith('https://provider.example.com/out.mp4', undefined);
      // written into tenant storage
      expect(storageAdapter.writeBuffer).toHaveBeenCalledWith(expect.any(Buffer), 'video/mp4');
      // typed folder under the provider root (video operation → video/)
      expect(orgSettings.getStandardFolderId).toHaveBeenCalledWith('org-1', 'root-1', 'video');
      // Media row with extracted metadata
      expect(mediaRepository.saveGeneratedMedia).toHaveBeenCalledWith('org-1', expect.objectContaining({
        type: 'video',
        folderId: 'folder-video-1',
        fileSize: 4,
        metadata: expect.objectContaining({
          durationSeconds: 5,
          model: 'dream-machine',
          provider: 'luma',
          mime: 'video/mp4',
        }),
      }));
      // job completed with the stored (tenant) URL, not the provider URL
      expect(jobs.get('job-1')!.status).toBe('completed');
      expect(jobs.get('job-1')!.artifactUrl).toBe('/uploads/org-1/artifact.mp4');
      // user notified
      expect(notificationService.inAppNotification).toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining('ready'),
        expect.any(String),
        false,
        false,
        'success',
      );
    });

    it('uses the bound storage provider adapter when configured', async () => {
      const { service, jobs, pollJob, orgSettings, storageService } = makeService();
      jobs.set('job-1', makeJob());
      orgSettings.getConfigForProvider.mockResolvedValue({
        credentials: { apiKey: 'k' },
        storageProviderId: 'sp-1',
        storageRootFolderId: null,
      });
      pollJob.mockResolvedValue({ status: 'completed', artifactUrl: 'data:video/mp4;base64,AAAA' });

      await service.processJob('job-1');
      expect(storageService.getAdapter).toHaveBeenCalledWith('sp-1', 'org-1');
      expect(storageService.getLocalAdapterForOrg).not.toHaveBeenCalled();
    });

    it('decodes data: URI artifacts without fetching', async () => {
      const { service, jobs, pollJob, storageAdapter } = makeService();
      jobs.set('job-1', makeJob());
      pollJob.mockResolvedValue({
        status: 'completed',
        artifactUrl: `data:video/mp4;base64,${Buffer.from('vid').toString('base64')}`,
      });

      expect(await service.processJob('job-1')).toBe('completed');
      expect(mockSafeFetch).not.toHaveBeenCalled();
      expect(storageAdapter.writeBuffer).toHaveBeenCalledWith(expect.any(Buffer), 'video/mp4');
    });

    it('fails the job when the artifact download fails', async () => {
      const { service, jobs, pollJob } = makeService();
      jobs.set('job-1', makeJob());
      pollJob.mockResolvedValue({ status: 'completed', artifactUrl: 'https://provider.example.com/gone.mp4' });
      mockSafeFetch.mockResolvedValue({ ok: false, status: 404, headers: new Headers() });

      expect(await service.processJob('job-1')).toBe('failed');
      expect(jobs.get('job-1')!.error).toContain('Failed to store generated artifact');
    });

    it('fails jobs whose adapter cannot poll', async () => {
      const { service, jobs, registry } = makeService();
      jobs.set('job-1', makeJob());
      registry.get.mockReturnValue({ identifier: 'x' }); // no pollJob

      expect(await service.processJob('job-1')).toBe('failed');
    });

    it('fails jobs whose provider config is gone', async () => {
      const { service, jobs, orgSettings } = makeService();
      jobs.set('job-1', makeJob());
      orgSettings.getConfigForProvider.mockResolvedValue(null);

      expect(await service.processJob('job-1')).toBe('failed');
    });
  });

  describe('failJob notify option', () => {
    it('suppresses the notification when notify=false', async () => {
      const { service, jobs, notificationService } = makeService();
      jobs.set('job-1', makeJob());
      await service.failJob(makeJob(), 'provider down', { notify: false });
      expect(notificationService.inAppNotification).not.toHaveBeenCalled();
    });
  });

  describe('storeTranscript (§11.1)', () => {
    it('stores the transcript as a text document under documents/ with stt metadata', async () => {
      const { service, orgSettings, storageAdapter, mediaRepository } = makeService();
      orgSettings.getConfigForProvider.mockResolvedValue({
        credentials: { apiKey: 'k' },
        storageProviderId: null,
        storageRootFolderId: 'root-1',
      });

      const result = await service.storeTranscript({
        organizationId: 'org-1',
        provider: 'deepgram',
        text: 'hello world',
        segments: [{ start: 0, end: 1.5, text: 'hello world' }],
      });

      expect(storageAdapter.writeBuffer).toHaveBeenCalledWith(expect.any(Buffer), 'text/plain');
      expect(orgSettings.getStandardFolderId).toHaveBeenCalledWith('org-1', 'root-1', 'documents');
      expect(mediaRepository.saveGeneratedMedia).toHaveBeenCalledWith('org-1', expect.objectContaining({
        type: 'document',
        name: expect.stringMatching(/^transcript-\d+\.txt$/),
        metadata: expect.objectContaining({
          source: 'stt',
          provider: 'deepgram',
          segments: [{ start: 0, end: 1.5, text: 'hello world' }],
        }),
      }));
      expect(result.mediaId).toBe('media-1');
    });
  });

  describe('processPendingJobs (polling sweep)', () => {
    it('processes each pending job and never throws on individual failures', async () => {
      const { service, jobs, aiSettings, pollJob } = makeService();
      jobs.set('a', makeJob({ id: 'a' }));
      jobs.set('b', makeJob({ id: 'b' }));
      aiSettings.getPendingMediaJobs.mockResolvedValue([jobs.get('a'), jobs.get('b')]);
      pollJob
        .mockResolvedValueOnce({ status: 'failed', error: 'x' })
        .mockResolvedValueOnce({ status: 'pending' });

      const result = await service.processPendingJobs();
      expect(result).toEqual({ processed: 2, completed: 0, failed: 1 });
    });
  });
});

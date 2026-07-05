import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaStudioService, StudioGenerateParams } from './media-studio.service';

function makeService() {
  const orgSettings = {
    getConfigForProvider: vi.fn().mockImplementation((_orgId: string, _provider: string, version?: string) =>
      Promise.resolve({
        credentials: { apiKey: 'test-key' },
        storageProviderId: null,
        storageRootFolderId: null,
        version: version ?? 'v1',
      })
    ),
    getProviders: vi.fn().mockResolvedValue([]),
    isProviderEnabledForOperation: vi.fn().mockResolvedValue(true),
  };

  const lifecycle = {
    createPendingJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
    completeJob: vi.fn().mockResolvedValue(true),
    attachProviderJob: vi.fn().mockResolvedValue(undefined),
    webhookUrlFor: vi.fn().mockReturnValue('https://api.example.com/webhook/job-1'),
    processJob: vi.fn().mockResolvedValue('completed'),
  };

  const aiSettings = {
    getMediaJobsByProvider: vi.fn().mockResolvedValue([]),
  };

  const adapter = {
    identifier: 'test-provider',
    capabilities: { image: true, video: true, audio: false, avatar: false, tts: false, stt: false, upscale: false, bgRemove: false, inpaint: false },
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
    generateAudio: vi.fn(),
    listModels: vi.fn(),
  };
  const resolution = {
    resolveMedia: vi.fn().mockReturnValue(adapter),
  };

  const kernel = {
    getMetadata: vi.fn().mockReturnValue(undefined),
  };

  const storage = {
    resolveAdapterForFolder: vi.fn(),
    getLocalAdapterForOrg: vi.fn(),
  };

  const fileService = {
    getFileById: vi.fn(),
    getFileByPath: vi.fn(),
  };

  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  };

  const service = new MediaStudioService(
    orgSettings as never,
    lifecycle as never,
    aiSettings as never,
    resolution as never,
    kernel as never,
    storage as never,
    fileService as never,
    redis as never,
  );

  return {
    service,
    orgSettings,
    lifecycle,
    aiSettings,
    adapter,
    resolution,
    kernel,
    storage,
    fileService,
    redis,
  };
}

describe('MediaStudioService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('listModels', () => {
    it('resolves the adapter through ProviderKernel with stored version/credentials/org', async () => {
      const { service, orgSettings, resolution, adapter, redis } = makeService();
      adapter.listModels.mockResolvedValue([{ id: 'm1', label: 'M1' }]);

      const models = await service.listModels('org-1', 'test-provider', 'image');

      expect(redis.get).toHaveBeenCalledWith('studio:models:test-provider:image:org-1:default');
      expect(orgSettings.getConfigForProvider).toHaveBeenCalledWith('org-1', 'test-provider', undefined);
      expect(resolution.resolveMedia).toHaveBeenCalledWith('test-provider', {
        version: 'v1',
        credentials: { apiKey: 'test-key' },
        orgId: 'org-1',
      });
      expect(models).toEqual([{ id: 'm1', label: 'M1' }]);
    });

    it('passes explicit version query to config resolution', async () => {
      const { service, orgSettings, resolution, adapter, redis } = makeService();
      adapter.listModels.mockResolvedValue([{ id: 'm2', label: 'M2' }]);

      const models = await service.listModels('org-1', 'test-provider', 'image', 'v2');

      expect(redis.get).toHaveBeenCalledWith('studio:models:test-provider:image:org-1:v2');
      expect(orgSettings.getConfigForProvider).toHaveBeenCalledWith('org-1', 'test-provider', 'v2');
      expect(resolution.resolveMedia).toHaveBeenCalledWith('test-provider', {
        version: 'v2',
        credentials: { apiKey: 'test-key' },
        orgId: 'org-1',
      });
      expect(models).toEqual([{ id: 'm2', label: 'M2' }]);
    });

    it('returns [] when the org has no credentials', async () => {
      const { service, orgSettings, resolution } = makeService();
      orgSettings.getConfigForProvider.mockResolvedValue({
        credentials: {},
        storageProviderId: null,
        storageRootFolderId: null,
        version: 'v1',
      });

      const models = await service.listModels('org-1', 'test-provider', 'image');
      expect(models).toEqual([]);
      expect(resolution.resolveMedia).not.toHaveBeenCalled();
    });

    it('falls back to static metadata models when the live catalog is empty', async () => {
      const { service, kernel, adapter, redis } = makeService();
      adapter.listModels.mockResolvedValue([]);
      kernel.getMetadata.mockReturnValue({
        mediaModels: {
          'text-to-image': [
            { id: 'model-a', label: 'Model A', fields: [] },
            { id: 'model-b', label: 'Model B', fields: [] },
          ],
        },
      });

      const models = await service.listModels('org-1', 'test-provider', 'image');

      expect(models).toEqual([
        { id: 'model-a', label: 'Model A' },
        { id: 'model-b', label: 'Model B' },
      ]);
      expect(redis.set).toHaveBeenCalledWith(
        'studio:models:test-provider:image:org-1:default',
        JSON.stringify([
          { id: 'model-a', label: 'Model A' },
          { id: 'model-b', label: 'Model B' },
        ]),
        60,
      );
    });

    it('falls back to static metadata models when the adapter has no listModels', async () => {
      const { service, kernel, adapter } = makeService();
      adapter.listModels = undefined;
      kernel.getMetadata.mockReturnValue({
        mediaModels: {
          'text-to-video': [{ id: 'vid-1', label: 'Vid 1', fields: [] }],
        },
      });

      const models = await service.listModels('org-1', 'test-provider', 'video');

      expect(models).toEqual([{ id: 'vid-1', label: 'Vid 1' }]);
    });
  });

  describe('generate', () => {
    it('creates a pending job tagged with the stored version and resolves the adapter via ProviderKernel', async () => {
      const { service, orgSettings, resolution, lifecycle, adapter } = makeService();
      adapter.generateImage.mockResolvedValue({ multi: false, image: 'https://provider.test/out.png' });

      const params: StudioGenerateParams = {
        operation: 'image',
        input: { prompt: 'a cat' },
      };

      const result = await service.generate('org-1', 'user-1', 'test-provider', params);

      expect(result).toEqual({ jobId: 'job-1' });
      expect(lifecycle.createPendingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          provider: 'test-provider',
          operation: 'image',
          version: 'v1',
        }),
      );
      expect(orgSettings.getConfigForProvider).toHaveBeenCalledWith('org-1', 'test-provider', undefined);
      expect(resolution.resolveMedia).toHaveBeenCalledWith('test-provider', {
        version: 'v1',
        credentials: { apiKey: 'test-key' },
        orgId: 'org-1',
      });
      expect(adapter.generateImage).toHaveBeenCalledWith('a cat', expect.objectContaining({
        credentials: { apiKey: 'test-key' },
        webhookUrl: 'https://api.example.com/webhook/job-1',
      }));
      expect(lifecycle.completeJob).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'job-1' }),
        'https://provider.test/out.png',
        undefined,
        undefined,
      );
    });

    it('passes explicit version query to config resolution and job ledger', async () => {
      const { service, orgSettings, resolution, lifecycle, adapter } = makeService();
      adapter.generateImage.mockResolvedValue({ multi: false, image: 'https://provider.test/out.png' });

      const params: StudioGenerateParams = {
        operation: 'image',
        input: { prompt: 'a cat' },
        version: 'v2',
      };

      const result = await service.generate('org-1', 'user-1', 'test-provider', params);

      expect(result).toEqual({ jobId: 'job-1' });
      expect(lifecycle.createPendingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          provider: 'test-provider',
          operation: 'image',
          version: 'v2',
        }),
      );
      expect(orgSettings.getConfigForProvider).toHaveBeenCalledWith('org-1', 'test-provider', 'v2');
      expect(resolution.resolveMedia).toHaveBeenCalledWith('test-provider', {
        version: 'v2',
        credentials: { apiKey: 'test-key' },
        orgId: 'org-1',
      });
    });

    it('rejects when the provider is not configured', async () => {
      const { service, orgSettings } = makeService();
      orgSettings.getConfigForProvider.mockResolvedValue({
        credentials: {},
        storageProviderId: null,
        storageRootFolderId: null,
        version: 'v1',
      });

      await expect(
        service.generate('org-1', 'user-1', 'test-provider', {
          operation: 'image',
          input: { prompt: 'a cat' },
        }),
      ).rejects.toThrow('not configured');
    });

    it('blocks generation for a disabled provider before resolving credentials (1.7)', async () => {
      const { service, orgSettings, resolution } = makeService();
      orgSettings.isProviderEnabledForOperation.mockResolvedValue(false);

      await expect(
        service.generate('org-1', 'user-1', 'test-provider', {
          operation: 'image',
          input: { prompt: 'a cat' },
        }),
      ).rejects.toThrow('disabled');
      // never reaches credential resolution / adapter dispatch
      expect(orgSettings.getConfigForProvider).not.toHaveBeenCalled();
      expect(resolution.resolveMedia).not.toHaveBeenCalled();
    });
  });

  describe('listModels enabled gate (1.7)', () => {
    it('returns [] for a disabled provider without resolving the adapter', async () => {
      const { service, orgSettings, resolution } = makeService();
      orgSettings.isProviderEnabledForOperation.mockResolvedValue(false);

      const models = await service.listModels('org-1', 'test-provider', 'image');
      expect(models).toEqual([]);
      expect(orgSettings.getConfigForProvider).not.toHaveBeenCalled();
      expect(resolution.resolveMedia).not.toHaveBeenCalled();
    });
  });
});

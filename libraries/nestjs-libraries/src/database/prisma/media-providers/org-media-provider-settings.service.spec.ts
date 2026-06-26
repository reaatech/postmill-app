import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgMediaProviderSettingsService } from './org-media-provider-settings.service';

function makeService() {
  const repository = {
    getByOrg: vi.fn().mockResolvedValue([]),
    getByIdentifier: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ identifier: 'openai' }),
    delete: vi.fn().mockResolvedValue({}),
  };
  const encryption = {
    encrypt: vi.fn((v: string) => `enc(${v})`),
    decrypt: vi.fn((v: string) => v.replace(/^enc\((.*)\)$/, '$1')),
  };
  const registry = { getAll: vi.fn().mockReturnValue([]), get: vi.fn() };
  const mediaRepository = {
    findFoldersByParent: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn().mockImplementation(async (_org: string, data: { name: string }) => ({
      id: `f-${data.name}`,
      name: data.name,
    })),
  };
  const credentialLink = {
    syncFromMediaProvider: vi.fn().mockResolvedValue(undefined),
  };

  const service = new OrgMediaProviderSettingsService(
    repository as never,
    encryption as never,
    registry as never,
    mediaRepository as never,
    credentialLink as never,
  );

  return { service, repository, encryption, registry, mediaRepository, credentialLink };
}

describe('OrgMediaProviderSettingsService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('upsert', () => {
    it('encrypts credentials at rest', async () => {
      const { service, repository } = makeService();
      await service.upsert('org-1', 'openai', { enabled: true, credentials: { apiKey: 'sk-1' } });
      expect(repository.upsert).toHaveBeenCalledWith('org-1', 'openai', expect.objectContaining({
        enabled: true,
        credentials: `enc(${JSON.stringify({ apiKey: 'sk-1' })})`,
      }));
    });

    it('live-links openai/minimax credentials to the AI surface (§11.4)', async () => {
      const { service, credentialLink } = makeService();
      await service.upsert('org-1', 'openai', { credentials: { apiKey: 'sk-1' } });
      expect(credentialLink.syncFromMediaProvider).toHaveBeenCalledWith('org-1', 'openai', { apiKey: 'sk-1' });
    });

    it('does not call the link when no credentials are supplied', async () => {
      const { service, credentialLink } = makeService();
      await service.upsert('org-1', 'openai', { enabled: true });
      expect(credentialLink.syncFromMediaProvider).not.toHaveBeenCalled();
    });

    it('ensures the 5-folder typed tree when a storage binding is saved (§11.5)', async () => {
      const { service, mediaRepository } = makeService();
      await service.upsert('org-1', 'fal', {
        storageProviderId: 'sp-1',
        storageRootFolderId: 'root-1',
      });
      const created = mediaRepository.createFolder.mock.calls.map((c) => c[1].name);
      expect(created.sort()).toEqual(['audio', 'documents', 'images', 'other', 'video']);
    });
  });

  describe('getEnabledProviders', () => {
    it('returns enabled+credentialed rows with parsed extraConfig and no secrets', async () => {
      const { service, repository } = makeService();
      repository.getByOrg.mockResolvedValue([
        {
          identifier: 'fal',
          enabled: true,
          credentials: 'enc({"apiKey":"k"})',
          storageProviderId: 'sp-1',
          storageRootFolderId: 'root-1',
          extraConfig: JSON.stringify({ operations: ['image'], c2paAvailable: true }),
        },
        { identifier: 'luma', enabled: false, credentials: 'enc({})', storageProviderId: null, storageRootFolderId: null, extraConfig: null },
        { identifier: 'heygen', enabled: true, credentials: null, storageProviderId: null, storageRootFolderId: null, extraConfig: null },
      ]);

      const result = await service.getEnabledProviders('org-1');
      expect(result).toEqual([
        {
          identifier: 'fal',
          storageProviderId: 'sp-1',
          storageRootFolderId: 'root-1',
          extraConfig: { operations: ['image'], c2paAvailable: true },
        },
      ]);
      expect(JSON.stringify(result)).not.toContain('apiKey');
    });

    it('tolerates malformed extraConfig', async () => {
      const { service, repository } = makeService();
      repository.getByOrg.mockResolvedValue([
        { identifier: 'fal', enabled: true, credentials: 'enc({})', storageProviderId: null, storageRootFolderId: null, extraConfig: '{not json' },
      ]);
      const result = await service.getEnabledProviders('org-1');
      expect(result[0].extraConfig).toEqual({});
    });
  });

  describe('getConfigForProvider', () => {
    it('decrypts the credentials', async () => {
      const { service, repository } = makeService();
      repository.getByIdentifier.mockResolvedValue({
        identifier: 'fal',
        credentials: `enc(${JSON.stringify({ apiKey: 'k-1' })})`,
        storageProviderId: 'sp-1',
        storageRootFolderId: 'root-1',
      });

      const config = await service.getConfigForProvider('org-1', 'fal');
      expect(config).toEqual({
        credentials: { apiKey: 'k-1' },
        storageProviderId: 'sp-1',
        storageRootFolderId: 'root-1',
      });
    });

    it('returns null when not configured', async () => {
      const { service } = makeService();
      expect(await service.getConfigForProvider('org-1', 'nope')).toBeNull();
    });
  });

  describe('getStandardFolderId', () => {
    it('creates missing folders and resolves the typed folder id', async () => {
      const { service, mediaRepository } = makeService();
      mediaRepository.findFoldersByParent
        .mockResolvedValueOnce([]) // ensure pass
        .mockResolvedValueOnce([
          { id: 'f-video', name: 'video' },
          { id: 'f-audio', name: 'audio' },
        ]);

      const id = await service.getStandardFolderId('org-1', 'root-1', 'video');
      expect(id).toBe('f-video');
    });

    it('rejects non-standard folder names', async () => {
      const { service } = makeService();
      expect(await service.getStandardFolderId('org-1', 'root-1', '../escape')).toBeNull();
    });
  });

  describe('isProviderEnabledForOperation', () => {
    it('gates on enabled + extraConfig operations', async () => {
      const { service, repository } = makeService();
      repository.getByIdentifier.mockResolvedValue({
        enabled: true,
        extraConfig: JSON.stringify({ operations: ['video'] }),
      });
      expect(await service.isProviderEnabledForOperation('org-1', 'luma', 'video')).toBe(true);
      expect(await service.isProviderEnabledForOperation('org-1', 'luma', 'image')).toBe(false);

      repository.getByIdentifier.mockResolvedValue({ enabled: false, extraConfig: null });
      expect(await service.isProviderEnabledForOperation('org-1', 'luma', 'video')).toBe(false);

      repository.getByIdentifier.mockResolvedValue({ enabled: true, extraConfig: null });
      expect(await service.isProviderEnabledForOperation('org-1', 'luma', 'video')).toBe(true);
    });
  });

  describe('getProviders / getActiveProviders / delete / testConnection', () => {
    it('merges registry adapters with org config state', async () => {
      const { service, registry, repository } = makeService();
      registry.getAll.mockReturnValue([
        { identifier: 'fal', name: 'fal.ai', capabilities: { image: true } },
        { identifier: 'luma', name: 'Luma', capabilities: { video: true } },
      ]);
      repository.getByOrg.mockResolvedValue([
        { identifier: 'fal', enabled: true, credentials: 'enc({})', storageProviderId: 'sp-1', storageRootFolderId: null, createdAt: new Date(1), updatedAt: new Date(2) },
      ]);

      const providers = await service.getProviders('org-1');
      expect(providers).toHaveLength(2);
      expect(providers[0]).toMatchObject({ identifier: 'fal', enabled: true, isConfigured: true, storageProviderId: 'sp-1' });
      expect(providers[1]).toMatchObject({ identifier: 'luma', enabled: false, isConfigured: false });
      expect(JSON.stringify(providers)).not.toContain('enc(');
    });

    it('getActiveProviders returns only enabled + credentialed rows', async () => {
      const { service, repository } = makeService();
      repository.getByOrg.mockResolvedValue([
        { identifier: 'fal', enabled: true, credentials: 'enc({})', storageProviderId: null, storageRootFolderId: null },
        { identifier: 'luma', enabled: true, credentials: null, storageProviderId: null, storageRootFolderId: null },
      ]);
      const active = await service.getActiveProviders('org-1');
      expect(active).toEqual([{ identifier: 'fal', storageProviderId: null, storageRootFolderId: null }]);
    });

    it('delete delegates to the repository', async () => {
      const { service, repository } = makeService();
      await service.delete('org-1', 'fal');
      expect(repository.delete).toHaveBeenCalledWith('org-1', 'fal');
    });

    it('testConnection runs a probe generation with decrypted credentials', async () => {
      const { service, repository, registry } = makeService();
      const generateImage = vi.fn().mockResolvedValue({ multi: false, image: 'ok' });
      registry.get.mockReturnValue({ identifier: 'fal', capabilities: { image: true }, generateImage });
      repository.getByIdentifier.mockResolvedValue({ identifier: 'fal', credentials: 'enc({"apiKey":"k"})' });

      const result = await service.testConnection('org-1', 'fal');
      expect(generateImage).toHaveBeenCalledWith('test', { credentials: { apiKey: 'k' } });
      expect(result).toEqual({ ok: true, message: 'Connection successful' });
    });

    it('testConnection reports probe failures and unknown providers', async () => {
      const { service, repository, registry } = makeService();
      registry.get.mockReturnValue({
        identifier: 'fal',
        capabilities: { image: true },
        generateImage: vi.fn().mockRejectedValue(new Error('bad key')),
      });
      repository.getByIdentifier.mockResolvedValue({ identifier: 'fal', credentials: 'enc({})' });
      expect(await service.testConnection('org-1', 'fal')).toEqual({ ok: false, message: 'bad key' });

      registry.get.mockReturnValue(undefined);
      await expect(service.testConnection('org-1', 'fal')).rejects.toThrow('Unknown media provider');

      repository.getByIdentifier.mockResolvedValue(null);
      await expect(service.testConnection('org-1', 'nope')).rejects.toThrow('not configured');
    });

    it('testConnection prefers the adapter testConnection over image generation', async () => {
      const { service, repository, registry } = makeService();
      const generateImage = vi.fn();
      const testConnection = vi.fn().mockResolvedValue({ ok: true, message: 'Connection successful' });
      registry.get.mockReturnValue({
        identifier: 'heygen',
        capabilities: { image: false, video: true, avatar: true },
        generateImage,
        testConnection,
      });
      repository.getByIdentifier.mockResolvedValue({ identifier: 'heygen', credentials: 'enc({"apiKey":"k"})' });

      const result = await service.testConnection('org-1', 'heygen');
      expect(testConnection).toHaveBeenCalledWith({ credentials: { apiKey: 'k' } });
      expect(generateImage).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, message: 'Connection successful' });
    });

    it('testConnection does not run image generation for a non-image provider without a test', async () => {
      const { service, repository, registry } = makeService();
      const generateImage = vi.fn();
      registry.get.mockReturnValue({ identifier: 'deepgram', capabilities: { image: false, stt: true }, generateImage });
      repository.getByIdentifier.mockResolvedValue({ identifier: 'deepgram', credentials: 'enc({})' });

      const result = await service.testConnection('org-1', 'deepgram');
      expect(generateImage).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });
});

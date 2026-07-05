import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

// ioRedis is touched by _bustDefaultsCatalogCache on the success path — stub it so no
// real connection is attempted.
vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(0),
  },
}));

import { MediaProviderController } from './media-provider.controller';

const org = { id: 'org-1' } as any;

function makeController(overrides: {
  configs?: any[];
  getFolder?: any;
} = {}) {
  const orgMedia = { upsert: vi.fn().mockResolvedValue({}) };
  const defaultsSeed = { seedUnset: vi.fn().mockResolvedValue(undefined) };
  const kernel = { listManifests: vi.fn().mockReturnValue([]) };
  const resolution = { resolveMedia: vi.fn().mockReturnValue({ identifier: 'openai' }) };
  const storageService = {
    getProviderConfigs: vi
      .fn()
      .mockResolvedValue(overrides.configs ?? [{ id: 'store-1', organizationId: 'org-1' }]),
  };
  const fileService = {
    getFolder:
      overrides.getFolder ?? vi.fn().mockResolvedValue({ id: 'folder-1', organizationId: 'org-1' }),
  };
  const controller = new MediaProviderController(
    orgMedia as any,
    defaultsSeed as any,
    kernel as any,
    resolution as any,
    storageService as any,
    fileService as any,
  );
  return { controller, orgMedia, storageService, fileService };
}

// PROVIDER_REMEDIATION 3.6: validate storageProviderId + storageRootFolderId belong to
// the caller's org at WRITE time (not deferred to job completion after a paid render).
describe('MediaProviderController.setStorage ownership (3.6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists when both ids belong to the org', async () => {
    const { controller, orgMedia } = makeController({
      configs: [{ id: 'store-1', organizationId: 'org-1' }],
    });

    const result = await controller.setStorage(org, 'openai', {
      storageProviderId: 'store-1',
      storageRootFolderId: 'folder-1',
    });

    expect(result).toEqual({ identifier: 'openai', success: true });
    expect(orgMedia.upsert).toHaveBeenCalledWith('org-1', 'openai', {
      storageProviderId: 'store-1',
      storageRootFolderId: 'folder-1',
    });
  });

  it('rejects a storageProviderId owned by another org', async () => {
    const { controller, orgMedia } = makeController({
      configs: [{ id: 'store-1', organizationId: 'org-1' }],
    });

    await expect(
      controller.setStorage(org, 'openai', { storageProviderId: 'store-OTHER' }),
    ).rejects.toThrow(BadRequestException);
    expect(orgMedia.upsert).not.toHaveBeenCalled();
  });

  it('rejects a storageRootFolderId owned by another org', async () => {
    const { controller, orgMedia } = makeController({
      configs: [{ id: 'store-1', organizationId: 'org-1' }],
      // getFolder throws (404) for a cross-org folder.
      getFolder: vi.fn().mockRejectedValue(new Error('Folder not found')),
    });

    await expect(
      controller.setStorage(org, 'openai', {
        storageProviderId: 'store-1',
        storageRootFolderId: 'folder-OTHER',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(orgMedia.upsert).not.toHaveBeenCalled();
  });

  it('accepts the synthetic __virtual_local__ provider id', async () => {
    const { controller, orgMedia } = makeController({
      configs: [{ id: '__virtual_local__', organizationId: 'org-1' }],
    });

    await controller.setStorage(org, 'openai', { storageProviderId: '__virtual_local__' });
    expect(orgMedia.upsert).toHaveBeenCalled();
  });
});

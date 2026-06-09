import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageProviderType } from '@prisma/client';

const mockModel = {
  storageProviderConfig: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  mediaFolder: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  media: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
};

vi.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {
    get model() {
      return mockModel;
    }
  },
}));

import { StorageRepository } from './storage.repository';

function makeRepo() {
  const storage = { model: mockModel } as any;
  const folder = { model: mockModel } as any;
  const media = { model: mockModel } as any;
  const org = { model: mockModel } as any;
  return new StorageRepository(storage, folder, media, org);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StorageRepository', () => {
  describe('findByOrg', () => {
    it('returns all configs for an org, ordered by creation', async () => {
      mockModel.storageProviderConfig.findMany.mockResolvedValue([
        { id: '1', organizationId: 'org-1', type: 'LOCAL' },
      ]);
      const repo = makeRepo();

      const result = await repo.findByOrg('org-1');

      expect(result).toHaveLength(1);
      expect(mockModel.storageProviderConfig.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findDefault', () => {
    it('returns the default provider for an org', async () => {
      mockModel.storageProviderConfig.findFirst.mockResolvedValue({
        id: 'default-1',
        isDefault: true,
      });
      const repo = makeRepo();

      const result = await repo.findDefault('org-1');

      expect(result).toEqual({ id: 'default-1', isDefault: true });
      expect(mockModel.storageProviderConfig.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
      });
    });
  });

  describe('setDefault', () => {
    it('clears the old default and sets a new one', async () => {
      mockModel.storageProviderConfig.updateMany.mockResolvedValue({ count: 1 });
      mockModel.storageProviderConfig.update.mockResolvedValue({
        id: 'new-default',
        isDefault: true,
      });
      const repo = makeRepo();

      const result = await repo.setDefault('org-1', 'new-default');

      expect(mockModel.storageProviderConfig.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(mockModel.storageProviderConfig.update).toHaveBeenCalledWith({
        where: { id: 'new-default' },
        data: { isDefault: true },
      });
    });
  });

  describe('countSourceMedia', () => {
    it('counts LOCAL unfoldered media and sums their size', async () => {
      mockModel.media.count.mockResolvedValue(5);
      mockModel.media.aggregate.mockResolvedValue({
        _sum: { fileSize: 1024 },
      });
      const repo = makeRepo();

      const result = await repo.countSourceMedia('org-1', {
        id: 'src',
        type: StorageProviderType.LOCAL,
      });

      expect(result.count).toBe(5);
      expect(result.totalBytes).toBe(BigInt(1024));
      expect(mockModel.media.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        })
      );
    });

    it('counts cloud-mounted media for a specific provider', async () => {
      mockModel.media.count.mockResolvedValue(3);
      mockModel.media.aggregate.mockResolvedValue({
        _sum: { fileSize: 2048 },
      });
      const repo = makeRepo();

      const result = await repo.countSourceMedia('org-1', {
        id: 'cloud-1',
        type: StorageProviderType.S3,
      });

      expect(result.count).toBe(3);
      expect(result.totalBytes).toBe(BigInt(2048));
    });
  });

  describe('findSourceMediaPage', () => {
    it('returns a page of media with cursor', async () => {
      mockModel.media.findMany.mockResolvedValue([
        { id: 'm1', name: 'a.png', path: 'p1', type: 'image', fileSize: 10 },
      ]);
      const repo = makeRepo();

      const result = await repo.findSourceMediaPage('org-1', {
        id: 'src',
        type: StorageProviderType.LOCAL,
      }, 'cursor-1', 25);

      expect(result).toHaveLength(1);
      expect(mockModel.media.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
          take: 25,
          skip: 1,
          cursor: { id: 'cursor-1' },
        })
      );
    });

    it('starts from the beginning without a cursor', async () => {
      mockModel.media.findMany.mockResolvedValue([]);
      const repo = makeRepo();

      await repo.findSourceMediaPage('org-1', {
        id: 'src',
        type: StorageProviderType.LOCAL,
      }, undefined, 10);

      const call = mockModel.media.findMany.mock.calls[0][0];
      expect(call).not.toHaveProperty('cursor');
      expect(call).not.toHaveProperty('skip');
    });
  });

  describe('updateMediaLocation', () => {
    it('updates a media item path and folder', async () => {
      mockModel.media.update.mockResolvedValue({ id: 'm1' });
      const repo = makeRepo();

      await repo.updateMediaLocation('m1', 'new-path', 'folder-1');

      expect(mockModel.media.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { path: 'new-path', folderId: 'folder-1' },
      });
    });
  });

  describe('findMountFolder', () => {
    it('finds the root folder for a mounted provider', async () => {
      mockModel.mediaFolder.findFirst.mockResolvedValue({
        id: 'folder-1',
        storageProviderId: 'provider-1',
      });
      const repo = makeRepo();

      const result = await repo.findMountFolder('org-1', 'provider-1');

      expect(result).toEqual({ id: 'folder-1', storageProviderId: 'provider-1' });
    });
  });

  describe('removeOrDetachMountFolders', () => {
    it('deletes empty mount folders', async () => {
      mockModel.mediaFolder.findMany.mockResolvedValue([
        {
          id: 'folder-1',
          storageProviderId: 'provider-1',
          _count: { media: 0, children: 0 },
        },
      ]);
      mockModel.mediaFolder.delete.mockResolvedValue({ id: 'folder-1' });
      const repo = makeRepo();

      await repo.removeOrDetachMountFolders('provider-1');

      expect(mockModel.mediaFolder.delete).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
      });
    });

    it('detaches non-empty folders instead of deleting', async () => {
      mockModel.mediaFolder.findMany.mockResolvedValue([
        {
          id: 'folder-1',
          storageProviderId: 'provider-1',
          _count: { media: 5, children: 0 },
        },
      ]);
      mockModel.mediaFolder.update.mockResolvedValue({
        id: 'folder-1',
        storageProviderId: null,
      });
      const repo = makeRepo();

      await repo.removeOrDetachMountFolders('provider-1');

      expect(mockModel.mediaFolder.update).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
        data: { storageProviderId: null },
      });
    });
  });

  describe('getOrgQuota', () => {
    it('returns the org quota or default', async () => {
      mockModel.organization.findUnique.mockResolvedValue({
        localStorageQuotaBytes: BigInt(1000),
      });
      const repo = makeRepo();

      const result = await repo.getOrgQuota('org-1');

      expect(result).toBe(BigInt(1000));
    });

    it('defaults to 5GB when org not found', async () => {
      mockModel.organization.findUnique.mockResolvedValue(null);
      const repo = makeRepo();

      const result = await repo.getOrgQuota('org-1');

      expect(result).toBe(BigInt(5368709120));
    });
  });

  describe('getStorageUsedByOrg', () => {
    it('returns sum of file sizes for an org', async () => {
      mockModel.media.aggregate.mockResolvedValue({
        _sum: { fileSize: 1000 },
      });
      const repo = makeRepo();

      const result = await repo.getStorageUsedByOrg('org-1');

      expect(result).toBe(BigInt(1000));
    });

    it('returns 0 when no media', async () => {
      mockModel.media.aggregate.mockResolvedValue({
        _sum: { fileSize: null },
      });
      const repo = makeRepo();

      const result = await repo.getStorageUsedByOrg('org-1');

      expect(result).toBe(BigInt(0));
    });
  });

  describe('updateHealthCheck', () => {
    it('sets lastHealthCheck on success', async () => {
      mockModel.storageProviderConfig.update.mockResolvedValue({
        id: 'p1',
        lastHealthCheck: new Date(),
        lastHealthError: null,
      });
      const repo = makeRepo();

      await repo.updateHealthCheck('p1', true);

      expect(mockModel.storageProviderConfig.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { lastHealthCheck: expect.any(Date), lastHealthError: null },
      });
    });

    it('sets lastHealthError on failure', async () => {
      mockModel.storageProviderConfig.update.mockResolvedValue({
        id: 'p1',
        lastHealthError: 'Connection failed',
      });
      const repo = makeRepo();

      await repo.updateHealthCheck('p1', false, 'Connection failed');

      expect(mockModel.storageProviderConfig.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { lastHealthError: 'Connection failed' },
      });
    });
  });
});

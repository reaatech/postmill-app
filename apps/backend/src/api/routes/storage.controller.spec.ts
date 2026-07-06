import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageProviderType, Organization, User } from '@prisma/client';

const serviceMock = {
  getProviderConfigs: vi.fn(),
  createConfig: vi.fn(),
  updateConfig: vi.fn(),
  deleteConfig: vi.fn(),
  testConnection: vi.fn(),
  mount: vi.fn(),
  unmount: vi.fn(),
  getUsage: vi.fn(),
  getMigrationPreview: vi.fn(),
  migrate: vi.fn(),
};

const auditMock = {
  createLog: vi.fn(),
};

const fileMock = {
  getFiles: vi.fn(),
};

vi.mock('@gitroom/nestjs-libraries/database/prisma/storage/storage.service', () => ({
  StorageService: class {
    getProviderConfigs = serviceMock.getProviderConfigs;
    createConfig = serviceMock.createConfig;
    updateConfig = serviceMock.updateConfig;
    deleteConfig = serviceMock.deleteConfig;
    testConnection = serviceMock.testConnection;
    mount = serviceMock.mount;
    unmount = serviceMock.unmount;
    getUsage = serviceMock.getUsage;
    getMigrationPreview = serviceMock.getMigrationPreview;
    migrate = serviceMock.migrate;
  },
}));

import { StorageController } from './storage.controller';
import { HttpException } from '@nestjs/common';
import type { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import type { AuditService } from '@gitroom/nestjs-libraries/database/prisma/audit/audit.service';
import type { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';

const org: Organization = { id: 'org-1' } as any;
const user: User = { id: 'user-1' } as any;

function makeController() {
  return new StorageController(
    serviceMock as unknown as StorageService,
    auditMock as unknown as AuditService,
    fileMock as unknown as FileService
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StorageController', () => {
  describe('listProviders', () => {
    it('returns all providers for the org', async () => {
      serviceMock.getProviderConfigs.mockResolvedValue([
        { id: 'local-1', name: 'Local Storage', type: 'LOCAL' },
      ]);
      const controller = makeController();

      const result = await controller.listProviders(org);

      expect(result).toHaveLength(1);
      expect(serviceMock.getProviderConfigs).toHaveBeenCalledWith('org-1');
    });
  });

  describe('createProvider', () => {
    it('creates a new storage provider', async () => {
      serviceMock.createConfig.mockResolvedValue({
        id: 's3-1',
        name: 'My S3',
        type: 'S3',
      });
      serviceMock.testConnection.mockResolvedValue({ ok: true });
      const controller = makeController();

      const result = await controller.createProvider(org, user, {
        type: StorageProviderType.S3,
        name: 'My S3',
        credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
        region: 'us-east-1',
        bucket: 'my-bucket',
      });

      expect(result.name).toBe('My S3');
      expect(serviceMock.createConfig).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ name: 'My S3' }),
        'user-1'
      );
    });

    it('deletes the config if test connection fails', async () => {
      serviceMock.createConfig.mockResolvedValue({ id: 's3-1' });
      serviceMock.testConnection.mockResolvedValue({
        ok: false,
        error: 'Invalid credentials',
      });
      serviceMock.deleteConfig.mockResolvedValue({});
      const controller = makeController();

      await expect(
        controller.createProvider(org, user, {
          type: StorageProviderType.S3,
          name: 'Bad Config',
        } as any)
      ).rejects.toThrow(HttpException);

      expect(serviceMock.deleteConfig).toHaveBeenCalled();
    });
  });

  describe('updateProvider', () => {
    it('updates provider configuration', async () => {
      serviceMock.updateConfig.mockResolvedValue({
        id: 's3-1',
        name: 'Updated S3',
      });
      const controller = makeController();

      await controller.updateProvider(org, user, 's3-1', {
        name: 'Updated S3',
      });

      expect(serviceMock.updateConfig).toHaveBeenCalledWith(
        's3-1',
        'org-1',
        expect.objectContaining({ name: 'Updated S3' }),
        'user-1'
      );
    });
  });

  describe('deleteProvider', () => {
    it('deletes a provider', async () => {
      serviceMock.deleteConfig.mockResolvedValue({});
      const controller = makeController();

      const result = await controller.deleteProvider(org, user, 's3-1');

      expect(result).toEqual({ success: true });
      expect(serviceMock.deleteConfig).toHaveBeenCalledWith('s3-1', 'org-1', 'user-1');
    });
  });

  describe('testConnection', () => {
    it('tests connectivity to a provider', async () => {
      serviceMock.testConnection.mockResolvedValue({
        ok: true,
      });
      const controller = makeController();

      const result = await controller.testConnection(org, 's3-1');

      expect(result.ok).toBe(true);
    });
  });

  describe('mountProvider', () => {
    it('mounts a provider and creates its root folder', async () => {
      serviceMock.mount.mockResolvedValue({
        id: 's3-1',
        mounted: true,
      });
      const controller = makeController();

      const result = await controller.mountProvider(org, 's3-1');

      expect(result.mounted).toBe(true);
    });
  });

  describe('unmountProvider', () => {
    it('unmounts a provider', async () => {
      serviceMock.unmount.mockResolvedValue({
        id: 's3-1',
        mounted: false,
      });
      const controller = makeController();

      const result = await controller.unmountProvider(org, 's3-1');

      expect(result.mounted).toBe(false);
    });
  });

  describe('migratePreview', () => {
    it('returns a preview of files to migrate', async () => {
      serviceMock.getMigrationPreview.mockResolvedValue({
        count: 5,
        totalBytes: 1024,
      });
      const controller = makeController();

      const result = await controller.migratePreview(org, 'src-id');

      expect(result.count).toBe(5);
      expect(result.totalBytes).toBe(1024);
    });
  });

  describe('migrateStorage', () => {
    it('performs a migration batch', async () => {
      serviceMock.migrate.mockResolvedValue({
        migrated: 10,
        failed: 0,
        errors: [],
        done: true,
      });
      const controller = makeController();

      const result = await controller.migrateStorage(org, 'src-id', 'tgt-id', {
        cursor: undefined,
        limit: 25,
      });

      expect(result.migrated).toBe(10);
      expect(result.done).toBe(true);
      expect(serviceMock.migrate).toHaveBeenCalledWith(
        'src-id',
        'tgt-id',
        'org-1',
        undefined,
        25
      );
    });

    it('clamps the limit to [1, 100]', async () => {
      serviceMock.migrate.mockResolvedValue({
        migrated: 0,
        failed: 0,
        errors: [],
        done: true,
      });
      const controller = makeController();

      await controller.migrateStorage(org, 'src', 'tgt', { limit: 999 });

      expect(serviceMock.migrate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        100
      );
    });
  });

  describe('getUsage', () => {
    it('returns storage usage for all providers', async () => {
      serviceMock.getUsage.mockResolvedValue({
        totalBytes: BigInt(1000),
        quotaBytes: BigInt(5000),
        providers: [
          { id: 'local-1', name: 'Local', usageBytes: BigInt(1000) },
        ],
      });
      const controller = makeController();

      const result = await controller.getUsage(org);

      expect(result.totalBytes).toBe(1000);
      expect(result.quotaBytes).toBe(5000);
      expect(result.providers).toHaveLength(1);
    });

    it('handles null usageBytes for cloud providers', async () => {
      serviceMock.getUsage.mockResolvedValue({
        totalBytes: BigInt(1000),
        quotaBytes: BigInt(5000),
        providers: [
          { id: 's3-1', name: 'S3', usageBytes: null },
        ],
      });
      const controller = makeController();

      const result = await controller.getUsage(org);

      expect(result.providers[0].usageBytes).toBeNull();
    });
  });

  describe('no setDefault route', () => {
    it('does not expose a setDefaultProvider handler', () => {
      const controller = makeController();

      expect(
        Object.getOwnPropertyNames(Object.getPrototypeOf(controller))
      ).not.toContain('setDefaultProvider');
    });

    it('does not expose a setDefault method on the service', () => {
      expect(serviceMock).not.toHaveProperty('setDefault');
    });
  });
});

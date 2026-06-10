import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageProviderType } from '@prisma/client';

const adapterMock = {
  getUsageBytes: vi.fn(),
  readFile: vi.fn(),
  writeBuffer: vi.fn(),
  removeFile: vi.fn(),
  testConnection: vi.fn(),
};

vi.mock(
  '@gitroom/nestjs-libraries/upload/adapters/adapter.factory',
  () => ({
    StorageAdapterFactory: {
      createFromConfig: vi.fn(() => adapterMock),
    },
  })
);

import { StorageAdapterFactory } from '@gitroom/nestjs-libraries/upload/adapters/adapter.factory';
import { StorageService } from './storage.service';

const encryption = {
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ''),
} as any;

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findByOrg: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMountedByOrg: vi.fn().mockResolvedValue([]),

    getOrgQuota: vi.fn(),
    countSourceMedia: vi.fn(),
    findSourceMediaPage: vi.fn(),
    updateMediaLocation: vi.fn(),
    findMountFolder: vi.fn(),
    createMountFolder: vi.fn(),
    removeOrDetachMountFolders: vi.fn(),
    ...overrides,
  } as any;
}

const localConfig = {
  id: 'local-1',
  organizationId: 'org-1',
  type: StorageProviderType.LOCAL,
  name: 'Local Storage',
  credentials: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StorageService — credential sanitization (#54)', () => {
  it('strips the credential blob from provider listings', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([
        { ...localConfig, credentials: 'enc:{"k":"v"}' },
      ]),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const result = await service.getProviderConfigs('org-1');

    expect(result[0]).not.toHaveProperty('credentials');
    expect(result[0]).toHaveProperty('id', 'local-1');
  });
});

describe('StorageService — quota enforcement (#57)', () => {
  it('throws 413 when the incoming write would exceed quota', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig]),
      getOrgQuota: vi.fn().mockResolvedValue(BigInt(150)),
    });
    adapterMock.getUsageBytes.mockResolvedValue(BigInt(100));
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    await expect(service.assertWithinQuota('org-1', 100)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('allows a write that stays within quota', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig]),
      getOrgQuota: vi.fn().mockResolvedValue(BigInt(150)),
    });
    adapterMock.getUsageBytes.mockResolvedValue(BigInt(100));
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    await expect(service.assertWithinQuota('org-1', 10)).resolves.toBeUndefined();
  });
});

describe('StorageService — migration verify-before-delete (#48/#51)', () => {
  const source = {
    id: 'src',
    organizationId: 'org-1',
    type: StorageProviderType.S3,
    name: 'S3',
    credentials: 'enc:{}',
  };
  const target = {
    id: 'tgt',
    organizationId: 'org-1',
    type: StorageProviderType.LOCAL,
    name: 'Local',
    credentials: null,
  };

  function repoForMigrate(page: any[]) {
    return makeRepo({
      findById: vi.fn().mockImplementation((id: string) =>
        Promise.resolve(id === 'src' ? source : target)
      ),
      findSourceMediaPage: vi.fn().mockResolvedValue(page),
    });
  }

  it('deletes the source only after the target is verified', async () => {
    const repo = repoForMigrate([
      { id: 'm1', name: 'a.png', path: 'p1', type: 'image', fileSize: 10 },
    ]);
    const auditRepo = { create: vi.fn() } as any;
    adapterMock.readFile
      .mockResolvedValueOnce(Buffer.alloc(10)) // source read
      .mockResolvedValueOnce(Buffer.alloc(10)); // target verify
    adapterMock.writeBuffer.mockResolvedValue('new-path');
    const service = new StorageService(repo, auditRepo, encryption);

    const res = await service.migrate('src', 'tgt', 'org-1');

    expect(res.migrated).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.done).toBe(true);
    expect(repo.updateMediaLocation).toHaveBeenCalledWith('m1', 'new-path', null);
    expect(adapterMock.removeFile).toHaveBeenCalledWith('p1');
  });

  it('keeps the source when target verification fails (size mismatch)', async () => {
    const repo = repoForMigrate([
      { id: 'm1', name: 'a.png', path: 'p1', type: 'image', fileSize: 10 },
    ]);
    adapterMock.readFile
      .mockResolvedValueOnce(Buffer.alloc(10)) // source read
      .mockResolvedValueOnce(Buffer.alloc(5)); // target verify — corrupt
    adapterMock.writeBuffer.mockResolvedValue('new-path');
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const res = await service.migrate('src', 'tgt', 'org-1');

    expect(res.migrated).toBe(0);
    expect(res.failed).toBe(1);
    expect(adapterMock.removeFile).not.toHaveBeenCalled();
    expect(repo.updateMediaLocation).not.toHaveBeenCalled();
  });

  it('reports a continuation cursor when a full page remains', async () => {
    const repo = repoForMigrate([
      { id: 'm1', name: 'a.png', path: 'p1', type: 'image', fileSize: 10 },
    ]);
    adapterMock.readFile
      .mockResolvedValueOnce(Buffer.alloc(10))
      .mockResolvedValueOnce(Buffer.alloc(10));
    adapterMock.writeBuffer.mockResolvedValue('new-path');
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const res = await service.migrate('src', 'tgt', 'org-1', undefined, 1);

    expect(res.done).toBe(false);
    expect(res.nextCursor).toBe('m1');
  });

  it('rejects migrating a provider onto itself', async () => {
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(makeRepo(), auditRepo, encryption);
    await expect(service.migrate('x', 'x', 'org-1')).rejects.toThrow(
      'must be different'
    );
  });
});

describe('StorageService — quota status (#61)', () => {
  it('returns quota status with warning when at 80%+', async () => {
    const repo = makeRepo({
      getStorageUsedByOrg: vi.fn().mockResolvedValue(BigInt(4000000000)),
      getOrgQuota: vi.fn().mockResolvedValue(BigInt(5000000000)),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const status = await service.getQuotaStatus('org-1');

    expect(status.usedBytes).toBe(BigInt(4000000000));
    expect(status.percentUsed).toBe(80);
    expect(status.warning).toBe(true);
  });

  it('returns no warning when below 80%', async () => {
    const repo = makeRepo({
      getStorageUsedByOrg: vi.fn().mockResolvedValue(BigInt(2000000000)),
      getOrgQuota: vi.fn().mockResolvedValue(BigInt(5000000000)),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const status = await service.getQuotaStatus('org-1');

    expect(status.percentUsed).toBe(40);
    expect(status.warning).toBe(false);
  });
});

describe('StorageService — usage breakdown (#65)', () => {
  it('returns usage grouped by folder and provider', async () => {
    const repo = makeRepo({
      getUsageByFolder: vi
        .fn()
        .mockResolvedValue([
          { folderId: 'f1', folderName: 'Images', totalBytes: BigInt(1000) },
          { folderId: 'f2', folderName: 'Videos', totalBytes: BigInt(2000) },
        ]),
      getUsageByProvider: vi
        .fn()
        .mockResolvedValue([
          { providerId: 'local', providerName: 'Local', totalBytes: BigInt(2500) },
          { providerId: 's3-1', providerName: 'S3', totalBytes: BigInt(500) },
        ]),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const breakdown = await service.getUsageBreakdown('org-1');

    expect(breakdown.byFolder).toHaveLength(2);
    expect(breakdown.byProvider).toHaveLength(2);
    expect(breakdown.byFolder[0].folderName).toBe('Images');
  });
});

describe('StorageService — health tracking (#62)', () => {
  it('updates health on successful test', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'p1',
        organizationId: 'org-1',
        type: 'S3',
      }),
      updateHealthCheck: vi.fn(),
    });
    adapterMock.testConnection.mockResolvedValue({ ok: true });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const result = await service.testConnection('p1', 'org-1');

    expect(result.ok).toBe(true);
    expect(repo.updateHealthCheck).toHaveBeenCalledWith('p1', true, undefined);
  });

  it('updates error on failed test', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'p1',
        organizationId: 'org-1',
        type: 'S3',
      }),
      updateHealthCheck: vi.fn(),
    });
    adapterMock.testConnection.mockResolvedValue({
      ok: false,
      error: 'Access Denied',
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const result = await service.testConnection('p1', 'org-1');

    expect(result.ok).toBe(false);
    expect(repo.updateHealthCheck).toHaveBeenCalledWith('p1', false, 'Access Denied');
  });
});

describe('StorageService — getLocalAdapterForOrg', () => {
  it('creates the LOCAL row when none exists and returns a LocalAdapter', async () => {
    const repo = makeRepo({
      findByOrg: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([localConfig]),
      create: vi.fn().mockResolvedValue(localConfig),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const result = await service.getLocalAdapterForOrg('org-1');

    expect(repo.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      type: StorageProviderType.LOCAL,
      name: 'Local Storage',
    });
    expect(result).toBe(adapterMock);
  });

  it('returns a LocalAdapter even when a cloud provider is present', async () => {
    const s3Config = {
      id: 's3-1',
      organizationId: 'org-1',
      type: StorageProviderType.S3,
      name: 'S3',
      credentials: 'enc:{}',
    };
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig, s3Config]),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const result = await service.getLocalAdapterForOrg('org-1');

    expect(result).toBe(adapterMock);
    expect(StorageAdapterFactory.createFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-1', type: StorageProviderType.LOCAL })
    );
    expect(StorageAdapterFactory.createFromConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 's3-1' })
    );
  });

  it('org isolation — only returns LOCAL for the requested org', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig]),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    await service.getLocalAdapterForOrg('org-1');

    expect(repo.findByOrg).toHaveBeenCalledWith('org-1');
    expect(repo.findByOrg).not.toHaveBeenCalledWith('org-2');
  });

  it('builds adapter from the found LOCAL config row', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig]),
    });
    const auditRepo = { create: vi.fn() } as any;
    const service = new StorageService(repo, auditRepo, encryption);

    const result = await service.getLocalAdapterForOrg('org-1');

    expect(result).toBe(adapterMock);
    expect(StorageAdapterFactory.createFromConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'local-1',
        type: StorageProviderType.LOCAL,
        credentials: '{}',
      })
    );
  });
});

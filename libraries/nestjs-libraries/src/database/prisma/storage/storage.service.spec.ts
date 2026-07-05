import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageProviderType } from '@prisma/client';

const adapterMock = {
  getUsageBytes: vi.fn(),
  readFile: vi.fn(),
  writeBuffer: vi.fn(),
  removeFile: vi.fn(),
  testConnection: vi.fn(),
};

const resolveStorageMock = vi.fn(() => adapterMock);

vi.mock(
  '@gitroom/nestjs-libraries/providers/provider-resolution.service',
  () => ({
    ProviderResolutionService: class {
      resolveStorage = resolveStorageMock;
    },
  })
);

import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { StorageService } from './storage.service';
import type { AuditService } from '@gitroom/nestjs-libraries/database/prisma/audit/audit.service';

const encryption = {
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ''),
} as any;

function makeResolution(overrides: Record<string, any> = {}) {
  return {
    resolveStorage: vi.fn(() => adapterMock),
    latestActiveVersion: vi.fn().mockReturnValue('v1'),
    ...overrides,
  } as unknown as ProviderResolutionService;
}

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findByOrg: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    findByFingerprint: vi.fn().mockResolvedValue(null),
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
  version: 'v1',
  name: 'Local Storage',
  credentials: null,
  region: null,
  bucket: null,
  endpoint: null,
  publicUrl: null,
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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    await expect(service.assertWithinQuota('org-1', 10)).resolves.toBeUndefined();
  });
});

describe('StorageService — migration verify-before-delete (#48/#51)', () => {
  const source = {
    id: 'src',
    organizationId: 'org-1',
    type: StorageProviderType.S3,
    version: 'v1',
    name: 'S3',
    credentials: 'enc:{}',
    region: 'us-east-1',
    bucket: 'src-bucket',
    endpoint: null,
    publicUrl: null,
  };
  const target = {
    id: 'tgt',
    organizationId: 'org-1',
    type: StorageProviderType.LOCAL,
    version: 'v1',
    name: 'Local',
    credentials: null,
    region: null,
    bucket: null,
    endpoint: null,
    publicUrl: null,
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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    adapterMock.readFile
      .mockResolvedValueOnce(Buffer.alloc(10)) // source read
      .mockResolvedValueOnce(Buffer.alloc(10)); // target verify
    adapterMock.writeBuffer.mockResolvedValue('new-path');
    const service = new StorageService(repo, auditService, encryption, makeResolution());

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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    const res = await service.migrate('src', 'tgt', 'org-1', undefined, 1);

    expect(res.done).toBe(false);
    expect(res.nextCursor).toBe('m1');
  });

  it('rejects migrating a provider onto itself', async () => {
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(makeRepo(), auditService, encryption, makeResolution());
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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    const breakdown = await service.getUsageBreakdown('org-1');

    expect(breakdown.byFolder).toHaveLength(2);
    expect(breakdown.byProvider).toHaveLength(2);
    expect(breakdown.byFolder[0].folderName).toBe('Images');
  });
});

describe('StorageService — version pin-on-write', () => {
  it('pins kernel.latestActive version when creating a config', async () => {
    const repo = makeRepo({
      create: vi.fn().mockResolvedValue({ id: 's3-1', version: 'v2' }),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const resolution = makeResolution({
      latestActiveVersion: vi.fn().mockReturnValue('v2'),
    });
    const service = new StorageService(repo, auditService, encryption, resolution);

    await service.createConfig('org-1', {
      type: StorageProviderType.S3,
      name: 'My S3',
      credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
    });

    expect(resolution.latestActiveVersion).toHaveBeenCalledWith('storage', 's3');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v2' }),
    );
  });

  it('falls back to v1 when kernel has no active version', async () => {
    const repo = makeRepo({
      create: vi.fn().mockResolvedValue({ id: 's3-1', version: 'v1' }),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const resolution = makeResolution({
      latestActiveVersion: vi.fn().mockReturnValue(undefined),
    });
    const service = new StorageService(repo, auditService, encryption, resolution);

    await service.createConfig('org-1', {
      type: StorageProviderType.S3,
      name: 'My S3',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v1' }),
    );
  });

  it('uses explicit body.version when provided', async () => {
    const repo = makeRepo({
      create: vi.fn().mockResolvedValue({ id: 's3-1', version: 'v3' }),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const resolution = makeResolution();
    const service = new StorageService(repo, auditService, encryption, resolution);

    await service.createConfig('org-1', {
      type: StorageProviderType.S3,
      name: 'My S3',
      version: 'v3',
    });

    expect(resolution.latestActiveVersion).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v3' }),
    );
  });
});

describe('StorageService — updateConfig fingerprint recompute (3.5) + audit await (6.5)', () => {
  const s3Row = {
    id: 's3-1',
    organizationId: 'org-1',
    type: StorageProviderType.S3,
    version: 'v1',
    name: 'S3',
    credentials: 'enc:{}',
    region: 'us-east-1',
    bucket: 'b',
    endpoint: null,
    publicUrl: null,
    mounted: false,
  };

  it('recomputes accountFingerprint when credentials are rotated', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(s3Row),
      update: vi.fn().mockResolvedValue({ ...s3Row }),
    });
    const auditService = { create: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    await service.updateConfig(
      's3-1',
      'org-1',
      { credentials: { accessKeyId: 'rotated-key', secretAccessKey: 'x' } },
    );

    const updateArg = (repo.update as any).mock.calls[0][1];
    expect(updateArg).toHaveProperty('accountFingerprint');
    expect(typeof updateArg.accountFingerprint).toBe('string');
    expect(updateArg.accountFingerprint.length).toBeGreaterThan(0);
  });

  it('does not set accountFingerprint when credentials are not supplied', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(s3Row),
      update: vi.fn().mockResolvedValue({ ...s3Row }),
    });
    const auditService = { create: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    await service.updateConfig('s3-1', 'org-1', { name: 'Renamed' });

    const updateArg = (repo.update as any).mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('accountFingerprint');
  });

  it('awaits the audit write on update (6.5 — not a floating promise)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(s3Row),
      update: vi.fn().mockResolvedValue({ ...s3Row }),
    });
    let resolveAudit!: () => void;
    const auditGate = new Promise<void>((r) => (resolveAudit = r));
    const create = vi.fn().mockReturnValue(auditGate);
    const auditService = { create } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    let settled = false;
    const p = service.updateConfig('s3-1', 'org-1', { name: 'x' }).then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false); // still waiting on the audit write
    resolveAudit();
    await p;
    expect(settled).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

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
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    const result = await service.testConnection('p1', 'org-1');

    expect(result.ok).toBe(false);
    expect(repo.updateHealthCheck).toHaveBeenCalledWith('p1', false, 'Access Denied');
  });
});

describe('StorageService — getLocalAdapterForOrg', () => {
  it('synthesizes a virtual LOCAL adapter when no DB row exists and createIfMissing is false (default)', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const resolution = makeResolution();
    const service = new StorageService(repo, auditService, encryption, resolution);

    const result = await service.getLocalAdapterForOrg('org-1');

    expect(repo.create).not.toHaveBeenCalled();
    expect(resolution.resolveStorage).toHaveBeenCalledWith(
      'local',
      expect.objectContaining({ orgId: 'org-1' })
    );
    expect(result).toBe(adapterMock);
  });

  it('creates the LOCAL row when createIfMissing is true and none exists', async () => {
    const repo = makeRepo({
      findByOrg: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([localConfig]),
      create: vi.fn().mockResolvedValue(localConfig),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    const result = await service.getLocalAdapterForOrg('org-1', true);

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
      version: 'v1',
      name: 'S3',
      credentials: 'enc:{}',
      region: 'us-east-1',
      bucket: 'my-bucket',
      endpoint: null,
      publicUrl: null,
    };
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig, s3Config]),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const resolution = makeResolution();
    const service = new StorageService(repo, auditService, encryption, resolution);

    const result = await service.getLocalAdapterForOrg('org-1');

    expect(result).toBe(adapterMock);
    expect(resolution.resolveStorage).toHaveBeenCalledTimes(1);
    expect(resolution.resolveStorage).toHaveBeenCalledWith(
      'local',
      expect.objectContaining({ orgId: 'org-1' })
    );
  });

  it('org isolation — only returns LOCAL for the requested org', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig]),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const service = new StorageService(repo, auditService, encryption, makeResolution());

    await service.getLocalAdapterForOrg('org-1');

    expect(repo.findByOrg).toHaveBeenCalledWith('org-1');
    expect(repo.findByOrg).not.toHaveBeenCalledWith('org-2');
  });

  it('builds adapter from the found LOCAL config row', async () => {
    const repo = makeRepo({
      findByOrg: vi.fn().mockResolvedValue([localConfig]),
    });
    const auditService = { create: vi.fn() } as unknown as AuditService;
    const resolution = makeResolution();
    const service = new StorageService(repo, auditService, encryption, resolution);

    const result = await service.getLocalAdapterForOrg('org-1');

    expect(result).toBe(adapterMock);
    expect(resolution.resolveStorage).toHaveBeenCalledWith(
      'local',
      expect.objectContaining({
        version: 'v1',
        credentials: {},
        orgId: 'org-1',
        extras: expect.objectContaining({
          bucket: null,
          region: null,
          endpoint: null,
          publicUrl: null,
        }),
      })
    );
  });
});

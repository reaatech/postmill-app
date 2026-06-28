import { Injectable } from '@nestjs/common';
import { Prisma, StorageProviderType } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class StorageRepository {
  constructor(
    private _storage: PrismaRepository<'storageProviderConfig'>,
    private _folder: PrismaRepository<'fileFolder'>,
    private _file: PrismaRepository<'file'>,
    private _org: PrismaRepository<'organization'>
  ) {}

  findByOrg(orgId: string) {
    return this._storage.model.storageProviderConfig.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByFingerprint(orgId: string, fingerprint: string) {
    return this._storage.model.storageProviderConfig.findFirst({
      where: { organizationId: orgId, accountFingerprint: fingerprint },
    });
  }

  findById(id: string) {
    return this._storage.model.storageProviderConfig.findUnique({
      where: { id },
    });
  }

  create(data: {
    organizationId: string;
    type: StorageProviderType;
    name: string;
    credentials?: string;
    region?: string;
    bucket?: string;
    endpoint?: string;
    publicUrl?: string;
    quotaBytes?: bigint;
    accountFingerprint?: string;
    version?: string;
  }) {
    return this._storage.model.storageProviderConfig.create({
      data: { ...data, version: data.version ?? 'v1' },
    });
  }

  update(
    id: string,
    data: {
      name?: string;
      credentials?: string;
      region?: string;
      bucket?: string;
      endpoint?: string;
      publicUrl?: string;
      quotaBytes?: bigint;
      mounted?: boolean;
    }
  ) {
    return this._storage.model.storageProviderConfig.update({
      where: { id },
      data,
    });
  }

  delete(id: string) {
    return this._storage.model.storageProviderConfig.delete({
      where: { id },
    });
  }

  findMountedByOrg(orgId: string) {
    return this._storage.model.storageProviderConfig.findMany({
      where: { organizationId: orgId, mounted: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  countByOrg(orgId: string) {
    return this._storage.model.storageProviderConfig.count({
      where: { organizationId: orgId },
    });
  }

  // ── Org quota (#57) ──
  async getOrgQuota(orgId: string): Promise<bigint> {
    const org = await this._org.model.organization.findUnique({
      where: { id: orgId },
      select: { localStorageQuotaBytes: true },
    });
    if (org?.localStorageQuotaBytes) return org.localStorageQuotaBytes;

    const envGb = parseInt(process.env.LOCAL_STORAGE_QUOTA_GB || '5', 10);
    return BigInt(envGb) * BigInt(1024 * 1024 * 1024);
  }

  async setOrgQuota(orgId: string, quotaBytes: bigint): Promise<void> {
    await this._org.model.organization.update({
      where: { id: orgId },
      data: { localStorageQuotaBytes: quotaBytes },
    });
  }

  // ── Migration source-media resolution (#48/#50) ──
  // For a LOCAL source, "owned" media is everything not pinned to a cloud-mounted
  // folder (root files + files in folders with no storageProviderId). For a cloud
  // source, it is media in folders mapped to that provider.
  #sourceMediaWhere(
    orgId: string,
    source: { id: string; type: StorageProviderType }
  ): Prisma.FileWhereInput {
    if (source.type === StorageProviderType.LOCAL) {
      return {
        organizationId: orgId,
        deletedAt: null,
        OR: [{ folderId: null }, { folder: { storageProviderId: null } }],
      };
    }
    return {
      organizationId: orgId,
      deletedAt: null,
      folder: { storageProviderId: source.id },
    };
  }

  async countSourceMedia(
    orgId: string,
    source: { id: string; type: StorageProviderType }
  ): Promise<{ count: number; totalBytes: bigint }> {
    const where = this.#sourceMediaWhere(orgId, source);
    const [count, agg] = await Promise.all([
      this._file.model.file.count({ where }),
      this._file.model.file.aggregate({ where, _sum: { fileSize: true } }),
    ]);
    return { count, totalBytes: BigInt(agg._sum.fileSize ?? 0) };
  }

  findSourceMediaPage(
    orgId: string,
    source: { id: string; type: StorageProviderType },
    cursor: string | undefined,
    limit: number
  ) {
    const where = this.#sourceMediaWhere(orgId, source);
    return this._file.model.file.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, name: true, path: true, type: true, fileSize: true },
    });
  }

  updateMediaLocation(id: string, path: string, folderId: string | null) {
    return this._file.model.file.update({
      where: { id },
      data: { path, folderId },
    });
  }

  // ── Mount-folder lifecycle (#55) ──
  findMountFolder(orgId: string, providerId: string) {
    return this._folder.model.fileFolder.findFirst({
      where: { organizationId: orgId, storageProviderId: providerId },
    });
  }

  createMountFolder(orgId: string, providerId: string, name: string) {
    return this._folder.model.fileFolder.create({
      data: { organizationId: orgId, name, storageProviderId: providerId },
    });
  }

  async removeOrDetachMountFolders(providerId: string) {
    const folders = await this._folder.model.fileFolder.findMany({
      where: { storageProviderId: providerId },
      include: { _count: { select: { files: true, children: true } } },
    });
    for (const folder of folders) {
      if (folder._count.files === 0 && folder._count.children === 0) {
        await this._folder.model.fileFolder.delete({ where: { id: folder.id } });
      } else {
        await this._folder.model.fileFolder.update({
          where: { id: folder.id },
          data: { storageProviderId: null },
        });
      }
    }
  }

  async getStorageUsedByOrg(orgId: string): Promise<bigint> {
    const result = await this._file.model.file.aggregate({
      where: { organizationId: orgId },
      _sum: { fileSize: true },
    });
    return BigInt(result._sum?.fileSize ?? 0);
  }

  async getUsageByFolder(
    orgId: string
  ): Promise<Array<{ folderId: string; folderName: string; totalBytes: bigint }>> {
    const result = await this._file.model.file.groupBy({
      by: ['folderId'],
      where: { organizationId: orgId },
      _sum: { fileSize: true },
    });
    const withNames = await Promise.all(
      result.map(async (row) => {
        const folder = row.folderId
          ? await this._folder.model.fileFolder.findUnique({ where: { id: row.folderId } })
          : null;
        return {
          folderId: row.folderId || 'unfoldered',
          folderName: folder?.name || 'Unfoldered',
          totalBytes: BigInt(row._sum?.fileSize ?? 0),
        };
      })
    );
    return withNames.sort((a, b) => (b.totalBytes > a.totalBytes ? 1 : -1));
  }

  async getUsageByProvider(
    orgId: string
  ): Promise<Array<{ providerId: string; providerName: string; totalBytes: bigint }>> {
    const result = await this._file.model.file.groupBy({
      by: ['folderId'],
      where: { organizationId: orgId },
      _sum: { fileSize: true },
    });
    const byProvider = new Map<string, bigint>();
    for (const row of result) {
      const folder = row.folderId
        ? await this._folder.model.fileFolder.findUnique({ where: { id: row.folderId } })
        : null;
      const providerId = folder?.storageProviderId || 'local';
      const currentBytes = byProvider.get(providerId) || BigInt(0);
      byProvider.set(providerId, currentBytes + BigInt(row._sum?.fileSize ?? 0));
    }
    const providers = await this._storage.model.storageProviderConfig.findMany({
      where: { organizationId: orgId },
    });
    return Array.from(byProvider.entries())
      .map(([providerId, totalBytes]) => {
        const provider = providers.find((p) => p.id === providerId);
        return {
          providerId,
          providerName: provider?.name || 'Unknown',
          totalBytes,
        };
      })
      .sort((a, b) => (b.totalBytes > a.totalBytes ? 1 : -1));
  }

  async updateHealthCheck(
    id: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    await this._storage.model.storageProviderConfig.update({
      where: { id },
      data: success
        ? { lastHealthCheck: new Date(), lastHealthError: null }
        : { lastHealthError: error },
    });
  }

  setDefaultFolder(providerId: string, folderId: string | null) {
    return this._storage.model.storageProviderConfig.update({
      where: { id: providerId },
      data: { defaultFolderId: folderId },
    });
  }

  getProviderForFolder(folderId: string) {
    return this._folder.model.fileFolder.findUnique({
      where: { id: folderId },
      select: { storageProviderId: true },
    });
  }

  // Ancestor-aware folder lookup: walks parentId chain to find the mount-root
  // folder carrying storageProviderId. Returns minimal shape for the walk.
  findFolderWithProvider(id: string) {
    return this._folder.model.fileFolder.findUnique({
      where: { id },
      select: { id: true, parentId: true, storageProviderId: true, organizationId: true },
    });
  }
}

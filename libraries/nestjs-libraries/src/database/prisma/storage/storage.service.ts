import { HttpException, Injectable, Logger } from '@nestjs/common';
import { StorageProviderType } from '@prisma/client';
import { StorageRepository } from './storage.repository';
import { AuditRepository } from '@gitroom/nestjs-libraries/database/prisma/audit/audit.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { StorageAdapterFactory } from '@gitroom/nestjs-libraries/upload/adapters/adapter.factory';
import { IStorageAdapter } from '@gitroom/nestjs-libraries/upload/upload.interface';

type StorageConfigRow = {
  id: string;
  organizationId: string;
  type: StorageProviderType;
  name: string;
  credentials: string | null;
  region: string | null;
  bucket: string | null;
  endpoint: string | null;
  publicUrl: string | null;
  mounted: boolean;
  isDefault: boolean;
  quotaBytes: bigint | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StorageService {
  private readonly _logger = new Logger(StorageService.name);

  constructor(
    private _storageRepository: StorageRepository,
    private _auditRepository: AuditRepository,
    private _encryptionService: EncryptionService
  ) {}

  // Strip the (encrypted) credential blob from anything returned to a client (#54).
  #sanitize<T extends { credentials?: string | null }>(config: T) {
    if (!config) return config;
    const { credentials, ...rest } = config as any;
    return rest;
  }

  async #audit(
    action: string,
    orgId: string,
    config: { id?: string; type?: StorageProviderType; name?: string },
    userId?: string
  ) {
    // Persist to DB: no secrets in details (#59, DB-backed audit)
    await this._auditRepository.create({
      organizationId: orgId,
      userId,
      action: `storage.${action}`,
      entity: 'storage_provider',
      entityId: config.id,
      entityName: config.name,
      details: config.type ? JSON.stringify({ type: config.type }) : undefined,
    });
    // Also log for immediate visibility
    this._logger.log(
      `storage.${action} org=${orgId} user=${userId || 'n/a'} ` +
        `provider=${config.id || 'n/a'} type=${config.type || 'n/a'}`
    );
  }

  async #getOrgScopedConfig(id: string, orgId: string): Promise<StorageConfigRow> {
    const config = await this._storageRepository.findById(id);
    if (!config || config.organizationId !== orgId) {
      throw new Error('Storage config not found');
    }
    return config as StorageConfigRow;
  }

  #buildAdapter(config: StorageConfigRow): IStorageAdapter {
    const decrypted = config.credentials
      ? this._encryptionService.decrypt(config.credentials)
      : '{}';
    return StorageAdapterFactory.createFromConfig({
      ...config,
      credentials: decrypted,
    } as any);
  }

  async getProviderConfigs(orgId: string) {
    await this.ensureLocalProvider(orgId);
    const configs = await this._storageRepository.findByOrg(orgId);
    return configs.map((c) => this.#sanitize(c));
  }

  getMountedConfigs(orgId: string) {
    return this._storageRepository.findMountedByOrg(orgId);
  }

  async createConfig(
    orgId: string,
    data: {
      type: StorageProviderType;
      name: string;
      credentials?: Record<string, string>;
      region?: string;
      bucket?: string;
      endpoint?: string;
      publicUrl?: string;
      quotaBytes?: bigint;
    },
    userId?: string
  ) {
    const encrypted = data.credentials
      ? this._encryptionService.encrypt(JSON.stringify(data.credentials))
      : undefined;

    const created = await this._storageRepository.create({
      organizationId: orgId,
      type: data.type,
      name: data.name,
      credentials: encrypted,
      region: data.region,
      bucket: data.bucket,
      endpoint: data.endpoint,
      publicUrl: data.publicUrl,
      quotaBytes: data.quotaBytes,
    });

    await this.#audit('create', orgId, created, userId);
    return this.#sanitize(created);
  }

  async updateConfig(
    id: string,
    orgId: string,
    data: {
      name?: string;
      credentials?: Record<string, string>;
      region?: string;
      bucket?: string;
      endpoint?: string;
      publicUrl?: string;
      quotaBytes?: bigint;
    },
    userId?: string
  ) {
    await this.#getOrgScopedConfig(id, orgId);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.credentials !== undefined) {
      updateData.credentials = this._encryptionService.encrypt(
        JSON.stringify(data.credentials)
      );
    }
    if (data.region !== undefined) updateData.region = data.region;
    if (data.bucket !== undefined) updateData.bucket = data.bucket;
    if (data.endpoint !== undefined) updateData.endpoint = data.endpoint;
    if (data.publicUrl !== undefined) updateData.publicUrl = data.publicUrl;
    if (data.quotaBytes !== undefined) updateData.quotaBytes = data.quotaBytes;

    const updated = await this._storageRepository.update(id, updateData);
    this.#audit('update', orgId, updated, userId);
    return this.#sanitize(updated);
  }

  async ensureLocalProvider(orgId: string) {
    const existing = await this._storageRepository.findByOrg(orgId);
    if (existing.some((c) => c.type === StorageProviderType.LOCAL)) return;

    await this._storageRepository.create({
      organizationId: orgId,
      type: StorageProviderType.LOCAL,
      name: 'Local Storage',
    });
  }

  async deleteConfig(id: string, orgId: string, userId?: string) {
    const config = await this.#getOrgScopedConfig(id, orgId);
    if (config.type === StorageProviderType.LOCAL) {
      throw new Error('Cannot delete the local storage provider.');
    }
    if (config.mounted) {
      throw new Error('Cannot delete a mounted storage provider. Unmount first.');
    }
    await this._storageRepository.clearDefaultIfMatches(orgId, id);
    const deleted = await this._storageRepository.delete(id);
    this.#audit('delete', orgId, config, userId);
    return deleted;
  }

  async setDefault(id: string, orgId: string, userId?: string) {
    await this.#getOrgScopedConfig(id, orgId);
    const updated = await this._storageRepository.setDefault(orgId, id);
    this.#audit('set-default', orgId, updated, userId);
    return this.#sanitize(updated);
  }

  async testConnection(
    id: string,
    orgId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const config = await this.#getOrgScopedConfig(id, orgId);
    const result = await this.#buildAdapter(config).testConnection();
    // Track health (#62)
    await this._storageRepository.updateHealthCheck(id, result.ok, result.error);
    return result;
  }

  async getAdapter(id: string, orgId: string): Promise<IStorageAdapter> {
    const config = await this.#getOrgScopedConfig(id, orgId);
    return this.#buildAdapter(config);
  }

  // Deterministic upload routing (#56): default provider → oldest mounted → local/first.
  async getAdapterForOrg(orgId: string): Promise<IStorageAdapter | null> {
    const preferred =
      (await this._storageRepository.findDefault(orgId)) ||
      (await this._storageRepository.findMountedByOrg(orgId))[0];
    if (preferred) {
      return this.#buildAdapter(preferred as StorageConfigRow);
    }

    const configs = await this._storageRepository.findByOrg(orgId);
    if (configs.length > 0) {
      const local = configs.find((c) => c.type === StorageProviderType.LOCAL);
      return this.#buildAdapter((local || configs[0]) as StorageConfigRow);
    }

    return null;
  }

  // Enforce per-org local storage quota before a local write (#57).
  async assertWithinQuota(orgId: string, incomingBytes: number) {
    const configs = await this._storageRepository.findByOrg(orgId);
    const local = configs.find((c) => c.type === StorageProviderType.LOCAL);
    if (!local) return;

    let usage: bigint | null = null;
    try {
      usage = await this.#buildAdapter(local as StorageConfigRow).getUsageBytes();
    } catch {
      usage = null;
    }
    if (usage === null) return;

    const quota = await this._storageRepository.getOrgQuota(orgId);
    if (usage + BigInt(Math.max(0, Math.floor(incomingBytes))) > quota) {
      throw new HttpException(
        'Storage quota exceeded. Free up space or increase your quota.',
        413
      );
    }
  }

  async getMigrationPreview(
    sourceId: string,
    orgId: string
  ): Promise<{ count: number; totalBytes: number }> {
    const source = await this.#getOrgScopedConfig(sourceId, orgId);
    const { count, totalBytes } = await this._storageRepository.countSourceMedia(
      orgId,
      source
    );
    return { count, totalBytes: Number(totalBytes) };
  }

  // Batched, verify-before-delete cross-provider migration (#48–#52).
  async migrate(
    sourceId: string,
    targetId: string,
    orgId: string,
    cursor?: string,
    limit = 25
  ): Promise<{
    migrated: number;
    failed: number;
    errors: string[];
    nextCursor?: string;
    done: boolean;
  }> {
    if (sourceId === targetId) {
      throw new Error('Source and target providers must be different.');
    }

    const source = await this.#getOrgScopedConfig(sourceId, orgId);
    const target = await this.#getOrgScopedConfig(targetId, orgId);

    const sourceAdapter = this.#buildAdapter(source);
    const targetAdapter = this.#buildAdapter(target);

    // Where migrated files land in the folder tree (#52).
    let targetFolderId: string | null = null;
    if (target.type !== StorageProviderType.LOCAL) {
      const existing = await this._storageRepository.findMountFolder(
        orgId,
        targetId
      );
      targetFolderId =
        existing?.id ||
        (await this._storageRepository.createMountFolder(
          orgId,
          targetId,
          target.name
        )).id;
    }

    const page = await this._storageRepository.findSourceMediaPage(
      orgId,
      source,
      cursor,
      limit
    );

    let migrated = 0;
    let failed = 0;
    const errors: string[] = [];
    let lastId: string | undefined;

    for (const media of page) {
      lastId = media.id;
      try {
        const buffer = await sourceAdapter.readFile(media.path);
        const newPath = await targetAdapter.writeBuffer(buffer, media.type);

        // Verify the target object is complete before destroying the source (#51).
        const written = await targetAdapter.readFile(newPath);
        if (written.length !== buffer.length) {
          throw new Error('Target verification failed (size mismatch)');
        }

        await this._storageRepository.updateMediaLocation(
          media.id,
          newPath,
          targetFolderId
        );
        await sourceAdapter.removeFile(media.path);
        migrated++;
      } catch (err: any) {
        failed++;
        errors.push(`${media.name || media.id}: ${err.message}`);
      }
    }

    const done = page.length < limit;
    this.#audit('migrate', orgId, source);
    return {
      migrated,
      failed,
      errors,
      nextCursor: done ? undefined : lastId,
      done,
    };
  }

  async mount(id: string, orgId: string) {
    const config = await this.#getOrgScopedConfig(id, orgId);

    await this._storageRepository.update(id, { mounted: true });

    // Reuse the existing root folder if this provider was mounted before (#55).
    const existing = await this._storageRepository.findMountFolder(orgId, id);
    if (!existing) {
      const folderName = config.name || config.type.toLowerCase();
      await this._storageRepository.createMountFolder(orgId, id, folderName);
    }

    return this.#sanitize(await this.#getOrgScopedConfig(id, orgId));
  }

  async unmount(id: string, orgId: string) {
    await this.#getOrgScopedConfig(id, orgId);

    // Delete the auto-created root folder when empty, else detach it (#55).
    await this._storageRepository.removeOrDetachMountFolders(id);

    const updated = await this._storageRepository.update(id, { mounted: false });
    return this.#sanitize(updated);
  }

  async getUsage(orgId: string): Promise<{
    totalBytes: bigint;
    quotaBytes: bigint;
    providers: Array<{ id: string; name: string; usageBytes: bigint | null }>;
  }> {
    const configs = await this._storageRepository.findByOrg(orgId);
    let totalBytes = BigInt(0);
    const providerUsage: Array<{
      id: string;
      name: string;
      usageBytes: bigint | null;
    }> = [];

    for (const config of configs) {
      let usage: bigint | null = null;
      try {
        usage = await this.#buildAdapter(config as StorageConfigRow).getUsageBytes();
      } catch {
        usage = null;
      }
      providerUsage.push({ id: config.id, name: config.name, usageBytes: usage });
      if (usage !== null) {
        totalBytes += usage;
      }
    }

    const quotaBytes = await this._storageRepository.getOrgQuota(orgId);

    return {
      totalBytes,
      quotaBytes,
      providers: providerUsage,
    };
  }

  async getQuotaStatus(orgId: string): Promise<{
    usedBytes: bigint;
    quotaBytes: bigint;
    percentUsed: number;
    warning: boolean;
  }> {
    const usedBytes = await this._storageRepository.getStorageUsedByOrg(orgId);
    const quotaBytes = await this._storageRepository.getOrgQuota(orgId);
    const percentUsed =
      quotaBytes > BigInt(0)
        ? Number((usedBytes * BigInt(100)) / quotaBytes)
        : 0;
    return {
      usedBytes,
      quotaBytes,
      percentUsed,
      warning: percentUsed >= 80,
    };
  }

  async getUsageBreakdown(orgId: string): Promise<{
    byFolder: Array<{ folderId: string; folderName: string; totalBytes: bigint }>;
    byProvider: Array<{ providerId: string; providerName: string; totalBytes: bigint }>;
  }> {
    const byFolder = await this._storageRepository.getUsageByFolder(orgId);
    const byProvider = await this._storageRepository.getUsageByProvider(orgId);
    return { byFolder, byProvider };
  }

  async getAdapterForFolder(folderId: string, orgId: string): Promise<IStorageAdapter | null> {
    // Check if folder has a provider-specific default
    const folderInfo = await this._storageRepository.getProviderForFolder(folderId);
    if (folderInfo?.storageProviderId) {
      const config = await this._storageRepository.findById(folderInfo.storageProviderId);
      if (config && config.organizationId === orgId) {
        return this.#buildAdapter(config as StorageConfigRow);
      }
    }
    // Fall back to org default
    return this.getAdapterForOrg(orgId);
  }

  async setDefaultFolderForProvider(
    providerId: string,
    folderId: string | null,
    orgId: string,
    userId?: string
  ) {
    const config = await this._storageRepository.findById(providerId);
    if (!config || config.organizationId !== orgId) {
      throw new HttpException('Provider not found', 404);
    }
    const updated = await this._storageRepository.setDefaultFolder(providerId, folderId);
    await this.#audit('set-default-folder', orgId, config, userId);
    return this.#sanitize(updated);
  }
}

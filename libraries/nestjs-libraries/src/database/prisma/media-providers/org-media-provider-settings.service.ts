import { Injectable, Logger, Optional } from '@nestjs/common';
import { OrgMediaProviderSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { MediaProviderRegistry } from '@gitroom/nestjs-libraries/media/media-provider.registry';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { ProviderCredentialLinkService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/provider-credential-link.service';

const STANDARD_FOLDERS = ['documents', 'audio', 'images', 'video', 'other'];

export interface MediaProviderExtraConfig {
  operations?: string[];
  c2paAvailable?: boolean;
}

export interface EnabledMediaProvider {
  identifier: string;
  storageProviderId: string | null;
  storageRootFolderId: string | null;
  extraConfig: MediaProviderExtraConfig;
}

@Injectable()
export class OrgMediaProviderSettingsService {
  private readonly _logger = new Logger(OrgMediaProviderSettingsService.name);

  constructor(
    private _repository: OrgMediaProviderSettingsRepository,
    private _encryption: EncryptionService,
    private _registry: MediaProviderRegistry,
    private _mediaRepository: MediaRepository,
    @Optional() private _credentialLink?: ProviderCredentialLinkService,
  ) {}

  async getProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    const adapters = this._registry.getAll();
    return adapters.map((adapter) => {
      const dbConfig = configs.find((c) => c.identifier === adapter.identifier);
      return {
        identifier: adapter.identifier,
        name: adapter.name,
        capabilities: adapter.capabilities,
        enabled: dbConfig?.enabled || false,
        isConfigured: !!dbConfig?.credentials,
        storageProviderId: dbConfig?.storageProviderId || null,
        storageRootFolderId: dbConfig?.storageRootFolderId || null,
        createdAt: dbConfig?.createdAt || null,
        updatedAt: dbConfig?.updatedAt || null,
      };
    });
  }

  async getActiveProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    return configs
      .filter((c) => c.enabled && c.credentials)
      .map((c) => ({
        identifier: c.identifier,
        storageProviderId: c.storageProviderId,
        storageRootFolderId: c.storageRootFolderId,
      }));
  }

  // Org-enabled, credentialed providers with their parsed extraConfig (no secrets) —
  // the capability-driven resolution + the 4F summary read this.
  async getEnabledProviders(orgId: string): Promise<EnabledMediaProvider[]> {
    const configs = await this._repository.getByOrg(orgId);
    return configs
      .filter((c) => c.enabled && c.credentials)
      .map((c) => ({
        identifier: c.identifier,
        storageProviderId: c.storageProviderId ?? null,
        storageRootFolderId: c.storageRootFolderId ?? null,
        extraConfig: this._parseExtraConfig(c.extraConfig),
      }));
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      enabled?: boolean;
      credentials?: Record<string, string>;
      storageProviderId?: string;
      storageRootFolderId?: string;
    },
  ) {
    const encryptedCredentials = data.credentials
      ? this._encryption.encrypt(JSON.stringify(data.credentials))
      : undefined;

    const result = await this._repository.upsert(orgId, identifier, {
      enabled: data.enabled,
      credentials: encryptedCredentials,
      storageProviderId: data.storageProviderId,
      storageRootFolderId: data.storageRootFolderId,
    });

    if (data.storageProviderId && data.storageRootFolderId) {
      await this.ensureStandardFolders(orgId, data.storageRootFolderId);
    }

    // §11.4 auto-config: OpenAI/MiniMax media credentials live-link to the AI surface.
    if (data.credentials && this._credentialLink) {
      await this._credentialLink.syncFromMediaProvider(orgId, identifier, data.credentials);
    }

    return result;
  }

  async delete(orgId: string, identifier: string) {
    return this._repository.delete(orgId, identifier);
  }

  /** Identifiers enabled in at least one org — for the platform-admin overview. */
  async getEnabledIdentifiers(): Promise<string[]> {
    return this._repository.getEnabledIdentifiers();
  }

  async isProviderEnabledForOperation(orgId: string, identifier: string, operation: string): Promise<boolean> {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config || !config.enabled) return false;
    if (!config.extraConfig) return true;
    const ops = this._parseExtraConfig(config.extraConfig).operations;
    if (!ops || ops.length === 0) return true;
    return ops.includes(operation);
  }

  async getConfigForProvider(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) return null;
    const credentials = this._decryptCredentials(config.credentials);
    return { credentials, storageProviderId: config.storageProviderId, storageRootFolderId: config.storageRootFolderId };
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Media provider "${identifier}" not configured for this organization`);
    }

    const adapter = this._registry.get(identifier);
    if (!adapter) {
      throw new Error(`Unknown media provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    try {
      await adapter.generateImage('test', { credentials: decrypted });
      return { ok: true, message: 'Connection successful' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  private _parseExtraConfig(extraConfig: string | null | undefined): MediaProviderExtraConfig {
    if (!extraConfig) return {};
    try {
      const parsed = JSON.parse(extraConfig) as MediaProviderExtraConfig;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private _decryptCredentials(encrypted: string | null): Record<string, string> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this._encryption.decrypt(encrypted));
    } catch {
      this._logger.warn('Failed to decrypt media provider credentials');
      return {};
    }
  }

  // Ensure the provider root's typed 5-folder tree (§11.5). Public so the async-job
  // completion path can lazily (re)create it before landing an artifact.
  async ensureStandardFolders(orgId: string, rootFolderId: string) {
    const existing = await this._mediaRepository.findFoldersByParent(orgId, rootFolderId);
    const existingNames = new Set(existing.map((f) => f.name.toLowerCase()));

    for (const folderName of STANDARD_FOLDERS) {
      if (!existingNames.has(folderName)) {
        try {
          await this._mediaRepository.createFolder(orgId, {
            name: folderName,
            parentId: rootFolderId,
          });
        } catch (err) {
          this._logger.warn(`Failed to create standard folder "${folderName}": ${(err as Error).message}`);
        }
      }
    }
  }

  // Resolve (creating on demand) the typed folder under a provider root.
  async getStandardFolderId(orgId: string, rootFolderId: string, folderName: string): Promise<string | null> {
    if (!STANDARD_FOLDERS.includes(folderName)) return null;
    await this.ensureStandardFolders(orgId, rootFolderId);
    const folders = await this._mediaRepository.findFoldersByParent(orgId, rootFolderId);
    const match = folders.find((f) => f.name.toLowerCase() === folderName);
    return match?.id ?? null;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { OrgContentPackSettingsRepository } from './org-content-pack-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import {
  CONTENT_PACK_IDENTIFIERS,
  CONTENT_PACK_REGISTRY,
  contentPackMeta,
  createContentPack,
} from '@gitroom/nestjs-libraries/media/stock/content-packs/content-pack.registry';

@Injectable()
export class OrgContentPackSettingsService {
  private readonly _logger = new Logger(OrgContentPackSettingsService.name);

  constructor(
    private _repository: OrgContentPackSettingsRepository,
    private _encryption: EncryptionService,
  ) {}

  async getProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    const pointer = await this._repository.getActivePointer(orgId);
    const activeIdentifier = pointer?.activeContentPackIdentifier || null;

    return CONTENT_PACK_IDENTIFIERS.map((identifier) => {
      const config = configs.find((c) => c.identifier === identifier);
      const meta = CONTENT_PACK_REGISTRY[identifier];
      return {
        identifier,
        name: meta.name,
        capabilities: meta.capabilities,
        isConfigured: !!config?.credentials,
        isActive: activeIdentifier === identifier,
        createdAt: config?.createdAt || null,
        updatedAt: config?.updatedAt || null,
      };
    });
  }

  async getActive(orgId: string) {
    const pointer = await this._repository.getActivePointer(orgId);
    const identifier = pointer?.activeContentPackIdentifier;
    if (!identifier) return null;

    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config || !config.credentials) return null;

    const credentials = this._decryptCredentials(config.credentials);
    return {
      identifier,
      credentials,
      extraConfig: (config.extraConfig as Record<string, any>) || {},
    };
  }

  async getActiveForCapability(orgId: string, capability: string) {
    const active = await this.getActive(orgId);
    if (!active) return null;
    const meta = contentPackMeta(active.identifier);
    if (!meta?.capabilities.includes(capability as any)) return null;
    return active;
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      credentials?: Record<string, string>;
      extraConfig?: Record<string, any>;
    }
  ) {
    const encryptedCredentials = data.credentials
      ? this._encryption.encrypt(JSON.stringify(data.credentials))
      : undefined;

    return this._repository.upsert(orgId, identifier, {
      credentials: encryptedCredentials,
      extraConfig: data.extraConfig,
    });
  }

  async setActive(orgId: string, identifier: string | null) {
    if (identifier) {
      const config = await this._repository.getByIdentifier(orgId, identifier);
      if (!config) {
        throw new Error(`Content pack "${identifier}" is not configured for this organization`);
      }
      const credentials = this._decryptCredentials(config.credentials);
      if (!credentials?.apiKey) {
        throw new Error(`Content pack "${identifier}" is missing credentials`);
      }
    }
    return this._repository.setActivePointer(orgId, identifier);
  }

  async delete(orgId: string, identifier: string) {
    const pointer = await this._repository.getActivePointer(orgId);
    if (pointer?.activeContentPackIdentifier === identifier) {
      await this._repository.setActivePointer(orgId, null);
    }
    return this._repository.delete(orgId, identifier);
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Content pack "${identifier}" is not configured for this organization`);
    }

    const credentials = this._decryptCredentials(config.credentials);
    if (!credentials?.apiKey) {
      throw new Error(`Content pack "${identifier}" is missing credentials`);
    }

    const pack = createContentPack(identifier, credentials);
    if (!pack) {
      throw new Error(`Unknown content pack provider "${identifier}"`);
    }
    const capability = contentPackMeta(identifier)?.capabilities[0] || 'photos';
    try {
      const result = await pack.search(capability, 'test', 1);
      return { ok: true, message: 'Connection successful', result };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  private _decryptCredentials(encrypted: string | null): Record<string, string> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this._encryption.decrypt(encrypted));
    } catch {
      this._logger.warn('Failed to decrypt content pack credentials');
      return {};
    }
  }
}

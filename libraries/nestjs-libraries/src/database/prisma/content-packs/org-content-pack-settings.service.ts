import { Injectable, Logger } from '@nestjs/common';
import { OrgContentPackSettingsRepository } from './org-content-pack-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import {
  parseQualified,
  qualify,
  DEFAULT_VERSION,
} from '@gitroom/provider-kernel';
import {
  CONTENT_PACK_IDENTIFIERS,
  CONTENT_PACK_REGISTRY,
  contentPackMeta,
} from '@gitroom/nestjs-libraries/media/stock/content-packs/content-pack.registry';

@Injectable()
export class OrgContentPackSettingsService {
  private readonly _logger = new Logger(OrgContentPackSettingsService.name);

  constructor(
    private _repository: OrgContentPackSettingsRepository,
    private _encryption: EncryptionService,
    private _resolution: ProviderResolutionService,
  ) {}

  async getProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    const pointer = await this._repository.getActivePointer(orgId);
    const active = this.#parseActivePointer(pointer?.activeContentPackIdentifier);

    return CONTENT_PACK_IDENTIFIERS.map((identifier) => {
      const config = configs.find((c) => c.identifier === identifier);
      const meta = CONTENT_PACK_REGISTRY[identifier];
      return {
        identifier,
        name: meta.name,
        capabilities: meta.capabilities,
        isConfigured: !!config?.credentials,
        isActive: active?.identifier === identifier,
        version: config?.version ?? 'v1',
        createdAt: config?.createdAt || null,
        updatedAt: config?.updatedAt || null,
      };
    });
  }

  async getActive(orgId: string) {
    const pointer = await this._repository.getActivePointer(orgId);
    const active = this.#parseActivePointer(pointer?.activeContentPackIdentifier);
    if (!active) return null;

    const config = await this._repository.getByIdentifier(
      orgId,
      active.identifier,
      active.version
    );
    if (!config || !config.credentials) return null;

    const credentials = this._decryptCredentials(config.credentials);
    return {
      identifier: active.identifier,
      version: active.version,
      credentials,
      extraConfig: (config.extraConfig as Record<string, any>) || {},
    };
  }

  async getActiveForCapability(orgId: string, capability: string) {
    const active = await this.getActive(orgId);
    if (!active) return null;

    const capabilityInstance = this._resolution.resolveContentPack(
      active.identifier,
      {
        version: active.version,
        credentials: active.credentials,
        orgId,
        extras: { extraConfig: active.extraConfig },
      }
    );
    if (!capabilityInstance.capabilities.includes(capability as any)) return null;
    return { capability: capabilityInstance, active };
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      credentials?: Record<string, string>;
      extraConfig?: Record<string, any>;
      version?: string;
    }
  ) {
    const encryptedCredentials = data.credentials
      ? this._encryption.encrypt(JSON.stringify(data.credentials))
      : undefined;

    const version =
      data.version ??
      this._resolution.latestActiveVersion('contentpack', identifier) ??
      DEFAULT_VERSION;

    return this._repository.upsert(orgId, identifier, {
      credentials: encryptedCredentials,
      extraConfig: data.extraConfig,
    }, version);
  }

  async setActive(orgId: string, identifier: string | null) {
    if (!identifier) {
      return this._repository.setActivePointer(orgId, null);
    }

    const { providerId, version: explicitVersion } = parseQualified(identifier);
    const version =
      explicitVersion ??
      this._resolution.latestActiveVersion('contentpack', providerId) ??
      DEFAULT_VERSION;

    const config = await this._repository.getByIdentifier(orgId, providerId, version);
    if (!config) {
      throw new Error(`Content pack "${providerId}@${version}" is not configured for this organization`);
    }
    const credentials = this._decryptCredentials(config.credentials);
    if (!credentials?.apiKey) {
      throw new Error(`Content pack "${providerId}@${version}" is missing credentials`);
    }

    return this._repository.setActivePointer(orgId, qualify(providerId, version));
  }

  async delete(orgId: string, identifier: string) {
    const pointer = await this._repository.getActivePointer(orgId);
    const active = this.#parseActivePointer(pointer?.activeContentPackIdentifier);
    if (active?.identifier === identifier) {
      await this._repository.setActivePointer(orgId, null);
    }
    return this._repository.delete(orgId, identifier);
  }

  async testConnection(orgId: string, identifier: string) {
    const { providerId, version } = parseQualified(identifier);
    const config = await this._repository.getByIdentifier(
      orgId,
      providerId,
      version ?? DEFAULT_VERSION
    );
    if (!config) {
      throw new Error(`Content pack "${identifier}" is not configured for this organization`);
    }

    const credentials = this._decryptCredentials(config.credentials);
    if (!credentials?.apiKey) {
      throw new Error(`Content pack "${identifier}" is missing credentials`);
    }

    const capability = this._resolution.resolveContentPack(providerId, {
      version: version ?? config.version ?? DEFAULT_VERSION,
      credentials,
      orgId,
    });
    const capabilityName = contentPackMeta(providerId)?.capabilities[0] || 'photos';
    try {
      const result = await capability.search(capabilityName, 'test', 1);
      return { ok: true, message: 'Connection successful', result };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  #parseActivePointer(
    raw: string | null | undefined
  ): { identifier: string; version: string } | null {
    if (!raw) return null;
    const { providerId, version } = parseQualified(raw);
    if (!providerId) return null;
    return { identifier: providerId, version: version ?? DEFAULT_VERSION };
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

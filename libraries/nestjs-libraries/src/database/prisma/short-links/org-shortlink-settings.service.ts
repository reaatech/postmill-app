import { Injectable, Logger } from '@nestjs/common';
import { OrgShortLinkSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { ShortLinkRegistry } from '@gitroom/nestjs-libraries/short-linking/short-link.registry';

@Injectable()
export class OrgShortLinkSettingsService {
  private readonly _logger = new Logger(OrgShortLinkSettingsService.name);

  constructor(
    private _repository: OrgShortLinkSettingsRepository,
    private _encryption: EncryptionService,
    private _registry: ShortLinkRegistry,
  ) {}

  async getProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    const adapters = this._registry.list();
    return adapters.map((adapter) => {
      const dbConfig = configs.find((c) => c.identifier === adapter.identifier);
      const isConfigured = this._isConfigured(adapter, dbConfig);
      return {
        identifier: adapter.identifier,
        name: adapter.name,
        capabilities: adapter.capabilities,
        credentialFields: adapter.credentialFields,
        authType: adapter.authType,
        defaultDomain: adapter.defaultDomain,
        setupNotes: adapter.setupNotes,
        enabled: dbConfig?.enabled || false,
        isActive: dbConfig?.isActive || false,
        isConfigured,
        customDomain: dbConfig?.customDomain || '',
        createdAt: dbConfig?.createdAt || null,
        updatedAt: dbConfig?.updatedAt || null,
      };
    });
  }

  async getActiveProvider(orgId: string) {
    const config = await this._repository.getActive(orgId);
    if (!config) return null;

    const adapter = this._registry.getAdapter(config.identifier);
    if (!adapter) return null;

    const decrypted = this._decryptCredentials(config.credentials);
    return {
      identifier: config.identifier,
      name: adapter.name,
      capabilities: adapter.capabilities,
      customDomain: config.customDomain,
      credentials: decrypted,
    };
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      enabled?: boolean;
      isActive?: boolean;
      credentials?: Record<string, string>;
      customDomain?: string;
      extraConfig?: Record<string, string>;
    },
  ) {
    const encryptedCredentials = data.credentials
      ? this._encryption.encrypt(JSON.stringify(data.credentials))
      : undefined;

    const encryptedExtraConfig = data.extraConfig
      ? this._encryption.encrypt(JSON.stringify(data.extraConfig))
      : undefined;

    return this._repository.upsert(orgId, identifier, {
      ...data,
      credentials: encryptedCredentials,
      extraConfig: encryptedExtraConfig,
      customDomain: data.customDomain,
    });
  }

  async setActive(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Short-link provider "${identifier}" not configured for this organization`);
    }

    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) {
      throw new Error(`Unknown short-link provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    if (!this._hasRequiredCredentials(adapter, decrypted)) {
      throw new Error(`Short-link provider "${identifier}" is not fully configured. Fill in all required credential fields first.`);
    }

    return this._repository.setActive(orgId, identifier);
  }

  async delete(orgId: string, identifier: string) {
    return this._repository.delete(orgId, identifier);
  }

  getLinksForOrg(orgId: string) {
    return this._repository.getLinksForOrg(orgId);
  }

  getAggregatedClicks(orgId: string, from: Date, to: Date) {
    return this._repository.getAggregatedClicks(orgId, from, to);
  }

  async getConfigForProvider(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) return null;
    const credentials = this._decryptCredentials(config.credentials);
    const extraConfig = this._parseExtraConfig(config.extraConfig);
    return { credentials, extraConfig };
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Short-link provider "${identifier}" not configured for this organization`);
    }

    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) {
      throw new Error(`Unknown short-link provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    return adapter.validateCredentials({
      orgId,
      credentials: decrypted,
      customDomain: config.customDomain || undefined,
      extraConfig: this._parseExtraConfig(config.extraConfig),
    });
  }

  private _decryptCredentials(encrypted: string | null): Record<string, string> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this._encryption.decrypt(encrypted));
    } catch {
      this._logger.warn('Failed to decrypt short-link provider credentials');
      return {};
    }
  }

  private _parseExtraConfig(extraConfig: string | null): Record<string, string> {
    if (!extraConfig) return {};
    try {
      const decrypted = this._encryption.decrypt(extraConfig);
      const parsed = JSON.parse(decrypted);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      // Fallback for legacy plaintext extraConfig
    }
    try {
      const parsed = JSON.parse(extraConfig);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private _isConfigured(
    adapter: { credentialFields: { key: string; required: boolean }[] },
    config: { credentials?: string | null; enabled?: boolean } | undefined,
  ): boolean {
    if (!config) return false;
    const decrypted = this._decryptCredentials(config.credentials);
    return this._hasRequiredCredentials(adapter, decrypted);
  }

  private _hasRequiredCredentials(
    adapter: { credentialFields: { key: string; required: boolean }[] },
    credentials: Record<string, string>,
  ): boolean {
    return adapter.credentialFields
      .filter((f) => f.required)
      .every((f) => {
        const value = credentials[f.key];
        return typeof value === 'string' && value.trim().length > 0;
      });
  }
}

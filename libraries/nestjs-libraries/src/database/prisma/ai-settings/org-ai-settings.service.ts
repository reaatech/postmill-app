import { Injectable, Logger, Optional } from '@nestjs/common';
import { OrgAiSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { AIProviderRegistry } from '@gitroom/nestjs-libraries/ai/ai-provider.registry';
import { ProviderCredentialLinkService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/provider-credential-link.service';

@Injectable()
export class OrgAiSettingsService {
  private readonly _logger = new Logger(OrgAiSettingsService.name);

  constructor(
    private _repository: OrgAiSettingsRepository,
    private _encryption: EncryptionService,
    private _registry: AIProviderRegistry,
    @Optional() private _credentialLink?: ProviderCredentialLinkService,
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
        type: adapter.type,
        capabilities: adapter.capabilities,
        credentialFields: adapter.credentialFields,
        enabled: dbConfig?.enabled || false,
        isActive: dbConfig?.isActive || false,
        isConfigured,
        defaultModel: dbConfig?.defaultModel || '',
        reasoningModel: dbConfig?.reasoningModel || '',
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
      type: adapter.type,
      capabilities: adapter.capabilities,
      defaultModel: config.defaultModel,
      reasoningModel: config.reasoningModel,
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
      defaultModel?: string;
      reasoningModel?: string;
      extraConfig?: Record<string, unknown> | string;
    },
  ) {
    const encryptedCredentials = data.credentials
      ? this._encryption.encrypt(JSON.stringify(data.credentials))
      : undefined;

    const extraConfig = data.extraConfig
      ? (typeof data.extraConfig === 'string' ? data.extraConfig : JSON.stringify(data.extraConfig))
      : undefined;

    const result = await this._repository.upsert(orgId, identifier, {
      ...data,
      credentials: encryptedCredentials,
      extraConfig,
    });

    // §11.4 auto-config: OpenAI/MiniMax AI credentials live-link to the media surface.
    if (data.credentials && this._credentialLink) {
      await this._credentialLink.syncFromAiProvider(orgId, identifier, data.credentials);
    }

    return result;
  }

  async setActive(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Provider "${identifier}" not configured for this organization`);
    }

    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) {
      throw new Error(`Unknown provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    if (!this._hasRequiredCredentials(adapter, decrypted)) {
      throw new Error(`Provider "${identifier}" is not fully configured. Fill in all required credential fields first.`);
    }

    return this._repository.setActive(orgId, identifier);
  }

  async delete(orgId: string, identifier: string) {
    return this._repository.delete(orgId, identifier);
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Provider "${identifier}" not configured for this organization`);
    }

    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) {
      throw new Error(`Unknown provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    return adapter.validateCredentials(decrypted);
  }

  async getSpend(
    orgId: string,
    scope?: string,
    limit = 100,
    offset = 0,
  ) {
    const clampedLimit = limit < 1 ? 1 : limit > 1000 ? 1000 : limit;
    const safeOffset = offset < 0 ? 0 : offset;
    return this._repository.getSpendLogs(orgId, scope, clampedLimit, safeOffset);
  }

  async getBudget(orgId: string) {
    return this._repository.getBudget(orgId);
  }

  async updateBudget(orgId: string, data: {
    monthlyCap?: number;
    dailyCap?: number;
    alertThresholdPct?: number;
    enabled?: boolean;
  }) {
    return this._repository.upsertBudget(orgId, data);
  }

  private _decryptCredentials(encrypted: string | null): Record<string, string> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this._encryption.decrypt(encrypted));
    } catch {
      this._logger.warn('Failed to decrypt provider credentials');
      return {};
    }
  }

  private _isConfigured(adapter: { credentialFields: { key: string; required: boolean }[] }, config: { credentials?: string | null; enabled?: boolean } | undefined): boolean {
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

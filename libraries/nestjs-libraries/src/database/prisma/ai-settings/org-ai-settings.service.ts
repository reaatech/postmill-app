import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { OrgAiSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { AIProviderAdapter } from '@gitroom/nestjs-libraries/ai/ai-provider.interface';
import { ProviderCredentialLinkService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/provider-credential-link.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { ProviderKernel, DEFAULT_VERSION } from '@gitroom/provider-kernel';

@Injectable()
export class OrgAiSettingsService {
  private readonly _logger = new Logger(OrgAiSettingsService.name);

  constructor(
    private _repository: OrgAiSettingsRepository,
    private _encryption: EncryptionService,
    private _resolution: ProviderResolutionService,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel,
    @Optional() private _credentialLink?: ProviderCredentialLinkService,
  ) {}

  // Resolve a single AI adapter through the ProviderKernel; null for an
  // unknown/unregistered provider (mirrors the old registry.getAdapter).
  private _resolveAdapter(identifier: string, version?: string): AIProviderAdapter | null {
    try {
      return this._resolution.resolveAI(identifier, version ? { version } : {});
    } catch {
      return null;
    }
  }

  // Enumerate the registered AI adapters (one per provider id, latest registered
  // manifest wins) — replaces the legacy in-memory registry enumeration.
  private _listAdapters(): AIProviderAdapter[] {
    const seen = new Set<string>();
    const adapters: AIProviderAdapter[] = [];
    for (const manifest of this._kernel.listManifests('ai')) {
      if (seen.has(manifest.providerId)) continue;
      seen.add(manifest.providerId);
      const adapter = this._resolveAdapter(manifest.providerId, manifest.version);
      if (adapter) adapters.push(adapter);
    }
    return adapters;
  }

  async getProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    const adapters = this._listAdapters();

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
        version: dbConfig?.version ?? 'v1',
        createdAt: dbConfig?.createdAt || null,
        updatedAt: dbConfig?.updatedAt || null,
      };
    });
  }

  async getActiveProvider(orgId: string) {
    const config = await this._repository.getActive(orgId);
    if (!config) return null;

    const adapter = this._resolveAdapter(config.identifier, config.version ?? 'v1');
    if (!adapter) return null;

    const decrypted = this._decryptCredentials(config.credentials);
    return {
      identifier: config.identifier,
      version: config.version ?? 'v1',
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
      version?: string;
    },
  ) {
    const { version: requestedVersion, ...payload } = data;
    const version = this._resolveVersion(identifier, requestedVersion);

    const encryptedCredentials = payload.credentials
      ? this._encryption.encrypt(JSON.stringify(payload.credentials))
      : undefined;

    const extraConfig = payload.extraConfig
      ? (typeof payload.extraConfig === 'string' ? payload.extraConfig : JSON.stringify(payload.extraConfig))
      : undefined;

    const result = await this._repository.upsert(orgId, identifier, {
      ...payload,
      credentials: encryptedCredentials,
      extraConfig,
    }, version);

    // §11.4 auto-config: OpenAI/MiniMax AI credentials live-link to the media surface.
    if (data.credentials && this._credentialLink) {
      await this._credentialLink.syncFromAiProvider(orgId, identifier, data.credentials);
    }

    return result;
  }

  async setActive(orgId: string, identifier: string, version?: string) {
    const resolvedVersion = this._resolveVersion(identifier, version);
    const config = await this._repository.getByIdentifier(orgId, identifier, resolvedVersion);
    if (!config) {
      throw new Error(`Provider "${identifier}" not configured for this organization`);
    }

    const adapter = this._resolveAdapter(identifier, resolvedVersion);
    if (!adapter) {
      throw new Error(`Unknown provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    if (!this._hasRequiredCredentials(adapter, decrypted)) {
      throw new Error(`Provider "${identifier}" is not fully configured. Fill in all required credential fields first.`);
    }

    return this._repository.setActive(orgId, identifier, resolvedVersion);
  }

  async delete(orgId: string, identifier: string) {
    return this._repository.delete(orgId, identifier);
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Provider "${identifier}" not configured for this organization`);
    }

    const adapter = this._resolveAdapter(identifier, config.version ?? 'v1');
    if (!adapter) {
      throw new Error(`Unknown provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    return adapter.validateCredentials(decrypted);
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

  private _resolveVersion(identifier: string, version?: string): string {
    if (version) return version;
    const latest = this._kernel.latestActive('ai', identifier);
    return latest?.manifest.version ?? DEFAULT_VERSION;
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

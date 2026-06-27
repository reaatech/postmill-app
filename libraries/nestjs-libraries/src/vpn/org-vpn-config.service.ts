import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { OrgVpnConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/vpn/org-vpn-config.repository';
import { VpnProviderRegistry } from './vpn-provider.registry';
import { VpnProviderAdapter } from './vpn-provider.interface';
import { VpnProviderCapabilities } from './vpn.types';

export interface VpnProviderListItem {
  identifier: string;
  name: string;
  enabled: boolean;
  isConfigured: boolean;
  capabilities: VpnProviderCapabilities;
  credentialFields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  setupNotes?: string;
}

@Injectable()
export class OrgVpnConfigService {
  private readonly _logger = new Logger(OrgVpnConfigService.name);

  constructor(
    private _repository: OrgVpnConfigRepository,
    private _encryption: EncryptionService,
    private _registry: VpnProviderRegistry,
  ) {}

  getProviderMetadata(): VpnProviderListItem[] {
    return this._registry.list().map((adapter) => ({
      identifier: adapter.identifier,
      name: adapter.name,
      enabled: false,
      isConfigured: false,
      capabilities: adapter.capabilities,
      credentialFields: adapter.credentialFields,
      setupNotes: adapter.setupNotes,
    }));
  }

  async getProviders(orgId: string): Promise<VpnProviderListItem[]> {
    const configs = await this._repository.getByOrg(orgId);
    const adapters = this._registry.list();

    return adapters.map((adapter) => {
      const config = configs.find((c) => c.identifier === adapter.identifier);
      const decrypted = this._decryptCredentials(config?.credentials);
      const isConfigured = this._hasRequiredCredentials(adapter, decrypted);

      return {
        identifier: adapter.identifier,
        name: adapter.name,
        enabled: config?.enabled ?? false,
        isConfigured,
        capabilities: adapter.capabilities,
        credentialFields: adapter.credentialFields,
        setupNotes: adapter.setupNotes,
      };
    });
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      name?: string;
      credentials?: Record<string, string>;
      enabled?: boolean;
    },
  ) {
    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) {
      throw new BadRequestException(`Unknown VPN provider: ${identifier}`);
    }

    const plainConfig = data.credentials || {};
    const validation = adapter.validateConfig(plainConfig);
    if (!validation.valid) {
      throw new BadRequestException(
        validation.errors?.join(' ') || `Invalid configuration for ${adapter.name}`,
      );
    }

    const encryptedCredentials = this._encryption.encrypt(JSON.stringify(plainConfig));

    return this._repository.upsert(orgId, identifier, {
      name: data.name,
      credentials: encryptedCredentials,
      enabled: data.enabled,
    });
  }

  async delete(orgId: string, identifier: string) {
    return this._repository.delete(orgId, identifier);
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new BadRequestException(`VPN provider "${identifier}" is not configured`);
    }

    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) {
      throw new BadRequestException(`Unknown VPN provider: ${identifier}`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    if (adapter.healthCheck) {
      return adapter.healthCheck(decrypted);
    }
    return { ok: true };
  }

  async getDecryptedConfig(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) return null;
    return {
      identifier: config.identifier,
      name: config.name,
      enabled: config.enabled,
      credentials: this._decryptCredentials(config.credentials),
    };
  }

  private _decryptCredentials(encrypted: string | null | undefined): Record<string, string> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this._encryption.decrypt(encrypted));
    } catch {
      this._logger.warn('Failed to decrypt VPN provider credentials');
      return {};
    }
  }

  private _hasRequiredCredentials(
    adapter: VpnProviderAdapter,
    credentials: Record<string, string>,
  ): boolean {
    return adapter.credentialFields
      .filter((field) => field.required)
      .every((field) => typeof credentials[field.key] === 'string' && credentials[field.key].trim().length > 0);
  }
}

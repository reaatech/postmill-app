import { Injectable, Logger } from '@nestjs/common';
import { OrgProviderConfigRepository } from './org-provider-config.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';

@Injectable()
export class OrgProviderConfigService {
  private readonly _logger = new Logger(OrgProviderConfigService.name);

  constructor(
    private _repository: OrgProviderConfigRepository,
    private _encryption: EncryptionService
  ) {}

  // No secrets — orgId/userId/action/provider identity only (#59).
  #audit(action: string, orgId: string, identifier: string, userId?: string) {
    this._logger.log(
      `channel-config.${action} org=${orgId} user=${userId || 'n/a'} provider=${identifier}`
    );
  }

  async getConfigs(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    return configs.map((c) => this.#maskSensitive(c));
  }

  async getCredentials(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) return undefined;

    return this.#decryptConfig(config);
  }

  async getEnabledIdentifiers(orgId: string): Promise<string[]> {
    const configs = await this._repository.getEnabledByOrg(orgId);
    return configs.map((c) => c.identifier);
  }

  async isEnabled(orgId: string, identifier: string): Promise<boolean> {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    return config?.enabled === true;
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      name: string;
      enabled: boolean;
      clientId?: string | null;
      clientSecret?: string | null;
      redirectUri?: string | null;
      scopes?: string | null;
      additionalConfig?: string | null;
      setupNotes?: string | null;
    },
    userId?: string
  ) {
    const encrypted: Record<string, string | null | undefined> = {};

    if (data.clientId !== undefined) {
      encrypted.clientId = this.#maybeEncrypt(data.clientId);
    }
    if (data.clientSecret !== undefined) {
      encrypted.clientSecret = this.#maybeEncrypt(data.clientSecret);
    }
    if (data.additionalConfig !== undefined) {
      encrypted.additionalConfig = this.#maybeEncrypt(data.additionalConfig);
    }

    const result = await this._repository.upsert(orgId, identifier, {
      ...data,
      ...encrypted,
    });

    this.#audit('upsert', orgId, identifier, userId);
    return this.#maskSensitive(result);
  }

  async delete(orgId: string, identifier: string, userId?: string) {
    await this._repository.delete(orgId, identifier);
    this.#audit('delete', orgId, identifier, userId);
  }

  async testConnection(orgId: string, identifier: string): Promise<{ success: boolean; authUrl?: string; error?: string }> {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      return { success: false, error: 'Provider not configured' };
    }

    const decrypted = this.#decryptConfig(config);
    if (!decrypted.clientId) {
      return { success: false, error: 'Client ID not configured' };
    }

    const state = Math.random().toString(36).substring(2, 8);
    const redirectUri = config.redirectUri || `${process.env.FRONTEND_URL}/integrations/social/${identifier}`;
    const scopes = config.scopes || '';

    const authUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/oauth-test?provider=${identifier}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${decrypted.clientId}&scope=${encodeURIComponent(scopes)}`;

    return { success: true, authUrl };
  }

  #maybeEncrypt(value: string | null | undefined): string | null | undefined {
    if (value === null || value === undefined || value === '') return value;
    return this._encryption.encrypt(value);
  }

  #decryptConfig(config: {
    clientId?: string | null;
    clientSecret?: string | null;
    additionalConfig?: string | null;
  }): {
    clientId?: string;
    clientSecret?: string;
    additionalConfig?: string;
  } {
    return {
      clientId: config.clientId ? this._encryption.decrypt(config.clientId) : undefined,
      clientSecret: config.clientSecret ? this._encryption.decrypt(config.clientSecret) : undefined,
      additionalConfig: config.additionalConfig ? this._encryption.decrypt(config.additionalConfig) : undefined,
    };
  }

  #maskSensitive(config: {
    id: string;
    organizationId: string;
    identifier: string;
    name: string;
    enabled: boolean;
    clientId: string | null;
    clientSecret: string | null;
    additionalConfig: string | null;
    redirectUri: string | null;
    scopes: string | null;
    setupNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const hasClientId = config.clientId ? true : false;
    const hasClientSecret = config.clientSecret ? true : false;
    const hasAdditionalConfig = config.additionalConfig ? true : false;

    return {
      id: config.id,
      organizationId: config.organizationId,
      identifier: config.identifier,
      name: config.name,
      enabled: config.enabled,
      isConfigured: hasClientId || hasClientSecret,
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      setupNotes: config.setupNotes,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}

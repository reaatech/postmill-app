import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgProviderConfigRepository } from './org-provider-config.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { randomBytes } from 'crypto';

type WritableConfig = {
  name?: string;
  enabled?: boolean;
  clientId?: string | null;
  clientSecret?: string | null;
  redirectUri?: string | null;
  scopes?: string | null;
  additionalConfig?: string | null;
  setupNotes?: string | null;
};

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

  async getConfigById(orgId: string, id: string) {
    const config = await this._repository.getById(orgId, id);
    return config ? this.#maskSensitive(config) : undefined;
  }

  // Decrypt credentials for a specific named config (used when an account/connection
  // is bound to that config — each named set has its own auth).
  async getCredentialsByConfigId(orgId: string, configId: string) {
    const config = await this._repository.getById(orgId, configId);
    if (!config) return undefined;
    return this.#decryptConfig(config);
  }

  // Fallback: decrypt by provider type (enabled-or-first) for unbound integrations.
  async getCredentials(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) return undefined;

    return this.#decryptConfig(config);
  }

  // Decrypt a raw config row (the manager already holds rows from getByOrg).
  decryptRow(config: {
    clientId?: string | null;
    clientSecret?: string | null;
    additionalConfig?: string | null;
  }) {
    return this.#decryptConfig(config);
  }

  async getEnabledIdentifiers(orgId: string): Promise<string[]> {
    const configs = await this._repository.getEnabledByOrg(orgId);
    return [...new Set(configs.map((c) => c.identifier))];
  }

  async isEnabled(orgId: string, identifier: string): Promise<boolean> {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    return config?.enabled === true;
  }

  async createConfig(
    orgId: string,
    data: WritableConfig & { identifier: string; name: string },
    userId?: string
  ) {
    const name = (data.name || '').trim();
    if (!name) {
      throw new BadRequestException('A channel name is required.');
    }

    if (data.enabled && !data.clientId?.trim()) {
      throw new BadRequestException(
        'A provider must be configured with credentials before it can be enabled.'
      );
    }

    const result = await this._repository.create(orgId, {
      identifier: data.identifier,
      name,
      enabled: data.enabled ?? false,
      ...this.#encryptWritable(data),
      redirectUri: data.redirectUri ?? null,
      scopes: data.scopes ?? null,
      setupNotes: data.setupNotes ?? null,
    });

    this.#audit('create', orgId, data.identifier, userId);
    return this.#maskSensitive(result);
  }

  async updateConfig(
    orgId: string,
    id: string,
    data: WritableConfig,
    userId?: string
  ) {
    const existing = await this._repository.getById(orgId, id);
    if (!existing) {
      throw new NotFoundException('Channel config not found.');
    }

    if (data.name !== undefined && !data.name.trim()) {
      throw new BadRequestException('A channel name is required.');
    }

    const willBeEnabled = data.enabled ?? existing.enabled;
    if (willBeEnabled) {
      const hasNewClientId = !!data.clientId?.trim();
      if (!hasNewClientId && !existing.clientId?.trim()) {
        throw new BadRequestException(
          'A provider must be configured with credentials before it can be enabled.'
        );
      }
    }

    const update: WritableConfig = { ...this.#encryptWritable(data) };
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.enabled !== undefined) update.enabled = data.enabled;
    if (data.redirectUri !== undefined) update.redirectUri = data.redirectUri;
    if (data.scopes !== undefined) update.scopes = data.scopes;
    if (data.setupNotes !== undefined) update.setupNotes = data.setupNotes;

    const result = await this._repository.updateById(id, update);
    this.#audit('update', orgId, existing.identifier, userId);
    return this.#maskSensitive(result);
  }

  async deleteConfig(orgId: string, id: string, userId?: string) {
    const existing = await this._repository.getById(orgId, id);
    if (!existing) {
      throw new NotFoundException('Channel config not found.');
    }
    await this._repository.deleteById(id);
    this.#audit('delete', orgId, existing.identifier, userId);
  }

  async testConnection(
    orgId: string,
    id: string
  ): Promise<{ success: boolean; authUrl?: string; error?: string }> {
    const config = await this._repository.getById(orgId, id);
    if (!config) {
      return { success: false, error: 'Provider not configured' };
    }

    const decrypted = this.#decryptConfig(config);
    if (!decrypted.clientId) {
      return { success: false, error: 'Client ID not configured' };
    }

    const state = randomBytes(32).toString('base64url');
    const redirectUri =
      config.redirectUri ||
      `${process.env.FRONTEND_URL}/integrations/social/${config.identifier}`;
    const scopes = config.scopes || '';

    const authUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/oauth-test?provider=${config.identifier}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${decrypted.clientId}&scope=${encodeURIComponent(scopes)}`;

    return { success: true, authUrl };
  }

  #encryptWritable(data: WritableConfig): WritableConfig {
    const encrypted: WritableConfig = {};
    if (data.clientId !== undefined) {
      encrypted.clientId = this.#maybeEncrypt(data.clientId);
    }
    if (data.clientSecret !== undefined) {
      encrypted.clientSecret = this.#maybeEncrypt(data.clientSecret);
    }
    if (data.additionalConfig !== undefined) {
      encrypted.additionalConfig = this.#maybeEncrypt(data.additionalConfig);
    }
    return encrypted;
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

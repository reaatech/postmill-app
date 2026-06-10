import { Injectable } from '@nestjs/common';
import { OrgProviderConfigService } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/org-provider-config.service';
import { setCredentials, getCredential, replaceCredentialsMap, clearOrgCredentials, type CredentialEntry } from '@gitroom/nestjs-libraries/integrations/credentials';

type DecryptedConfig = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string;
  additionalConfig?: string;
  setupNotes?: string;
  enabled: boolean;
  name: string;
  identifier: string;
};

type OrgCache = {
  configs: Map<string, DecryptedConfig>;
  enabledIdentifiers: string[];
  lastRefresh: number;
  refreshPromise: Promise<void> | null;
};

const REFRESH_INTERVAL_MS = 60_000;

@Injectable()
export class OrgProviderConfigManager {
  private orgCaches = new Map<string, OrgCache>();

  constructor(private _orgProviderConfigService: OrgProviderConfigService) {}

  async ensureFresh(orgId: string) {
    let cache = this.orgCaches.get(orgId);
    if (!cache) {
      cache = { configs: new Map(), enabledIdentifiers: [], lastRefresh: 0, refreshPromise: null };
      this.orgCaches.set(orgId, cache);
    }

    if (Date.now() - cache.lastRefresh <= REFRESH_INTERVAL_MS) return;
    if (cache.refreshPromise) {
      await cache.refreshPromise;
      return;
    }

    cache.refreshPromise = this.#doRefresh(orgId, cache);
    try {
      await cache.refreshPromise;
    } finally {
      cache.refreshPromise = null;
    }
  }

  async #doRefresh(orgId: string, cache: OrgCache) {
    const newConfigs = new Map<string, DecryptedConfig>();
    const newEnabled: string[] = [];
    const newCredentials = new Map<string, CredentialEntry>();

    const allConfigs = await this._orgProviderConfigService['_repository'].getByOrg(orgId);

    for (const config of allConfigs) {
      const decrypted = await this._orgProviderConfigService.getCredentials(orgId, config.identifier) || {};
      const entry: DecryptedConfig = {
        identifier: config.identifier,
        name: config.name,
        enabled: config.enabled,
        clientId: decrypted.clientId,
        clientSecret: decrypted.clientSecret,
        redirectUri: config.redirectUri || undefined,
        scopes: config.scopes || undefined,
        additionalConfig: decrypted.additionalConfig,
        setupNotes: config.setupNotes || undefined,
      };
      newConfigs.set(config.identifier, entry);

      if (config.enabled && (decrypted.clientId || decrypted.clientSecret)) {
        newEnabled.push(config.identifier);
        newCredentials.set(config.identifier, {
          clientId: decrypted.clientId,
          clientSecret: decrypted.clientSecret,
          redirectUri: config.redirectUri || undefined,
          scopes: config.scopes?.split(',').map((s: string) => s.trim()),
        });
      }
    }

    cache.configs = newConfigs;
    cache.enabledIdentifiers = newEnabled;
    cache.lastRefresh = Date.now();

    replaceCredentialsMap(orgId, newCredentials);
  }

  invalidateOrg(orgId: string) {
    this.orgCaches.delete(orgId);
    clearOrgCredentials(orgId);
  }

  async getConfig(orgId: string, identifier: string): Promise<DecryptedConfig | undefined> {
    await this.ensureFresh(orgId);
    return this.orgCaches.get(orgId)?.configs.get(identifier);
  }

  async getEnabledIdentifiers(orgId: string): Promise<string[]> {
    await this.ensureFresh(orgId);
    return [...(this.orgCaches.get(orgId)?.enabledIdentifiers || [])];
  }

  async getAllConfigs(orgId: string): Promise<DecryptedConfig[]> {
    await this.ensureFresh(orgId);
    return Array.from(this.orgCaches.get(orgId)?.configs.values() || []);
  }

  async isEnabled(orgId: string, identifier: string): Promise<boolean> {
    await this.ensureFresh(orgId);
    return this.orgCaches.get(orgId)?.configs.get(identifier)?.enabled === true;
  }

  async getClientInfo(orgId: string, identifier: string): Promise<{
    client_id: string;
    client_secret: string;
    instanceUrl: string;
    token?: string;
  } | undefined> {
    await this.ensureFresh(orgId);
    const config = this.orgCaches.get(orgId)?.configs.get(identifier);
    if (!config?.enabled) {
      return undefined;
    }
    let token: string | undefined;
    if (config.additionalConfig) {
      try {
        const parsed = JSON.parse(config.additionalConfig);
        if (parsed?.botToken) {
          token = parsed.botToken;
        }
      } catch {}
    }
    if (!config.clientId && !config.clientSecret) {
      if (!token) return undefined;
    } else if (!config.clientId || !config.clientSecret) {
      return undefined;
    }
    return {
      client_id: config.clientId || '',
      client_secret: config.clientSecret || '',
      instanceUrl: config.redirectUri || '',
      ...(token ? { token } : {}),
    };
  }
}

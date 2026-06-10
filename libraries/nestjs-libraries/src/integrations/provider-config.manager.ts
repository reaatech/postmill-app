import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { ProviderConfigService } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/provider-config.service';
import { replaceCredentialsMap, type CredentialEntry } from '@gitroom/nestjs-libraries/integrations/credentials';
import { ProviderConfiguration } from '@prisma/client';

type DecryptedConfig = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string;
  additionalConfig?: string;
  setupInstructions?: string;
  enabled: boolean;
  name: string;
  identifier: string;
};

@Injectable()
export class ProviderConfigManager implements OnModuleInit {
  private cache: Map<string, DecryptedConfig> = new Map();
  private allEnabled: string[] = [];
  private lastRefresh = 0;
  private refreshIntervalMs = 60_000;
  private refreshPromise: Promise<void> | null = null;

  constructor(private _providerConfigService: ProviderConfigService) {}

  async onModuleInit() {
    try {
      await this.refreshCache();
    } catch (err: any) {
      console.error('Failed to load provider configs on startup, will retry on first access:', err?.message);
    }
  }

  async refreshCache() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.#doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async #doRefresh() {
    const configs = await this._providerConfigService.getAll();
    const newCache = new Map<string, DecryptedConfig>();
    const newEnabled: string[] = [];
    const newCredentials = new Map<string, CredentialEntry>();

    for (const config of configs) {
      try {
        const decrypted = this._providerConfigService.decryptConfig(config);
        const entry: DecryptedConfig = {
          identifier: config.identifier,
          name: config.name,
          enabled: config.enabled,
          clientId: decrypted.clientId,
          clientSecret: decrypted.clientSecret,
          redirectUri: config.redirectUri || undefined,
          scopes: config.scopes || undefined,
          additionalConfig: config.additionalConfig || undefined,
          setupInstructions: config.setupInstructions || undefined,
        };
        newCache.set(config.identifier, entry);
        if (config.enabled) {
          newEnabled.push(config.identifier);
        }

        let token: string | undefined;
        if (config.additionalConfig) {
          let parsed: Record<string, any> | undefined;
          try {
            parsed = JSON.parse(config.additionalConfig);
          } catch {
            console.error(`ProviderConfigManager: Failed to parse additionalConfig for ${config.identifier}`);
          }
          if (parsed?.botToken) {
            token = AuthService.fixedDecryption(parsed.botToken);
          }
        }

        if (entry.enabled && (entry.clientId || entry.clientSecret || token)) {
          newCredentials.set(config.identifier, {
            clientId: entry.clientId,
            clientSecret: entry.clientSecret,
            redirectUri: entry.redirectUri,
            scopes: entry.scopes
              ? entry.scopes.split(',').map((s: string) => s.trim())
              : undefined,
            ...(token ? { token } : {}),
          });
        }
      } catch (err) {
        console.error(`ProviderConfigManager: Failed to load config for ${config.identifier}`, err);
      }
    }

    this.cache = newCache;
    this.allEnabled = newEnabled;
    replaceCredentialsMap('__global__', newCredentials);
    this.lastRefresh = Date.now();
  }

  async ensureFresh() {
    if (Date.now() - this.lastRefresh > this.refreshIntervalMs) {
      try {
        await this.refreshCache();
      } catch (err) {
        console.error('ProviderConfigManager: Cache refresh failed, will retry on next request', err);
      }
    }
  }

  async getConfig(identifier: string): Promise<DecryptedConfig | undefined> {
    await this.ensureFresh();
    return this.cache.get(identifier);
  }

  async getEnabledIdentifiers(): Promise<string[]> {
    await this.ensureFresh();
    return [...this.allEnabled];
  }

  async getAllConfigs(): Promise<DecryptedConfig[]> {
    await this.ensureFresh();
    return Array.from(this.cache.values());
  }

  async isEnabled(identifier: string): Promise<boolean> {
    await this.ensureFresh();
    const config = this.cache.get(identifier);
    return config?.enabled === true;
  }

  async getClientInfo(identifier: string): Promise<{
    client_id: string;
    client_secret: string;
    instanceUrl: string;
    token?: string;
  } | undefined> {
    await this.ensureFresh();
    const config = this.cache.get(identifier);
    if (!config?.enabled) {
      return undefined;
    }
    let token: string | undefined;
    if (config.additionalConfig) {
      try {
        const parsed = JSON.parse(config.additionalConfig);
        if (parsed?.botToken) {
          token = AuthService.fixedDecryption(parsed.botToken);
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
      // redirectUri doubles as instanceUrl for self-hosted providers (Mastodon, etc.)
      instanceUrl: config.redirectUri || '',
      ...(token ? { token } : {}),
    };
  }
}

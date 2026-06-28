import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { OrgVpnConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/vpn/org-vpn-config.repository';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { ProviderKernel, ProviderNotFoundError } from '@gitroom/provider-kernel';
import { VpnProviderAdapter } from './vpn-provider.interface';
import {
  VpnProviderCapabilities,
  VpnProxyAuth,
  VpnProxyRegion,
} from './vpn.types';
import { VpnDispatcherService } from './vpn-dispatcher.service';

export interface VpnProviderListItem {
  identifier: string;
  name: string;
  enabled: boolean;
  isConfigured: boolean;
  version: string;
  capabilities: VpnProviderCapabilities;
  credentialFields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  proxyRegions: VpnProxyRegion[];
  enabledRegions: string[];
  // True when regions are derived from the org's own config (custom proxy) rather
  // than a fixed catalog — the UI hides the per-region checklist for these.
  isDynamicRegions: boolean;
  setupNotes?: string;
}

// One selectable provider×region for the per-channel VPN picker.
export interface VpnEnabledRegion {
  identifier: string;
  providerName: string;
  regionId: string;
  regionLabel: string;
}

// Everything the dispatcher factory needs to build a proxy for one channel.
export interface VpnResolvedProxy {
  region: VpnProxyRegion;
  auth: VpnProxyAuth;
  credsFingerprint: string;
  version?: string;
}

@Injectable()
export class OrgVpnConfigService {
  private readonly _logger = new Logger(OrgVpnConfigService.name);

  constructor(
    private _repository: OrgVpnConfigRepository,
    private _encryption: EncryptionService,
    private _dispatcher: VpnDispatcherService,
    private _resolution: ProviderResolutionService,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel,
  ) {}

  // Effective region catalog for an adapter: derived from config for dynamic
  // (custom proxy) providers, else the adapter's static catalog.
  private _regionsFor(
    adapter: VpnProviderAdapter,
    decrypted: Record<string, string>,
  ): VpnProxyRegion[] {
    if (adapter.resolveRegions) return adapter.resolveRegions(decrypted);
    return adapter.proxyRegions ?? [];
  }

  // Resolve a single VPN adapter through the kernel, or null when unknown/retired.
  // The resolved VpnCapability carries the full proxyRegions / resolveRegions /
  // resolveProxyAuth surface (host/port/protocol included) the old registry held.
  private _resolveAdapter(
    identifier: string,
    version?: string,
  ): VpnProviderAdapter | null {
    try {
      return this._resolution.resolveVpn(identifier, { version: version ?? 'v1' });
    } catch {
      return null;
    }
  }

  // The full catalog of registered VPN providers (one adapter per id), sourced
  // from the kernel manifests now that the in-memory registry is gone.
  private _listAdapters(): VpnProviderAdapter[] {
    const byId = new Map<string, VpnProviderAdapter>();
    for (const manifest of this._kernel.listManifests('vpn')) {
      if (byId.has(manifest.providerId)) continue;
      const adapter = this._resolveAdapter(manifest.providerId, manifest.version);
      if (adapter) byId.set(manifest.providerId, adapter);
    }
    return [...byId.values()];
  }

  getProviderMetadata(): VpnProviderListItem[] {
    return this._listAdapters().map((adapter) => ({
      identifier: adapter.identifier,
      name: adapter.name,
      enabled: false,
      isConfigured: false,
      version: 'v1',
      capabilities: adapter.capabilities,
      credentialFields: adapter.credentialFields,
      // No org config ⇒ dynamic providers have no derived region yet.
      proxyRegions: adapter.proxyRegions ?? [],
      enabledRegions: [],
      isDynamicRegions: !!adapter.resolveRegions,
      setupNotes: adapter.setupNotes,
    }));
  }

  async getProviders(orgId: string): Promise<VpnProviderListItem[]> {
    const configs = await this._repository.getByOrg(orgId);
    const adapters = this._listAdapters();

    return adapters.map((adapter) => {
      const config = configs.find((c) => c.identifier === adapter.identifier);
      const decrypted = this._decryptCredentials(config?.credentials);
      const isConfigured = this._hasRequiredCredentials(adapter, decrypted);
      const isDynamic = !!adapter.resolveRegions;
      const catalog = this._regionsFor(adapter, decrypted);
      // Dynamic providers have a single derived region, auto-enabled. Static
      // providers keep only the stored ids that still exist in their catalog.
      const enabledRegions = isDynamic
        ? catalog.map((r) => r.id)
        : this._parseRegions(config?.regions).filter((id) =>
            catalog.some((r) => r.id === id),
          );

      return {
        identifier: adapter.identifier,
        name: adapter.name,
        enabled: config?.enabled ?? false,
        isConfigured,
        version: config?.version ?? 'v1',
        capabilities: adapter.capabilities,
        credentialFields: adapter.credentialFields,
        proxyRegions: catalog,
        enabledRegions,
        isDynamicRegions: isDynamic,
        setupNotes: adapter.setupNotes,
      };
    });
  }

  // Every (enabled config × enabled region) the org can route a channel through.
  async listEnabledRegions(orgId: string): Promise<VpnEnabledRegion[]> {
    const configs = await this._repository.getByOrg(orgId);
    const out: VpnEnabledRegion[] = [];
    for (const config of configs) {
      if (!config.enabled) continue;
      const adapter = this._resolveAdapter(config.identifier, config.version ?? 'v1');
      if (!adapter) continue;
      const decrypted = this._decryptCredentials(config.credentials);
      if (!this._hasRequiredCredentials(adapter, decrypted)) continue;
      const catalog = this._regionsFor(adapter, decrypted);
      if (catalog.length === 0) continue;
      // Dynamic ⇒ all derived regions; static ⇒ only the org-enabled ids.
      const enabledIds = adapter.resolveRegions
        ? catalog.map((r) => r.id)
        : this._parseRegions(config.regions);
      for (const id of enabledIds) {
        const region = catalog.find((r) => r.id === id);
        if (!region) continue;
        out.push({
          identifier: adapter.identifier,
          providerName: adapter.name,
          regionId: region.id,
          regionLabel: region.label,
        });
      }
    }
    return out;
  }

  // Resolve a channel's VPN selection into the region + auth + creds fingerprint
  // the dispatcher factory needs. Returns null when the selection is no longer
  // valid (provider disabled, region removed, creds missing).
  async resolveProxyForChannel(
    orgId: string,
    identifier: string,
    regionId: string,
    version?: string,
  ): Promise<VpnResolvedProxy | null> {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config || !config.enabled) return null;

    // The resolved VpnCapability exposes the full proxyRegions catalog
    // (host/port/protocol) and resolveProxyAuth the dispatcher factory needs.
    const adapter = this._resolveAdapter(identifier, version ?? config.version ?? 'v1');
    if (!adapter) return null;

    const decrypted = this._decryptCredentials(config.credentials);
    const region = this._regionsFor(adapter, decrypted).find((r) => r.id === regionId);
    if (!region) return null;
    // Static providers gate on the per-region toggle; dynamic ones don't have one.
    if (!adapter.resolveRegions && !this._parseRegions(config.regions).includes(regionId)) {
      return null;
    }

    const auth = adapter.resolveProxyAuth?.(decrypted) ?? null;
    if (!auth) return null;

    // Fingerprint the full endpoint + auth so a host/port/protocol change (custom
    // proxy) or a credential rotation produces a new dispatcher cache key.
    const credsFingerprint = createHash('sha256')
      .update(`${region.host}:${region.port}:${region.protocol}:${auth.username}:${auth.password}`)
      .digest('hex');
    return { region, auth, credsFingerprint, version: version ?? config.version ?? 'v1' };
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      name?: string;
      credentials?: Record<string, string>;
      regions?: string[];
      enabled?: boolean;
    },
  ) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    const version =
      config?.version ??
      this._resolution.latestActiveVersion('vpn', identifier) ??
      'v1';

    let adapter;
    try {
      adapter = this._resolution.resolveVpn(identifier, {
        version,
        credentials: data.credentials ?? {},
        orgId,
      });
    } catch (err) {
      const message = (err as Error)?.message ?? '';
      if (
        err instanceof ProviderNotFoundError ||
        message.includes('not found')
      ) {
        throw new BadRequestException(`Unknown VPN provider: ${identifier}`);
      }
      throw err;
    }

    // Credentials are only (re)validated/encrypted when supplied — a regions or
    // enabled-only toggle must not wipe the stored secret.
    let encryptedCredentials: string | undefined;
    if (data.credentials !== undefined) {
      const raw = adapter.validateConfig(data.credentials) as unknown as {
        ok?: boolean;
        valid?: boolean;
        error?: string;
        errors?: string[];
      };
      const ok = raw.ok ?? raw.valid ?? true;
      if (!ok) {
        throw new BadRequestException(
          raw.error || raw.errors?.join(' ') || `Invalid configuration for ${adapter.name}`,
        );
      }
      encryptedCredentials = this._encryption.encrypt(JSON.stringify(data.credentials));
    }

    // The region allowlist only needs the static catalog's region ids, read off
    // the adapter already resolved above.
    let regions: string | undefined;
    if (data.regions !== undefined) {
      const catalog = adapter.proxyRegions ?? [];
      const valid = data.regions.filter((id) => catalog.some((r) => r.id === id));
      regions = JSON.stringify(valid);
    }

    const result = await this._repository.upsert(orgId, identifier, {
      name: data.name,
      credentials: encryptedCredentials,
      regions,
      enabled: data.enabled,
    }, version);

    // Drop any pooled dispatchers so a cred/region/enabled change takes effect now.
    this._dispatcher.invalidate(orgId, identifier);
    return result;
  }

  async delete(orgId: string, identifier: string) {
    const result = await this._repository.delete(orgId, identifier);
    this._dispatcher.invalidate(orgId, identifier);
    return result;
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new BadRequestException(`VPN provider "${identifier}" is not configured`);
    }

    let adapter;
    try {
      adapter = this._resolution.resolveVpn(identifier, {
        version: config.version ?? 'v1',
        credentials: this._decryptCredentials(config.credentials),
        orgId,
      });
    } catch (err) {
      const message = (err as Error)?.message ?? '';
      if (
        err instanceof ProviderNotFoundError ||
        message.includes('not found')
      ) {
        throw new BadRequestException(`Unknown VPN provider: ${identifier}`);
      }
      throw err;
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

  private _parseRegions(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
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

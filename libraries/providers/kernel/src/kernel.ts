import { ProviderDomain, ProviderKey, keyString, DEFAULT_VERSION } from './identity';
import { ProviderManifest, ProviderVersionStatus, validateManifest, manifestKeyString } from './manifest';
import { ProviderModule, ProviderRuntimeContext } from './module';
import { TelemetryPort } from './ports';
import {
  ProviderNotFoundError,
  ProviderVersionRetiredError,
  ProviderVersionDeprecatedForWriteError,
  ProviderManifestError,
} from './errors';

export interface KernelOptions {
  telemetry?: TelemetryPort;
}

function versionRank(version: string): number {
  const match = /^v(\d+)/.exec(version);
  if (match) {
    return Number(match[1]);
  }
  return Number.NEGATIVE_INFINITY;
}

function compareVersions(a: string, b: string): number {
  const rankA = versionRank(a);
  const rankB = versionRank(b);
  if (rankA !== Number.NEGATIVE_INFINITY && rankB !== Number.NEGATIVE_INFINITY) {
    return rankA - rankB;
  }
  return a.localeCompare(b);
}

export class ProviderKernel {
  private readonly _store = new Map<
    string,
    Map<string, Map<string, ProviderModule>>
  >();
  private readonly _telemetry?: TelemetryPort;

  constructor(options: KernelOptions = {}) {
    this._telemetry = options.telemetry;
  }

  register<Caps, Capability>(module: ProviderModule<Caps, Capability>): void {
    const manifest = module.manifest;
    try {
      validateManifest(manifest);
    } catch (err) {
      throw new ProviderManifestError(
        {
          domain: manifest?.domain || 'unknown',
          providerId: manifest?.providerId || 'unknown',
          version: manifest?.version,
        },
        (err as Error).message,
      );
    }

    const domainMap = this._store.get(manifest.domain) || new Map<string, Map<string, ProviderModule>>();
    const providerMap = domainMap.get(manifest.providerId) || new Map<string, ProviderModule>();

    if (providerMap.has(manifest.version)) {
      throw new ProviderManifestError(
        {
          domain: manifest.domain,
          providerId: manifest.providerId,
          version: manifest.version,
        },
        `Duplicate registration of ${manifestKeyString(manifest)}`,
      );
    }

    if (!module.health) {
      (module as any).health = {
        lastSuccessAt: null,
        lastErrorAt: null,
        successCount: 0,
        errorCount: 0,
        consecutiveErrors: 0,
      };
    }

    providerMap.set(manifest.version, module);
    domainMap.set(manifest.providerId, providerMap);
    this._store.set(manifest.domain, domainMap);
  }

  get<Caps, Capability>(
    domain: ProviderDomain,
    providerId: string,
    version: string,
  ): ProviderModule<Caps, Capability> | undefined {
    return this._store.get(domain)?.get(providerId)?.get(version) as
      | ProviderModule<Caps, Capability>
      | undefined;
  }

  latestActive<Caps, Capability>(
    domain: ProviderDomain,
    providerId: string,
  ): ProviderModule<Caps, Capability> | undefined {
    const providerMap = this._store.get(domain)?.get(providerId);
    if (!providerMap) return undefined;

    let selected: ProviderModule<Caps, Capability> | undefined;
    for (const [version, mod] of providerMap) {
      if (mod.manifest.status !== 'active') continue;
      if (!selected || compareVersions(version, selected.manifest.version) > 0) {
        selected = mod as ProviderModule<Caps, Capability>;
      }
    }
    return selected;
  }

  resolveForRead<Caps, Capability>(
    domain: ProviderDomain,
    providerId: string,
    version = DEFAULT_VERSION,
  ): ProviderModule<Caps, Capability> {
    const mod = this.get<Caps, Capability>(domain, providerId, version);
    if (!mod) {
      throw new ProviderNotFoundError({ domain, providerId, version });
    }
    if (mod.manifest.status === 'retired') {
      throw new ProviderVersionRetiredError({ domain, providerId, version });
    }
    return mod;
  }

  resolveForWrite<Caps, Capability>(
    domain: ProviderDomain,
    providerId: string,
    version?: string,
    opts?: { allowPreview?: boolean },
  ): ProviderModule<Caps, Capability> {
    if (version) {
      const mod = this.get<Caps, Capability>(domain, providerId, version);
      if (!mod) {
        throw new ProviderNotFoundError({ domain, providerId, version });
      }
      if (mod.manifest.status === 'retired') {
        throw new ProviderVersionRetiredError({ domain, providerId, version });
      }
      if (mod.manifest.status === 'deprecated') {
        throw new ProviderVersionDeprecatedForWriteError({ domain, providerId, version });
      }
      if (mod.manifest.status === 'preview' && !opts?.allowPreview) {
        throw new ProviderVersionDeprecatedForWriteError({
          domain,
          providerId,
          version,
        });
      }
      return mod;
    }

    const latest = this.latestActive<Caps, Capability>(domain, providerId);
    if (!latest) {
      throw new ProviderNotFoundError({ domain, providerId });
    }
    return latest;
  }

  versions(domain: ProviderDomain, providerId: string): ProviderManifest[] {
    const providerMap = this._store.get(domain)?.get(providerId);
    if (!providerMap) return [];
    return Array.from(providerMap.values()).map((m) => m.manifest);
  }

  listManifests(domain?: ProviderDomain): ProviderManifest[] {
    const out: ProviderManifest[] = [];
    for (const [d, domainMap] of this._store) {
      if (domain && d !== domain) continue;
      for (const providerMap of domainMap.values()) {
        for (const mod of providerMap.values()) {
          out.push(mod.manifest);
        }
      }
    }
    return out;
  }

  recordSuccess(key: ProviderKey): void {
    const mod = this.get(key.domain, key.providerId, key.version);
    if (!mod || !mod.health) return;
    const now = Date.now();
    mod.health.lastSuccessAt = now;
    mod.health.successCount += 1;
    mod.health.consecutiveErrors = 0;
    this._telemetry?.recordCall({
      domain: key.domain,
      providerId: key.providerId,
      version: key.version,
      ok: true,
      latencyMs: 0,
    });
  }

  recordError(key: ProviderKey, error?: string): void {
    const mod = this.get(key.domain, key.providerId, key.version);
    if (!mod || !mod.health) return;
    const now = Date.now();
    mod.health.lastErrorAt = now;
    mod.health.errorCount += 1;
    mod.health.consecutiveErrors += 1;
    this._telemetry?.recordCall({
      domain: key.domain,
      providerId: key.providerId,
      version: key.version,
      ok: false,
      latencyMs: 0,
      error,
    });
  }
}

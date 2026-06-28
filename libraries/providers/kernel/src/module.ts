import { ProviderManifest, ProviderHealth } from './manifest';
import {
  EncryptionPort,
  LoggerPort,
  SafeFetchPort,
  TelemetryPort,
} from './ports';
import { ProviderVersionRetiredError } from './errors';

export interface ProviderRuntimeContext {
  credentials: Record<string, string>;
  encryption: EncryptionPort;
  fetch: SafeFetchPort;
  logger: LoggerPort;
  telemetry: TelemetryPort;
  orgId?: string;
  /** Domain-specific extras (e.g. full StorageProviderConfig). */
  extras?: Record<string, unknown>;
}

export interface CredentialValidationResult {
  ok: boolean;
  error?: string;
}

export interface ProviderModule<Caps = unknown, Capability = unknown> {
  manifest: ProviderManifest<Caps>;
  create(ctx: ProviderRuntimeContext): Capability;
  validateCredentials?(
    ctx: ProviderRuntimeContext,
  ): Promise<CredentialValidationResult>;
  health?: ProviderHealth;
  /**
   * Raw legacy provider singleton (social domain). Relocated social packages
   * expose their `SocialAbstract & SocialProvider` instance here so the bootstrap
   * can populate IntegrationManager's in-memory `socialIntegrationList` without
   * the kernel knowing about the legacy registry. Optional/unused by other domains.
   */
  legacyProvider?: unknown;
}

/**
 * A fully-resolved provider: the registered module, a ready-to-use capability
 * instance built from it, and the version that was pinned for this resolution.
 * Domain resolution paths return this so services get a usable capability plus
 * the manifest/version metadata in one shot.
 */
export interface ResolvedProvider<C = unknown> {
  module: ProviderModule;
  capability: C;
  version: string;
}

export function tombstone<Caps, Capability>(
  manifest: ProviderManifest<Caps>,
): ProviderModule<Caps, Capability> {
  return {
    manifest,
    create(): Capability {
      throw new ProviderVersionRetiredError({
        domain: manifest.domain,
        providerId: manifest.providerId,
        version: manifest.version,
      });
    },
  };
}

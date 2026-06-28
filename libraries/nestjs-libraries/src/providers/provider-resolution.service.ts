import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ProviderKernel,
  ProviderKey,
  ProviderModule,
  ProviderRuntimeContext,
  ResolvedProvider,
  DEFAULT_VERSION,
  ProviderDomain,
  ContentPackCapability,
  ProviderManifest,
} from '@gitroom/provider-kernel';
import { accountFingerprint } from '@gitroom/nestjs-libraries/utils/account-fingerprint';
import { AIProviderAdapter } from '@gitroom/nestjs-libraries/ai/ai-provider.interface';
import { MediaProviderAdapter } from '@gitroom/nestjs-libraries/media/media-provider-adapter.interface';
import { ShortLinkAdapter } from '@gitroom/nestjs-libraries/short-linking/short-link.interface';
import { VpnProviderAdapter } from '@gitroom/nestjs-libraries/vpn/vpn-provider.interface';
import { EmailAdapter } from '@gitroom/nestjs-libraries/emails/email-adapter.interface';
import { IStorageAdapter } from '@gitroom/nestjs-libraries/upload/upload.interface';
import { SocialProvider } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { PROVIDER_KERNEL } from './provider-kernel.token';
import { RuntimeContextFactory } from './runtime-context.factory';

export interface ResolutionOptions {
  version?: string;
  credentials?: Record<string, string>;
  orgId?: string;
  extras?: Record<string, unknown>;
}

function makeTelemetryProxy<T extends object>(
  target: T,
  key: ProviderKey,
  logger: Logger,
  kernel: ProviderKernel,
): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = (obj as Record<string | symbol, unknown>)[prop];
      if (typeof value !== 'function') {
        return value;
      }
      const operation = String(prop);
      return function (...args: unknown[]) {
        const start = performance.now();
        logger.debug(`provider-call ${key.domain}/${key.providerId}@${key.version}.${operation}`, {
          keyString: `${key.domain}/${key.providerId}@${key.version}`,
          operation,
        });
        try {
          const result = (value as (...args: unknown[]) => unknown).apply(obj, args);
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            return (result as Promise<unknown>)
              .then((res) => {
                kernel.recordSuccess(key);
                return res;
              })
              .catch((err: Error) => {
                kernel.recordError(key, err.message);
                throw err;
              });
          }
          kernel.recordSuccess(key);
          return result;
        } catch (err) {
          kernel.recordError(key, (err as Error).message);
          throw err;
        }
      };
    },
  }) as T;
}

@Injectable()
export class ProviderResolutionService {
  constructor(
    @Inject(PROVIDER_KERNEL) private readonly _kernel: ProviderKernel,
    private readonly _runtimeContext: RuntimeContextFactory,
    private readonly _logger: Logger,
  ) {}

  /**
   * Capability instance cache (7.0.6). Keyed by
   * `${domain}/${providerId}@${version}:${orgId ?? 'global'}:${creds-fingerprint}`
   * — mirrors the VPN dispatcher cache key. `module.create(ctx)` is cheap and
   * side-effect-free, but services should not rebuild 37 social / N media
   * adapters per request; the cache preserves the de-facto singleton behaviour
   * the social VPN-egress AsyncLocalStorage path assumes.
   */
  private readonly _capabilityCache = new Map<string, unknown>();

  private _buildContext(options: ResolutionOptions): ProviderRuntimeContext {
    return this._runtimeContext.build({
      credentials: options.credentials,
      orgId: options.orgId,
      extras: options.extras,
    });
  }

  private _cacheKey(
    domain: ProviderDomain,
    providerId: string,
    version: string,
    options: ResolutionOptions,
  ): string {
    const fingerprint = accountFingerprint(
      options.credentials ? JSON.stringify(options.credentials) : null,
    );
    return `${domain}/${providerId}@${version}:${options.orgId ?? 'global'}:${fingerprint}`;
  }

  /**
   * Resolve a kernel-registered provider into a cached, telemetry-wrapped
   * capability plus its module/version (7.0.4 + 7.0.6). The kernel is the sole
   * resolution path — the legacy in-memory registries have been removed.
   */
  private _resolveKernel<C>(
    domain: ProviderDomain,
    providerId: string,
    options: ResolutionOptions,
  ): ResolvedProvider<C> {
    const version = options.version ?? DEFAULT_VERSION;
    const mod = this._kernel.resolveForRead<unknown, C>(
      domain,
      providerId,
      version,
    );

    const cacheKey = this._cacheKey(domain, providerId, version, options);
    let capability = this._capabilityCache.get(cacheKey) as C | undefined;
    if (capability === undefined) {
      capability = makeTelemetryProxy(
        mod.create(this._buildContext(options)) as object,
        { domain, providerId, version },
        this._logger,
        this._kernel,
      ) as C;
      this._capabilityCache.set(cacheKey, capability);
    }

    return { module: mod as ProviderModule, capability, version };
  }

  /**
   * Public resolution variant returning the full {@link ResolvedProvider}
   * (module + capability + version) for callers that need the manifest/version
   * alongside the capability. Resolves exclusively through the kernel.
   */
  resolveProvider<C>(
    domain: ProviderDomain,
    providerId: string,
    options: ResolutionOptions = {},
  ): ResolvedProvider<C> {
    return this._resolveKernel<C>(domain, providerId, options);
  }

  /**
   * Invalidate cached capability instances. Config-mutation services
   * (e.g. OrgAiSettingsService, OrgShortLinkSettingsService,
   * OrgMediaProviderSettingsService, OrgVpnConfig writes, channel credential
   * updates) MUST call this after a credential/config change so the next
   * resolve rebuilds the capability with fresh credentials.
   */
  invalidate(
    domain: ProviderDomain,
    providerId: string,
    orgId?: string,
  ): void {
    const prefix = `${domain}/${providerId}@`;
    const orgSegment = orgId !== undefined ? `:${orgId}:` : undefined;
    for (const key of this._capabilityCache.keys()) {
      if (!key.startsWith(prefix)) continue;
      if (orgSegment && !key.includes(orgSegment)) continue;
      this._capabilityCache.delete(key);
    }
  }

  /** Invalidate every cached capability for an org (e.g. on org-wide changes). */
  invalidateOrg(orgId: string): void {
    const orgSegment = `:${orgId}:`;
    for (const key of this._capabilityCache.keys()) {
      if (key.includes(orgSegment)) {
        this._capabilityCache.delete(key);
      }
    }
  }

  resolveAI(
    providerId: string,
    options: ResolutionOptions = {},
  ): AIProviderAdapter {
    return this._resolveKernel<AIProviderAdapter>('ai', providerId, options)
      .capability;
  }

  resolveMedia(
    providerId: string,
    options: ResolutionOptions = {},
  ): MediaProviderAdapter {
    return this._resolveKernel<MediaProviderAdapter>('media', providerId, options)
      .capability;
  }

  resolveShortLink(
    providerId: string,
    options: ResolutionOptions = {},
  ): ShortLinkAdapter {
    return this._resolveKernel<ShortLinkAdapter>(
      'shortlink',
      providerId,
      options,
    ).capability;
  }

  resolveVpn(
    providerId: string,
    options: ResolutionOptions = {},
  ): VpnProviderAdapter {
    return this._resolveKernel<VpnProviderAdapter>('vpn', providerId, options)
      .capability;
  }

  resolveEmail(
    providerId: string,
    options: ResolutionOptions = {},
  ): EmailAdapter {
    return this._resolveKernel<EmailAdapter>('email', providerId, options)
      .capability;
  }

  resolveStorage(
    providerId: string,
    options: ResolutionOptions = {},
  ): IStorageAdapter {
    return this._resolveKernel<IStorageAdapter>('storage', providerId, options)
      .capability;
  }

  resolveSocial(
    providerId: string,
    options: ResolutionOptions = {},
  ): SocialProvider {
    return this._resolveKernel<SocialProvider>('social', providerId, options)
      .capability;
  }

  resolveContentPack(
    providerId: string,
    options: ResolutionOptions = {},
  ): ContentPackCapability {
    return this._resolveKernel<ContentPackCapability>(
      'contentpack',
      providerId,
      options,
    ).capability;
  }

  /**
   * Public manifest catalog for a domain (or all domains). The kernel is the
   * single source of truth for provider metadata (displayName, capabilities,
   * credentialFields, status/version) — settings surfaces project these instead
   * of holding their own hardcoded catalog object.
   */
  listManifests(domain?: ProviderDomain): ProviderManifest[] {
    return this._kernel.listManifests(domain);
  }

  latestActiveVersion(domain: ProviderDomain, providerId: string): string | undefined {
    return this._kernel.latestActive(domain, providerId)?.manifest.version;
  }

  keyString(domain: string, providerId: string, version?: string): string {
    return `${domain}/${providerId}@${version ?? DEFAULT_VERSION}`;
  }
}

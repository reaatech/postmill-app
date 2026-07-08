import { Inject, Injectable } from '@nestjs/common';
import { AuthProviderAbstract } from '@gitroom/backend/services/auth/providers.interface';
import {
  ProviderKernel,
  DEFAULT_VERSION,
} from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { RuntimeContextFactory } from '@gitroom/nestjs-libraries/providers/runtime-context.factory';
import { AuthProviderRepository } from '@gitroom/nestjs-libraries/database/prisma/auth-providers/auth-provider.repository';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

@Injectable()
export class AuthProviderManager {
  constructor(
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel,
    private _runtimeContext: RuntimeContextFactory,
    private _authProviderRepo: AuthProviderRepository
  ) {}

  // Latest-active kernel version + status for an auth provider. Degrades to
  // v1/active when the auth domain has no kernel module registered for this
  // provider yet.
  private _versionInfo(provider: string): {
    version: string;
    status: string;
  } {
    const providerId = provider.toLowerCase();
    const latest = this._kernel.latestActive('auth', providerId);
    if (latest) {
      return {
        version: latest.manifest.version,
        status: latest.manifest.status,
      };
    }
    const manifests = this._kernel.versions('auth', providerId);
    if (manifests.length > 0) {
      const manifest = manifests[manifests.length - 1];
      return { version: manifest.version, status: manifest.status };
    }
    return { version: DEFAULT_VERSION, status: 'active' };
  }

  /**
   * Compose the public list of enabled login providers.
   *
   * DB-backed provider configs (AuthProviderConfig) take precedence. When no
   * enabled DB config exists, we fall back to the deployment env keys so a
   * fresh install still exposes the expected providers.
   */
  async getProviders() {
    const dbProviders = await this._authProviderRepo.list();
    const enabledFromDb = dbProviders.filter((p) => p.enabled);

    if (enabledFromDb.length > 0) {
      return {
        providers: enabledFromDb.map((p) => ({
          provider: p.provider,
          displayName:
            p.displayName ||
            (p.provider === 'GENERIC'
              ? process.env.NEXT_PUBLIC_POSTMILL_OAUTH_DISPLAY_NAME || 'OIDC'
              : p.provider.charAt(0) + p.provider.slice(1).toLowerCase()),
          ...this._versionInfo(p.provider),
        })),
      };
    }

    const providers: {
      provider: string;
      displayName: string;
      version: string;
      status: string;
    }[] = [
      { provider: 'LOCAL', displayName: 'Email', ...this._versionInfo('LOCAL') },
    ];

    if (process.env.IS_GENERAL) {
      if (process.env.POSTMILL_GENERIC_OAUTH) {
        providers.push({
          provider: 'GENERIC',
          displayName:
            process.env.NEXT_PUBLIC_POSTMILL_OAUTH_DISPLAY_NAME || 'OIDC',
          ...this._versionInfo('GENERIC'),
        });
      } else {
        providers.push({
          provider: 'GOOGLE',
          displayName: 'Google',
          ...this._versionInfo('GOOGLE'),
        });
        if (process.env.NEYNAR_CLIENT_ID) {
          providers.push({
            provider: 'FARCASTER',
            displayName: 'Farcaster',
            ...this._versionInfo('FARCASTER'),
          });
        }
        if (process.env.STRIPE_PUBLISHABLE_KEY) {
          providers.push({
            provider: 'WALLET',
            displayName: 'Wallet',
            ...this._versionInfo('WALLET'),
          });
        }
      }
    } else {
      providers.push({
        provider: 'GITHUB',
        displayName: 'GitHub',
        ...this._versionInfo('GITHUB'),
      });
    }

    return { providers };
  }

  /**
   * Resolve an auth provider adapter from the kernel.
   *
   * The AuthProviderRepository is forwarded via ctx.extras so package adapters
   * can preserve the DB-config-first -> env-fallback credential precedence;
   * ioRedis is forwarded for adapters that need it (e.g. the wallet nonce store).
   */
  getProvider(provider: string, version?: string): AuthProviderAbstract {
    const resolvedVersion = version ?? DEFAULT_VERSION;
    // Kernel provider ids are lowercase; callers pass the uppercase Prisma
    // Provider enum (e.g. GITHUB), so normalise before kernel lookups.
    const providerId = provider.toLowerCase();

    const mod = this._kernel.resolveForRead(
      'auth',
      providerId,
      resolvedVersion
    );
    const ctx = this._runtimeContext.build({
      extras: { authProviderRepo: this._authProviderRepo, redis: ioRedis },
    });
    return mod.create(ctx) as unknown as AuthProviderAbstract;
  }
}

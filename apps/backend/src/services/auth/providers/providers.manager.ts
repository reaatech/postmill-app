import { Inject, Injectable, Optional } from '@nestjs/common';
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
    @Optional() private _authProviderRepo?: AuthProviderRepository
  ) {}

  getProvider(provider: string, version?: string): AuthProviderAbstract {
    const resolvedVersion = version ?? DEFAULT_VERSION;
    // Kernel provider ids are lowercase; callers pass the uppercase Prisma
    // Provider enum (e.g. GITHUB), so normalise before kernel lookups.
    const providerId = provider.toLowerCase();

    // Resolve the auth module from the provider kernel. The AuthProviderRepository
    // is forwarded via ctx.extras so the package adapters can preserve the
    // DB-config-first → env-fallback credential precedence; ioRedis is forwarded
    // for adapters that need it (e.g. the wallet nonce store).
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

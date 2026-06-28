import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProviderKernel } from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { FeatureFlagsService } from '@gitroom/nestjs-libraries/feature-flags';
import { providerModules } from './providers.generated';

@Injectable()
export class ProvidersBootstrap implements OnModuleInit {
  private readonly _logger = new Logger(ProvidersBootstrap.name);

  constructor(
    @Inject(PROVIDER_KERNEL) private readonly _kernel: ProviderKernel,
    private readonly _featureFlags: FeatureFlagsService,
  ) {}

  onModuleInit() {
    const domainFlag = (domain: string): boolean => {
      switch (domain) {
        case 'ai':
          return this._featureFlags.isEnabled('ai');
        case 'media':
          return this._featureFlags.isEnabled('media');
        case 'shortlink':
          return this._featureFlags.isEnabled('shortlinks');
        case 'social':
        case 'storage':
        case 'vpn':
        case 'contentpack':
        case 'email':
        case 'auth':
          return true;
        default:
          return true;
      }
    };

    // The ProviderKernel is the single resolution path for every domain. Each
    // provider package's module is registered by (domain, providerId, version);
    // domain services resolve through ProviderResolutionService. (The legacy
    // in-memory registries and the PROVIDER_KERNEL=legacy kill switch were
    // removed — the kernel is no longer optional.)
    for (const mod of providerModules) {
      const { domain } = mod.manifest;
      if (!domainFlag(domain)) {
        continue;
      }
      try {
        this._kernel.register(mod);
        this._logger.log(
          `Registered provider ${domain}/${mod.manifest.providerId}@${mod.manifest.version}`,
        );
      } catch (err) {
        this._logger.warn(
          `Failed to register ${domain}/${mod.manifest.providerId}@${mod.manifest.version}: ${(err as Error).message}`,
        );
      }
    }
  }
}

import {
  Controller,
  Get,
  HttpException,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  ProviderKernel,
  ProviderDomain,
  isProviderVerified,
} from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { PoliciesGuard } from '@gitroom/backend/services/auth/permissions/permissions.guard';

const DOMAINS: ProviderDomain[] = [
  'ai',
  'media',
  'shortlink',
  'vpn',
  'social',
  'storage',
  'email',
  'auth',
  'contentpack',
];

function isProviderDomain(value: string): value is ProviderDomain {
  return DOMAINS.includes(value as ProviderDomain);
}

@ApiTags('Providers')
@Controller('/providers')
export class ProvidersController {
  constructor(
    @Inject(PROVIDER_KERNEL) private readonly _kernel: ProviderKernel,
  ) {}

  @Get('/catalog')
  catalog(@Query('domain') domain?: string) {
    const manifests = this._kernel.listManifests(
      domain && isProviderDomain(domain) ? domain : undefined,
    );

    return manifests.map((m) => ({
      domain: m.domain,
      providerId: m.providerId,
      version: m.version,
      displayName: m.displayName,
      status: m.status,
      // Live-key verification: false = "built without a live key" (Beta badge).
      verified: isProviderVerified(m.domain, m.providerId),
      capabilities: m.capabilities,
      authType: m.authType,
      defaultDomain: m.defaultDomain,
      setupNotes: m.setupNotes,
      // Version-aware settings UI drives the credential form from the selected
      // version's fields and surfaces sunset timing on deprecated configs.
      credentialFields: m.credentialFields,
      deprecatedAt: m.deprecatedAt,
      sunsetAt: m.sunsetAt,
    }));
  }
}

@ApiTags('Admin Providers')
@Controller('/admin/providers')
@UseGuards(PoliciesGuard)
export class AdminProvidersController {
  constructor(
    @Inject(PROVIDER_KERNEL) private readonly _kernel: ProviderKernel,
  ) {}

  @Get('/health')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  health(@GetUserFromRequest() user: User, @Query('domain') domain?: string) {
    // Platform-wide provider health is super-admin-only. The @CheckPolicies ADMIN gate
    // above is the org billing-admin capability (PoliciesGuard → 402), NOT a super-admin
    // gate, so it must be backed by an explicit isSuperAdmin check (the same pattern as
    // AnnouncementsController / StorageController / AdminDefaultsController).
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 403);
    }

    const manifests = this._kernel.listManifests(
      domain && isProviderDomain(domain) ? domain : undefined,
    );

    return manifests.map((m) => {
      const mod = this._kernel.get(m.domain, m.providerId, m.version);
      return {
        domain: m.domain,
        providerId: m.providerId,
        version: m.version,
        status: m.status,
        health: mod?.health,
      };
    });
  }
}

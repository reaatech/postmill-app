import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  ProviderKernel,
  ProviderDomain,
  isProviderVerified,
} from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { FeaturedProviderService } from '@gitroom/nestjs-libraries/database/prisma/featured-providers/featured-provider.service';
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

class FeaturedProviderDto {
  @IsString()
  domain: string;

  @IsString()
  providerId: string;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

class FeaturedProviderRemoveDto {
  @IsString()
  domain: string;

  @IsString()
  providerId: string;
}

class FeaturedReorderEntryDto {
  @IsString()
  providerId: string;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

class FeaturedReorderDto {
  @IsString()
  domain: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FeaturedReorderEntryDto)
  entries: FeaturedReorderEntryDto[];
}

@ApiTags('Providers')
@Controller('/providers')
export class ProvidersController {
  constructor(
    @Inject(PROVIDER_KERNEL) private readonly _kernel: ProviderKernel,
    private readonly _featured: FeaturedProviderService,
  ) {}

  @Get('/catalog')
  async catalog(@Query('domain') domain?: string) {
    const manifests = this._kernel.listManifests(
      domain && isProviderDomain(domain) ? domain : undefined,
    );
    // Featured curation, keyed by `${domain}/${providerId}` (version-agnostic —
    // all version-entries of a featured provider carry the badge/order).
    const featured = await this._featured.getFeaturedKeyed(
      domain && isProviderDomain(domain) ? domain : undefined,
    );

    return manifests.map((m) => {
      const featuredKey = `${m.domain}/${m.providerId}`;
      return {
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
        // Localized provider description + website for the media-defaults surface.
        description: m.metadata?.description,
        website: m.metadata?.website,
        mediaCategories: m.metadata?.mediaCategories,
        // Platform-curated "featured" flag + order (super-admin managed).
        featured: featured.has(featuredKey),
        featuredSortOrder: featured.get(featuredKey) ?? null,
      };
    });
  }
}

@ApiTags('Admin Providers')
@Controller('/admin/providers')
@UseGuards(PoliciesGuard)
export class AdminProvidersController {
  constructor(
    @Inject(PROVIDER_KERNEL) private readonly _kernel: ProviderKernel,
    private readonly _featured: FeaturedProviderService,
  ) {}

  // Platform-wide provider admin is super-admin-only. The @CheckPolicies ADMIN gate
  // is the org billing-admin capability (PoliciesGuard → 402), NOT a super-admin gate,
  // so each handler must back it with an explicit isSuperAdmin check (the same pattern
  // as AnnouncementsController / StorageController / AdminDefaultsController).
  private _assertSuperAdmin(user: User) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 403);
    }
  }

  @Get('/health')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  health(@GetUserFromRequest() user: User, @Query('domain') domain?: string) {
    this._assertSuperAdmin(user);

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

  // ── Featured providers (super-admin curation) ──

  @Get('/featured')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  listFeatured(@GetUserFromRequest() user: User, @Query('domain') domain?: string) {
    this._assertSuperAdmin(user);
    return this._featured.list(domain);
  }

  @Post('/featured')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  upsertFeatured(@GetUserFromRequest() user: User, @Body() body: FeaturedProviderDto) {
    this._assertSuperAdmin(user);
    return this._featured.upsert(body.domain, body.providerId, body.sortOrder);
  }

  @Put('/featured/reorder')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  reorderFeatured(@GetUserFromRequest() user: User, @Body() body: FeaturedReorderDto) {
    this._assertSuperAdmin(user);
    return this._featured.reorder(body.domain, body.entries);
  }

  @Delete('/featured')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  removeFeatured(@GetUserFromRequest() user: User, @Body() body: FeaturedProviderRemoveDto) {
    this._assertSuperAdmin(user);
    return this._featured.remove(body.domain, body.providerId);
  }
}

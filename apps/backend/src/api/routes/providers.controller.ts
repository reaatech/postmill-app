import {
  BadRequestException,
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
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  ProviderKernel,
  ProviderDomain,
  isProviderDomain,
  isProviderVerified,
  PROVIDER_DOMAINS,
} from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { FeaturedProviderService } from '@gitroom/nestjs-libraries/database/prisma/featured-providers/featured-provider.service';
import { SuperAdminGuard } from '@gitroom/backend/services/auth/rbac/super-admin.guard';
import { AuthGuard } from '@gitroom/backend/services/auth/auth.guard';

// PROVIDER_REMEDIATION 3.3: `isProviderDomain` + the domain set are now a single
// source of truth exported from the kernel (`@gitroom/provider-kernel`), shared
// with `featured-provider.service.ts` — no local duplicate that could drift.

// PROVIDER_REMEDIATION 3.3: an invalid `?domain=` must fail closed with a 400 —
// previously an unknown value mapped to `undefined` and returned the full
// cross-domain catalog (fails open / info leak).
function resolveDomainFilter(domain?: string): ProviderDomain | undefined {
  if (domain === undefined || domain === '') return undefined;
  if (!isProviderDomain(domain)) {
    throw new BadRequestException(`Unknown provider domain: ${domain}`);
  }
  return domain;
}

export class FeaturedProviderDto {
  @IsString()
  @IsIn([...PROVIDER_DOMAINS])
  domain: string;

  @IsString()
  providerId: string;

  @IsInt()
  @Min(0)
  @Max(2147483647)
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
  @Max(2147483647)
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
  @UseGuards(AuthGuard)
  async catalog(@Query('domain') domain?: string) {
    const domainFilter = resolveDomainFilter(domain);
    const manifests = this._kernel.listManifests(domainFilter);
    // Featured curation, keyed by `${domain}/${providerId}` (version-agnostic —
    // all version-entries of a featured provider carry the badge/order).
    const featured = await this._featured.getFeaturedKeyed(domainFilter);

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
// PROVIDER_REMEDIATION 3.2 + 6.2: SuperAdminGuard is the class-level structural
// backstop. The redundant `@UseGuards(PoliciesGuard)` was removed — PoliciesGuard is
// already registered as a global APP_GUARD (it was running twice per request).
@UseGuards(SuperAdminGuard)
export class AdminProvidersController {
  constructor(
    @Inject(PROVIDER_KERNEL) private readonly _kernel: ProviderKernel,
    private readonly _featured: FeaturedProviderService,
  ) {}

  // Platform-wide provider admin is super-admin-only. SuperAdminGuard is the class-level
  // structural backstop, and each handler asserts isSuperAdmin explicitly (the same pattern
  // as AnnouncementsController / StorageController / AdminDefaultsController).
  private _assertSuperAdmin(user: User) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 403);
    }
  }

  @Get('/health')
  health(@GetUserFromRequest() user: User, @Query('domain') domain?: string) {
    this._assertSuperAdmin(user);

    const manifests = this._kernel.listManifests(resolveDomainFilter(domain));

    return manifests.map((m) => {
      // PROVIDER_REMEDIATION 4.6: health is kernel-owned (keyed by keyString), no
      // longer mutated onto the provider module — read it via kernel.getHealth.
      return {
        domain: m.domain,
        providerId: m.providerId,
        version: m.version,
        status: m.status,
        health: this._kernel.getHealth(m.domain, m.providerId, m.version),
      };
    });
  }

  // ── Featured providers (super-admin curation) ──

  @Get('/featured')
  listFeatured(@GetUserFromRequest() user: User, @Query('domain') domain?: string) {
    this._assertSuperAdmin(user);
    return this._featured.list(domain);
  }

  @Post('/featured')
  upsertFeatured(@GetUserFromRequest() user: User, @Body() body: FeaturedProviderDto) {
    this._assertSuperAdmin(user);
    return this._featured.upsert(body.domain, body.providerId, body.sortOrder);
  }

  @Put('/featured/reorder')
  reorderFeatured(@GetUserFromRequest() user: User, @Body() body: FeaturedReorderDto) {
    this._assertSuperAdmin(user);
    return this._featured.reorder(body.domain, body.entries);
  }

  @Delete('/featured')
  removeFeatured(@GetUserFromRequest() user: User, @Body() body: FeaturedProviderRemoveDto) {
    this._assertSuperAdmin(user);
    return this._featured.remove(body.domain, body.providerId);
  }
}

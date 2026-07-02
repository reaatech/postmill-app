import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { DefaultsSeedService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-seed.service';

import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { ProviderKernel } from '@gitroom/provider-kernel';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { MediaProviderAdapter } from '@gitroom/nestjs-libraries/media/media-provider-adapter.interface';

@ApiTags('Org Media Provider Settings')
@Controller('/settings/media')
export class MediaProviderController {
  constructor(
    private _orgMediaProviderSettings: OrgMediaProviderSettingsService,
    private _defaultsSeed: DefaultsSeedService,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel,
    private _resolution: ProviderResolutionService,
  ) {}

  private _bustDefaultsCatalogCache(orgId: string): void {
    // Best-effort cache invalidation; never fail the request if Redis is down.
    try {
      const prefix = `settings:content:media-defaults:catalog:${orgId}:`;
      ioRedis
        .keys(`${prefix}*`)
        .then((keys) => {
          if (keys.length) ioRedis.del(...keys);
        })
        .catch(() => undefined);
    } catch {}
  }

  // Resolve a media adapter through the kernel; null for an unknown provider
  // (mirrors the old in-memory registry get).
  private _resolveMedia(identifier: string): MediaProviderAdapter | null {
    try {
      return this._resolution.resolveMedia(identifier);
    } catch {
      return null;
    }
  }

  @Get('/providers')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async listProviders() {
    const seen = new Set<string>();
    const out: {
      identifier: string;
      name: string;
      capabilities: unknown;
      credentialFields: unknown;
    }[] = [];
    for (const manifest of this._kernel.listManifests('media')) {
      if (seen.has(manifest.providerId)) continue;
      seen.add(manifest.providerId);
      out.push({
        identifier: manifest.providerId,
        name: manifest.displayName,
        capabilities: manifest.capabilities,
        credentialFields: manifest.credentialFields ?? null,
      });
    }
    return out;
  }

  @Get('/config')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async getConfig(@GetOrgFromRequest() org: Organization) {
    const allConfigs = await this._orgMediaProviderSettings.getProviders(org.id);
    return { providers: allConfigs };
  }

  @Put('/config/:identifier')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async upsertConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body()
    body: {
      credentials?: Record<string, string>;
      version?: string;
      enabled?: boolean;
    },
  ) {
    const adapter = this._resolveMedia(identifier);
    if (!adapter) throw new BadRequestException('Unknown media provider');

    // OpenAI/MiniMax credentials live-link to the AI surface inside the service (§11.4).
    // `enabled` defaults to true (configuring enables); the kit's On/Off toggle sends
    // an explicit `{ enabled: false }` with no credentials to disable without clearing them.
    await this._orgMediaProviderSettings.upsert(org.id, identifier, {
      enabled: body.enabled ?? true,
      credentials: body.credentials,
      version: body.version,
    });

    // Eagerly seed any unset model/media defaults now that a media provider is available.
    this._defaultsSeed.seedUnset(org.id).catch(() => undefined);
    this._bustDefaultsCatalogCache(org.id);

    return { identifier, success: true };
  }

  @Put('/config/:identifier/storage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async setStorage(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body()
    body: {
      storageProviderId: string;
      storageRootFolderId?: string;
    },
  ) {
    const adapter = this._resolveMedia(identifier);
    if (!adapter) throw new BadRequestException('Unknown media provider');

    await this._orgMediaProviderSettings.upsert(org.id, identifier, {
      storageProviderId: body.storageProviderId,
      storageRootFolderId: body.storageRootFolderId,
    });

    this._bustDefaultsCatalogCache(org.id);
    return { identifier, success: true };
  }

  @Post('/config/:identifier/set-active')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async setActive(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: { version?: string },
  ) {
    const adapter = this._resolveMedia(identifier);
    if (!adapter) throw new BadRequestException('Unknown media provider');

    // "Make Primary" (plan §1.4/§2.4): clears the prior Primary's isActive and pins
    // this one — enable-many + one Primary. No longer disables the other enabled rows.
    try {
      const result = await this._orgMediaProviderSettings.setActive(
        org.id,
        identifier,
        body.version,
      );

      // Eagerly seed any unset model/media defaults now that the primary media provider changed.
      this._defaultsSeed.seedUnset(org.id).catch(() => undefined);
      this._bustDefaultsCatalogCache(org.id);

      return { identifier, success: true, isActive: result.isActive };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('/config/:identifier/test')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async testConnection(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: { credentials?: Record<string, string> },
  ) {
    const adapter = this._resolveMedia(identifier);
    if (!adapter) throw new BadRequestException('Unknown media provider');

    if (body.credentials) {
      try {
        const result = await adapter.generateImage('test', { credentials: body.credentials });
        return { ok: true, message: 'Connection successful', result };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    try {
      return await this._orgMediaProviderSettings.testConnection(org.id, identifier);
    } catch (err) {
      throw new HttpException(
        (err as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('/config/:identifier')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
  ) {
    await this._orgMediaProviderSettings.delete(org.id, identifier);
    this._bustDefaultsCatalogCache(org.id);
    return { success: true };
  }

}

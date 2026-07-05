import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OrgContentPackSettingsService } from '@gitroom/nestjs-libraries/database/prisma/content-packs/org-content-pack-settings.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import {
  ContentPackMeta,
  manifestToContentPackMeta,
} from '@gitroom/nestjs-libraries/media/stock/content-packs/content-pack.registry';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import {
  UpsertContentPackConfigDto,
  ProviderTestConnectionDto,
} from '@gitroom/nestjs-libraries/dtos/providers/provider-config.dtos';

@ApiTags('Org Content Pack Settings')
@Controller('/settings/content-packs')
@UseGuards(OrgRbacGuard)
export class ContentPackController {
  constructor(
    private _orgContentPackSettings: OrgContentPackSettingsService,
    private _resolution: ProviderResolutionService
  ) {}

  @Get('/providers')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listProviders() {
    return this.#listMeta().map((meta) => ({
      identifier: meta.identifier,
      name: meta.name,
      capabilities: meta.capabilities,
      credentialFields: meta.credentialFields,
    }));
  }

  @Get('/config')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getConfig(@GetOrgFromRequest() org: Organization) {
    const providers = await this._orgContentPackSettings.getProviders(org.id);
    const active = await this._orgContentPackSettings.getActive(org.id);
    // Never return decrypted credentials to the client.
    const activeMeta = active ? this.#meta(active.identifier) : undefined;
    const safeActive = active
      ? {
          identifier: active.identifier,
          name: activeMeta?.name || active.identifier,
          capabilities: activeMeta?.capabilities || [],
        }
      : null;
    return {
      active: safeActive,
      providers,
    };
  }

  @Put('/config/:identifier')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async upsertConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: UpsertContentPackConfigDto
  ) {
    if (!this.#meta(identifier)) {
      throw new BadRequestException('Unknown content pack provider');
    }

    await this._orgContentPackSettings.upsert(org.id, identifier, {
      credentials: body.credentials,
      extraConfig: body.extraConfig,
    });

    return { identifier, success: true };
  }

  @Post('/config/:identifier/set-active')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async setActive(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string
  ) {
    try {
      await this._orgContentPackSettings.setActive(org.id, identifier);
      return { identifier, isActive: true };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Post('/deactivate')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deactivate(@GetOrgFromRequest() org: Organization) {
    await this._orgContentPackSettings.setActive(org.id, null);
    return { isActive: false };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('/config/:identifier/test')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async testConnection(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: ProviderTestConnectionDto
  ) {
    const meta = this.#meta(identifier);
    if (!meta) {
      throw new BadRequestException('Unknown content pack provider');
    }

    if (body.credentials?.apiKey) {
      try {
        const pack = this._resolution.resolveContentPack(identifier, {
          credentials: body.credentials,
          orgId: org.id,
        });
        const result = await pack.search(meta.capabilities[0], 'test', 1);
        return { ok: true, message: 'Connection successful', result };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    try {
      return await this._orgContentPackSettings.testConnection(org.id, identifier);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('/config/:identifier')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string
  ) {
    await this._orgContentPackSettings.delete(org.id, identifier);
    return { success: true };
  }

  #listMeta(): ContentPackMeta[] {
    return this._resolution
      .listManifests('contentpack')
      .map(manifestToContentPackMeta);
  }

  #meta(identifier: string): ContentPackMeta | undefined {
    return this.#listMeta().find((m) => m.identifier === identifier);
  }
}

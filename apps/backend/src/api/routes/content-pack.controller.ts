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
import { MagnificContentPack } from '@gitroom/nestjs-libraries/media/stock/content-packs/magnific.content-pack';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

@ApiTags('Org Content Pack Settings')
@Controller('/settings/content-packs')
@UseGuards(OrgRbacGuard)
export class ContentPackController {
  constructor(private _orgContentPackSettings: OrgContentPackSettingsService) {}

  @Get('/providers')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listProviders() {
    return [
      {
        identifier: 'magnific',
        name: 'Magnific',
        capabilities: ['photos', 'vectors', 'icons', 'videos'],
        credentialFields: [{ key: 'apiKey', label: 'API Key', required: true }],
      },
    ];
  }

  @Get('/config')
  @RequirePermission('media-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getConfig(@GetOrgFromRequest() org: Organization) {
    const providers = await this._orgContentPackSettings.getProviders(org.id);
    const active = await this._orgContentPackSettings.getActive(org.id);
    // Never return decrypted credentials to the client.
    const safeActive = active
      ? { identifier: active.identifier, capabilities: ['photos', 'vectors', 'icons', 'videos'] }
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
    @Body() body: { credentials?: Record<string, string>; extraConfig?: Record<string, any> }
  ) {
    if (identifier !== 'magnific') {
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
    @Body() body: { credentials?: Record<string, string> }
  ) {
    if (identifier !== 'magnific') {
      throw new BadRequestException('Unknown content pack provider');
    }

    if (body.credentials?.apiKey) {
      const pack = new MagnificContentPack(body.credentials.apiKey);
      try {
        const result = await pack.search('photos', 'test', 1);
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
}

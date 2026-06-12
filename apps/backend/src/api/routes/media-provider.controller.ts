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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { MediaProviderRegistry } from '@gitroom/nestjs-libraries/media/media-provider.registry';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Org Media Provider Settings')
@Controller('/settings/media')
export class MediaProviderController {
  constructor(
    private _orgMediaProviderSettings: OrgMediaProviderSettingsService,
    private _registry: MediaProviderRegistry,
  ) {}

  @Get('/providers')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async listProviders() {
    const adapters = this._registry.getAll();
    return adapters.map((adapter) => ({
      identifier: adapter.identifier,
      name: adapter.name,
      capabilities: adapter.capabilities,
    }));
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
    },
  ) {
    const adapter = this._registry.get(identifier);
    if (!adapter) throw new BadRequestException('Unknown media provider');

    // OpenAI/MiniMax credentials live-link to the AI surface inside the service (§11.4).
    await this._orgMediaProviderSettings.upsert(org.id, identifier, {
      enabled: true,
      credentials: body.credentials,
    });

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
    const adapter = this._registry.get(identifier);
    if (!adapter) throw new BadRequestException('Unknown media provider');

    await this._orgMediaProviderSettings.upsert(org.id, identifier, {
      storageProviderId: body.storageProviderId,
      storageRootFolderId: body.storageRootFolderId,
    });

    return { identifier, success: true };
  }

  @Post('/config/:identifier/set-active')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @RequirePermission('media-config', 'manage')
  async setActive(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
  ) {
    const adapter = this._registry.get(identifier);
    if (!adapter) throw new BadRequestException('Unknown media provider');

    await this._orgMediaProviderSettings.upsert(org.id, identifier, {
      enabled: true,
    });

    return { identifier, success: true };
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
    const adapter = this._registry.get(identifier);
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
    return { success: true };
  }
}

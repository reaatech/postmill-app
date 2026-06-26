import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Post,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OrgProviderConfigService } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/org-provider-config.service';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { PROVIDER_CAPABILITIES } from '@gitroom/nestjs-libraries/integrations/social/provider-capabilities';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

interface ChannelConfigBody {
  name?: string;
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string;
  additionalConfig?: string;
  setupNotes?: string;
}

function validateBody(body: ChannelConfigBody) {
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    throw new BadRequestException('enabled must be a boolean');
  }
  for (const key of ['name', 'clientId', 'clientSecret', 'redirectUri', 'scopes', 'setupNotes', 'additionalConfig'] as const) {
    if (body[key] !== undefined && typeof body[key] !== 'string') {
      throw new BadRequestException(`${key} must be a string`);
    }
  }
  if (body.additionalConfig) {
    try {
      JSON.parse(body.additionalConfig);
    } catch {
      throw new BadRequestException('additionalConfig must be valid JSON');
    }
  }
}

@ApiTags('Channel Config')
@Controller('/channels/config')
export class ChannelConfigPerTenantController {
  constructor(
    private _orgProviderConfigService: OrgProviderConfigService,
    private _orgProviderConfigManager: OrgProviderConfigManager,
  ) {}

  // Static provider catalog — used by the "Add channel" picker. Declared before
  // the `/:id` routes so it isn't captured as an id.
  @Get('/providers')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listProviders() {
    return socialIntegrationList.map((p) => ({
      identifier: p.identifier,
      name: p.name,
      description: p.toolTip || '',
      isExternal: !!p.externalUrl,
      isWeb3: !!p.isWeb3,
      isChromeExtension: !!p.isChromeExtension,
      customFields: !!p.customFields,
      scopes: p.scopes?.join(', ') || '',
      capabilities: PROVIDER_CAPABILITIES[p.identifier] || null,
    }));
  }

  // The org's named credential-config instances (the list rows).
  @Get('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listConfigs(@GetOrgFromRequest() org: Organization) {
    const configs = await this._orgProviderConfigService.getConfigs(org.id);
    return configs.map((c) => ({
      ...c,
      capabilities: PROVIDER_CAPABILITIES[c.identifier] || null,
    }));
  }

  @Get('/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const config = await this._orgProviderConfigService.getConfigById(org.id, id);
    if (!config) {
      throw new BadRequestException('Channel config not found');
    }
    return {
      ...config,
      capabilities: PROVIDER_CAPABILITIES[config.identifier] || null,
    };
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async createConfig(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: ChannelConfigBody & { identifier?: string }
  ) {
    validateBody(body);
    if (!body.identifier || typeof body.identifier !== 'string') {
      throw new BadRequestException('identifier is required');
    }
    if (!socialIntegrationList.find((p) => p.identifier === body.identifier)) {
      throw new BadRequestException('Unknown provider');
    }
    if (!body.name?.trim()) {
      throw new BadRequestException('A channel name is required');
    }

    const result = await this._orgProviderConfigService.createConfig(
      org.id,
      {
        identifier: body.identifier,
        name: body.name,
        enabled: body.enabled ?? false,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        redirectUri: body.redirectUri,
        scopes: body.scopes,
        additionalConfig: body.additionalConfig,
        setupNotes: body.setupNotes,
      },
      user.id
    );

    this._orgProviderConfigManager.invalidateOrg(org.id);
    return result;
  }

  @Put('/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async saveConfig(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: ChannelConfigBody
  ) {
    validateBody(body);

    const result = await this._orgProviderConfigService.updateConfig(
      org.id,
      id,
      {
        name: body.name,
        enabled: body.enabled,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        redirectUri: body.redirectUri,
        scopes: body.scopes,
        additionalConfig: body.additionalConfig,
        setupNotes: body.setupNotes,
      },
      user.id
    );

    this._orgProviderConfigManager.invalidateOrg(org.id);
    return result;
  }

  @Delete('/:id')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    await this._orgProviderConfigService.deleteConfig(org.id, id, user.id);
    this._orgProviderConfigManager.invalidateOrg(org.id);
    return { success: true };
  }

  @Post('/:id/test')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async testConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._orgProviderConfigService.testConnection(org.id, id);
  }
}

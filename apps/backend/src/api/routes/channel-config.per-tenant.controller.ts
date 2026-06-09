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
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@ApiTags('Channel Config')
@Controller('/channels/config')
export class ChannelConfigPerTenantController {
  constructor(
    private _orgProviderConfigService: OrgProviderConfigService,
    private _orgProviderConfigManager: OrgProviderConfigManager,
    private _integrationService: IntegrationService
  ) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listConfigs(@GetOrgFromRequest() org: Organization) {
    const dbConfigs = await this._orgProviderConfigService.getConfigs(org.id);
    const dbConfigMap = new Map(dbConfigs.map((c) => [c.identifier, c]));

    return socialIntegrationList.map((p) => {
      const dbConfig = dbConfigMap.get(p.identifier);
      return {
        identifier: p.identifier,
        name: p.name,
        description: p.toolTip || '',
        enabled: dbConfig?.enabled || false,
        isConfigured: dbConfig?.isConfigured || false,
        setupNotes: dbConfig?.setupNotes || '',
        isExternal: !!p.externalUrl,
        isWeb3: !!p.isWeb3,
        isChromeExtension: !!p.isChromeExtension,
        customFields: !!p.customFields,
        scopes: p.scopes?.join(', ') || '',
        redirectUri: dbConfig?.redirectUri || '',
        updatedAt: dbConfig?.updatedAt || null,
      };
    });
  }

  @Get('/health')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getHealth(@GetOrgFromRequest() org: Organization) {
    const [integrations, configs] = await Promise.all([
      this._integrationService.getIntegrationsForHealth(org.id),
      this._orgProviderConfigService.getConfigs(org.id),
    ]);

    const configMap = new Map(configs.map((c) => [c.identifier, c]));
    const now = new Date();

    return integrations.map((integration) => {
      const config = configMap.get(integration.providerIdentifier);
      const tokenExpired = integration.tokenExpiration
        ? new Date(integration.tokenExpiration) < now
        : false;

      return {
        id: integration.id,
        name: integration.name,
        provider: integration.providerIdentifier,
        picture: integration.picture,
        disabled: integration.disabled,
        configured: config?.isConfigured || false,
        providerEnabled: config?.enabled || false,
        tokenExpired,
        refreshNeeded: integration.refreshNeeded,
      };
    });
  }

  @Get('/:identifier')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string
  ) {
    const configs = await this._orgProviderConfigService.getConfigs(org.id);
    const config = configs.find((c) => c.identifier === identifier);
    const provider = socialIntegrationList.find((p) => p.identifier === identifier);

    return {
      identifier,
      name: provider?.name || identifier,
      enabled: config?.enabled || false,
      isConfigured: config?.isConfigured || false,
      redirectUri: config?.redirectUri || '',
      scopes: config?.scopes || provider?.scopes?.join(', ') || '',
      setupNotes: config?.setupNotes || '',
      isExternal: !!provider?.externalUrl,
      isWeb3: !!provider?.isWeb3,
      isChromeExtension: !!provider?.isChromeExtension,
      customFields: !!provider?.customFields,
      updatedAt: config?.updatedAt || null,
    };
  }

  @Put('/:identifier')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async saveConfig(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('identifier') identifier: string,
    @Body()
    body: {
      enabled: boolean;
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
      scopes?: string;
      additionalConfig?: string;
      setupNotes?: string;
    }
  ) {
    if (typeof body.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    if (body.clientId !== undefined && typeof body.clientId !== 'string') {
      throw new BadRequestException('clientId must be a string');
    }
    if (body.clientSecret !== undefined && typeof body.clientSecret !== 'string') {
      throw new BadRequestException('clientSecret must be a string');
    }
    if (body.redirectUri !== undefined && typeof body.redirectUri !== 'string') {
      throw new BadRequestException('redirectUri must be a string');
    }
    if (body.scopes !== undefined && typeof body.scopes !== 'string') {
      throw new BadRequestException('scopes must be a string');
    }
    if (body.setupNotes !== undefined && typeof body.setupNotes !== 'string') {
      throw new BadRequestException('setupNotes must be a string');
    }
    if (body.additionalConfig !== undefined && typeof body.additionalConfig !== 'string') {
      throw new BadRequestException('additionalConfig must be a string');
    }
    if (body.additionalConfig) {
      try {
        JSON.parse(body.additionalConfig);
      } catch {
        throw new BadRequestException('additionalConfig must be valid JSON');
      }
    }

    const provider = socialIntegrationList.find((p) => p.identifier === identifier);
    if (!provider) {
      throw new BadRequestException('Unknown provider');
    }

    if (body.enabled) {
      const hasNewClientId =
        body.clientId !== undefined &&
        typeof body.clientId === 'string' &&
        body.clientId.trim().length > 0;

      if (!hasNewClientId) {
        const existingCredentials =
          await this._orgProviderConfigService.getCredentials(
            org.id,
            identifier
          );

        if (!existingCredentials?.clientId?.trim()) {
          throw new BadRequestException(
            'A provider must be configured with credentials before it can be enabled.'
          );
        }
      }
    }

    const result = await this._orgProviderConfigService.upsert(org.id, identifier, {
      name: provider.name,
      enabled: body.enabled,
      clientId: body.clientId !== undefined ? body.clientId : undefined,
      clientSecret: body.clientSecret !== undefined ? body.clientSecret : undefined,
      redirectUri: body.redirectUri !== undefined ? body.redirectUri : undefined,
      scopes: body.scopes !== undefined ? body.scopes : undefined,
      additionalConfig: body.additionalConfig !== undefined ? body.additionalConfig : undefined,
      setupNotes: body.setupNotes !== undefined ? body.setupNotes : undefined,
    }, user.id);

    this._orgProviderConfigManager.invalidateOrg(org.id);

    return result;
  }

  @Delete('/:identifier')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('identifier') identifier: string
  ) {
    await this._orgProviderConfigService.delete(org.id, identifier, user.id);
    this._orgProviderConfigManager.invalidateOrg(org.id);
    return { success: true };
  }

  @Post('/:identifier/test')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async testConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string
  ) {
    return this._orgProviderConfigService.testConnection(org.id, identifier);
  }
}

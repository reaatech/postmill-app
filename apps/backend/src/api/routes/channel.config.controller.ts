import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { ProviderConfigService } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/provider-config.service';
import { ProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/provider-config.manager';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { Prisma } from '@prisma/client';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';

@ApiTags('Channel Config')
@Controller('/admin/channel-configs')
@UseGuards(OrgRbacGuard)
export class ChannelConfigController {
  constructor(
    private _providerConfigService: ProviderConfigService,
    private _providerConfigManager: ProviderConfigManager,
    private _integrationManager: IntegrationManager
  ) {}

  @Get('/')
  @RequirePermission('channels', 'manage')
  async listConfigs(@GetUserFromRequest() user: User) {
    const dbConfigs = await this._providerConfigService.getAll();
    const dbConfigMap = new Map(dbConfigs.map((c) => [c.identifier, c]));

    return this._integrationManager.getSocialProviders().map((p) => {
      const dbConfig = dbConfigMap.get(p.identifier);
      const isConfigured = dbConfig
        ? (() => {
            try {
              const d = this._providerConfigService.decryptConfig(dbConfig);
              return !!(d.clientId || d.clientSecret);
            } catch (err) {
              console.warn(`Failed to decrypt config for ${p.identifier}, treating as unconfigured`, err);
              return false;
            }
          })()
        : false;

      return {
        identifier: p.identifier,
        name: p.name,
        description: p.toolTip || '',
        enabled: dbConfig?.enabled || false,
        isConfigured,
        setupInstructions: dbConfig?.setupInstructions || '',
        additionalConfig: dbConfig?.additionalConfig || '',
        isExternal: !!p.externalUrl,
        isWeb3: !!p.isWeb3,
        isChromeExtension: !!p.isChromeExtension,
        customFields: !!p.customFields,
        scopes: p.scopes?.join(', ') || '',
      };
    });
  }

  @Get('/:identifier')
  @RequirePermission('channels', 'manage')
  async getConfig(
    @GetUserFromRequest() user: User,
    @Param('identifier') identifier: string
  ) {
    const config = await this._providerConfigService.getByIdentifier(
      identifier
    );

    const provider =
      this._integrationManager.getSocialIntegrationUnchecked(identifier);

    return {
      identifier,
      name: provider?.name || identifier,
      enabled: config?.enabled || false,
      redirectUri: config?.redirectUri || '',
      scopes: config?.scopes || provider?.scopes?.join(', ') || '',
      setupInstructions: config?.setupInstructions || '',
      isConfigured: config
        ? (() => { const d = this._providerConfigService.decryptConfig(config); return !!(d.clientId || d.clientSecret); })()
        : false,
      additionalConfig: config?.additionalConfig || '',
      isExternal: !!provider?.externalUrl,
      isWeb3: !!provider?.isWeb3,
      isChromeExtension: !!provider?.isChromeExtension,
      customFields: !!provider?.customFields,
    };
  }

  @Put('/:identifier')
  @RequirePermission('channels', 'manage')
  async saveConfig(
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
      setupInstructions?: string;
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
    if (body.setupInstructions !== undefined && typeof body.setupInstructions !== 'string') {
      throw new BadRequestException('setupInstructions must be a string');
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
    const provider =
      this._integrationManager.getSocialIntegrationUnchecked(identifier);
    if (!provider) {
      throw new BadRequestException('Unknown provider');
    }

    const result = await this._providerConfigService.upsert(identifier, {
      name: provider.name,
      enabled: body.enabled,
      clientId: body.clientId !== undefined ? body.clientId : undefined,
      clientSecret: body.clientSecret !== undefined ? body.clientSecret : undefined,
      redirectUri: body.redirectUri !== undefined ? body.redirectUri : undefined,
      scopes: body.scopes !== undefined ? body.scopes : undefined,
      additionalConfig: body.additionalConfig !== undefined ? body.additionalConfig : undefined,
      setupInstructions: body.setupInstructions !== undefined ? body.setupInstructions : undefined,
    });

    try {
      await this._providerConfigManager.refreshCache();
    } catch (err) {
      console.warn('Failed to refresh cache after config upsert, stale cache will self-correct', err);
    }

    const decrypted = this._providerConfigService.decryptConfig(result);
    return {
      identifier: result.identifier,
      name: result.name,
      enabled: result.enabled,
      isConfigured: !!(decrypted.clientId || decrypted.clientSecret),
      redirectUri: result.redirectUri,
      scopes: result.scopes,
      additionalConfig: result.additionalConfig,
      setupInstructions: result.setupInstructions,
    };
  }

  @Delete('/:identifier')
  @RequirePermission('channels', 'manage')
  async deleteConfig(
    @GetUserFromRequest() user: User,
    @Param('identifier') identifier: string
  ) {

    const config = await this._providerConfigService.getByIdentifier(
      identifier
    );
    if (!config) {
      return { success: true, message: 'Already deleted' };
    }

    try {
      await this._providerConfigService.delete(identifier);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return { success: true, message: 'Already deleted' };
      }
      throw err;
    }

    try {
      await this._providerConfigManager.refreshCache();
    } catch (err) {
      console.warn('Failed to refresh cache after config delete, stale cache will self-correct', err);
    }
    return { success: true };
  }
}

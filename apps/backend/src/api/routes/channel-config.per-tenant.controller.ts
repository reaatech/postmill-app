import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
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
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  PROVIDER_CAPABILITIES,
  ProviderCapability,
} from '@gitroom/nestjs-libraries/integrations/social/provider-capabilities';
import { ProviderKernel } from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

interface ChannelVpnSelectionBody {
  enabled: boolean;
  identifier?: string;
  regionId?: string;
  vpnVersion?: string;
}

interface ChannelConfigBody {
  name?: string;
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string;
  additionalConfig?: string;
  setupNotes?: string;
  vpnSelection?: ChannelVpnSelectionBody | null;
  version?: string;
}

function validateBody(body: ChannelConfigBody) {
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    throw new BadRequestException('enabled must be a boolean');
  }
  for (const key of ['name', 'clientId', 'clientSecret', 'redirectUri', 'scopes', 'setupNotes', 'additionalConfig', 'version'] as const) {
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
  if (body.vpnSelection !== undefined && body.vpnSelection !== null) {
    const v = body.vpnSelection;
    if (typeof v !== 'object' || typeof v.enabled !== 'boolean') {
      throw new BadRequestException('vpnSelection.enabled must be a boolean');
    }
    for (const key of ['identifier', 'regionId', 'vpnVersion'] as const) {
      if (v[key] !== undefined && typeof v[key] !== 'string') {
        throw new BadRequestException(`vpnSelection.${key} must be a string`);
      }
    }
  }
}

@ApiTags('Channel Config')
@Controller('/channels/config')
export class ChannelConfigPerTenantController {
  constructor(
    private _orgProviderConfigService: OrgProviderConfigService,
    private _orgProviderConfigManager: OrgProviderConfigManager,
    private _integrationManager: IntegrationManager,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel,
  ) {}

  // Source the per-provider capability row from the kernel's social manifests
  // (manifest.capabilities owns the matrix). Falls back to the static
  // PROVIDER_CAPABILITIES object when the kernel has no usable manifest for the
  // provider (e.g. an unknown/unregistered identifier). Returns null for unknown
  // providers to preserve the existing response shape.
  private capabilitiesFor(identifier: string): ProviderCapability | null {
    try {
      const manifest = this._kernel
        .listManifests('social')
        .find((m) => m.providerId === identifier);
      const caps = manifest?.capabilities as ProviderCapability | undefined;
      if (caps && Object.keys(caps).length > 0) {
        return caps;
      }
    } catch {
      // Kernel unavailable — fall through to the static matrix.
    }
    return PROVIDER_CAPABILITIES[identifier] || null;
  }

  // Static provider catalog — used by the "Add channel" picker. Declared before
  // the `/:id` routes so it isn't captured as an id.
  @Get('/providers')
  @RequirePermission('channels', 'manage')
  async listProviders() {
    return this._integrationManager.getSocialProviders().map((p) => ({
      identifier: p.identifier,
      name: p.name,
      description: p.toolTip || '',
      isExternal: !!p.externalUrl,
      isWeb3: !!p.isWeb3,
      isChromeExtension: !!p.isChromeExtension,
      customFields: !!p.customFields,
      scopes: p.scopes?.join(', ') || '',
      capabilities: this.capabilitiesFor(p.identifier),
    }));
  }

  // The org's named credential-config instances (the list rows).
  @Get('/')
  @RequirePermission('channels', 'manage')
  async listConfigs(@GetOrgFromRequest() org: Organization) {
    const configs = await this._orgProviderConfigService.getConfigs(org.id);
    return configs.map((c) => ({
      ...c,
      capabilities: this.capabilitiesFor(c.identifier),
    }));
  }

  @Get('/:id')
  @RequirePermission('channels', 'manage')
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
      capabilities: this.capabilitiesFor(config.identifier),
    };
  }

  @Post('/')
  @RequirePermission('channels', 'manage')
  async createConfig(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: ChannelConfigBody & { identifier?: string }
  ) {
    validateBody(body);
    if (!body.identifier || typeof body.identifier !== 'string') {
      throw new BadRequestException('identifier is required');
    }
    if (!this._integrationManager.getSocialIntegrationUnchecked(body.identifier)) {
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
        vpnSelection: body.vpnSelection,
        version: body.version,
      },
      user.id
    );

    this._orgProviderConfigManager.invalidateOrg(org.id);
    return result;
  }

  @Put('/:id')
  @RequirePermission('channels', 'manage')
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
        vpnSelection: body.vpnSelection,
        version: body.version,
      },
      user.id
    );

    this._orgProviderConfigManager.invalidateOrg(org.id);
    return result;
  }

  @Delete('/:id')
  @RequirePermission('channels', 'manage')
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
  @RequirePermission('channels', 'manage')
  async testConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._orgProviderConfigService.testConnection(org.id, id);
  }
}

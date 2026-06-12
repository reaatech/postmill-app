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
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { OrgAiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service';
import { AIProviderRegistry } from '@gitroom/nestjs-libraries/ai/ai-provider.registry';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ProviderConfigDto } from '@gitroom/nestjs-libraries/types/provider-config.types';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

export type ProviderConfigSummary = Pick<
  ProviderConfigDto,
  'identifier' | 'name' | 'enabled' | 'isActive'
>;

@ApiTags('Org AI Settings')
@Controller('/settings/ai')
export class OrgAiSettingsController {
  constructor(
    private _orgAiSettings: OrgAiSettingsService,
    private _registry: AIProviderRegistry,
  ) {}

  @Get('/providers')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listProviders() {
    const adapters = this._registry.list();
    return adapters.map((adapter) => ({
      identifier: adapter.identifier,
      name: adapter.name,
      type: adapter.type,
      capabilities: adapter.capabilities,
      privacy: adapter.privacy,
      credentialFields: adapter.credentialFields,
    }));
  }

  @Get('/config')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getConfig(@GetOrgFromRequest() org: Organization): Promise<{
    active: ProviderConfigSummary | null;
    providers: ProviderConfigSummary[];
  }> {
    const active = await this._orgAiSettings.getActiveProvider(org.id);
    const allConfigs = await this._orgAiSettings.getProviders(org.id);
    // Never ship decrypted provider credentials to the client (#53). The active
    // provider's credentials stay server-side for model resolution only.
    const safeActive = active
      ? (({ credentials, ...rest }) => rest)(active as any)
      : null;
    return {
      active: safeActive,
      providers: allConfigs,
    };
  }

  @Put('/config/:identifier')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async upsertConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body()
    body: {
      credentials?: Record<string, string>;
      defaultModel?: string;
      reasoningModel?: string;
    },
  ) {
    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) throw new BadRequestException('Unknown provider');

    await this._orgAiSettings.upsert(org.id, identifier, {
      enabled: true,
      credentials: body.credentials,
      defaultModel: body.defaultModel,
      reasoningModel: body.reasoningModel,
    });

    return { identifier, success: true };
  }

  @Post('/config/:identifier/set-active')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async setActive(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
  ) {
    try {
      const result = await this._orgAiSettings.setActive(org.id, identifier);
      return { identifier, isActive: result.isActive };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('/config/:identifier/test')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async testConnection(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: { credentials?: Record<string, string> },
  ) {
    const adapter = this._registry.getAdapter(identifier);
    if (!adapter) throw new BadRequestException('Unknown provider');

    if (body.credentials) {
      return adapter.validateCredentials(body.credentials);
    }

    try {
      return await this._orgAiSettings.testConnection(org.id, identifier);
    } catch (err) {
      throw new HttpException(
        (err as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('/config/:identifier')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
  ) {
    await this._orgAiSettings.delete(org.id, identifier);
    return { success: true };
  }

  @Get('/spend')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getSpend(
    @GetOrgFromRequest() org: Organization,
    @Query('scope') scope?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedOffset = offset ? Math.max(0, parseInt(offset, 10)) : 0;
    const parsedLimit = limit ? Math.min(1000, Math.max(1, parseInt(limit, 10))) : 100;
    return this._orgAiSettings.getSpend(org.id, scope, parsedLimit, parsedOffset);
  }

  @Get('/budget')
  @RequirePermission('settings', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getBudget(@GetOrgFromRequest() org: Organization) {
    const budget = await this._orgAiSettings.getBudget(org.id);
    return budget || {};
  }

  @Put('/budget')
  @RequirePermission('settings', 'update')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateBudget(
    @GetOrgFromRequest() org: Organization,
    @Body()
    body: {
      monthlyCap?: number;
      dailyCap?: number;
      alertThresholdPct?: number;
      enabled?: boolean;
    },
  ) {
    await this._orgAiSettings.updateBudget(org.id, body);
    return { success: true };
  }
}

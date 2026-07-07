import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { isAllowedReturnUrl } from '@gitroom/nestjs-libraries/security/return-url.validator';
import { Organization, User } from '@prisma/client';
import { IntegrationFunctionDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.function.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { CampaignsService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.service';
import { ConnectProviderDto } from '@gitroom/nestjs-libraries/dtos/integrations/connect-provider.dto';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { UpdateProviderSettingsDto } from '@gitroom/nestjs-libraries/dtos/integrations/update-provider-settings.dto';
import { ChannelIdBodyDto } from '@gitroom/nestjs-libraries/dtos/integrations/channel-id-body.dto';
import { PlugActivationDto } from '@gitroom/nestjs-libraries/dtos/integrations/plug-activation.dto';
import { TelegramUpdatesQueryDto } from '@gitroom/nestjs-libraries/dtos/integrations/telegram-updates-query.dto';
import { UpdateIntegrationGroupDto } from '@gitroom/nestjs-libraries/dtos/integrations/update-integration-group.dto';
import { UpdateOnCustomerNameDto } from '@gitroom/nestjs-libraries/dtos/integrations/update-on-customer-name.dto';
import { SetNicknameDto } from '@gitroom/nestjs-libraries/dtos/integrations/set-nickname.dto';
import { ParseCuidPipe } from '@gitroom/nestjs-libraries/pipes/parse-cuid.pipe';
import { MoltbookRegisterDto } from '@gitroom/nestjs-libraries/dtos/integrations/moltbook-register.dto';
import { MoltbookStatusQueryDto } from '@gitroom/nestjs-libraries/dtos/integrations/moltbook-status-query.dto';

import { timer } from '@gitroom/helpers/utils/timer';
import { TelegramProvider } from '@gitroom/provider-telegram';
import { MoltbookProvider } from '@gitroom/provider-moltbook';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { uniqBy } from 'lodash';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

@ApiTags('Integrations')
@Controller('/integrations')
export class IntegrationsController {
  private readonly _logger = new Logger(IntegrationsController.name);
  constructor(
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _postService: PostsService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _campaignsService: CampaignsService
  ) {}

  // Drop the cached integrations list after a mutation that changes it.
  private async _invalidateIntegrationsList(orgId: string) {
    try {
      await ioRedis.del(`integrations:list:${orgId}`);
    } catch {
      /* redis down — the 60s TTL still bounds staleness */
    }
  }

  @Post('/provider/:id/connect')
  @RequirePermission('channels', 'create')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  // The frontend spreads the OAuth-callback query params (provider-specific —
  // `code`, `refresh`, `device_id`, …) into this body alongside the validated
  // page-selection fields. Strip (don't reject) those extras so the global
  // `forbidNonWhitelisted: true` pipe can't 400 a legitimate connect, while
  // still bounding/validating the fields `saveProviderPage` actually reads.
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async saveProviderPage(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: ConnectProviderDto
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Invalid body');
    }
    const result = await this._integrationService.saveProviderPage(
      org.id,
      id,
      body
    );
    await this._invalidateIntegrationsList(org.id);
    return result;
  }

  @Get('/:identifier/internal-plugs')
  async getInternalPlugs(@Param('identifier') identifier: string) {
    return this._integrationManager.getInternalPlugs(identifier);
  }

  @Get('/customers')
  getCustomers(@GetOrgFromRequest() org: Organization) {
    return this._integrationService.customers(org.id);
  }

  @Put('/:id/group')
  @RequirePermission('channels', 'update')
  async updateIntegrationGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: UpdateIntegrationGroupDto
  ) {
    const result = await this._integrationService.updateIntegrationGroup(
      org.id,
      id,
      body.group
    );
    await this._invalidateIntegrationsList(org.id);
    return result;
  }

  @Put('/:id/customer-name')
  @RequirePermission('channels', 'update')
  async updateOnCustomerName(
    @GetOrgFromRequest() org: Organization,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: UpdateOnCustomerNameDto
  ) {
    const result = await this._integrationService.updateOnCustomerName(
      org.id,
      id,
      body.name
    );
    await this._invalidateIntegrationsList(org.id);
    return result;
  }

  @Get('/list')
  async getIntegrationList(@GetOrgFromRequest() org: Organization) {
    // Hit on every composer/calendar render — cache for 60s (non-blocking
    // ioRedis get/set EX, never blocking commands; mutations below del the key).
    const cacheKey = `integrations:list:${org.id}`;
    try {
      const cached = await ioRedis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      /* cache miss / redis down — fall through to recompute */
    }

    const result = {
      integrations: (await Promise.all(
        (
          await this._integrationService.getIntegrationsList(org.id)
        ).map(async (p) => {
          // Use the unchecked lookup so already-connected channels keep
          // rendering even if an admin disabled the provider for new
          // connections (the gated getSocialIntegration would throw here and
          // take down the entire channel list for the org).
          const findIntegration = this._integrationManager.getSocialIntegrationUnchecked(
            p.providerIdentifier
          );
          if (!findIntegration) {
            return null;
          }
          return {
            name: p.name,
            id: p.id,
            internalId: p.internalId,
            disabled: p.disabled,
            editor: findIntegration.editor,
            stripLinks: !!findIntegration?.stripLinks?.(),
            picture: p.picture || '/no-picture.jpg',
            identifier: p.providerIdentifier,
            inBetweenSteps: p.inBetweenSteps,
            refreshNeeded: p.refreshNeeded,
            isCustomFields: !!findIntegration.customFields,
            ...(findIntegration.customFields
              ? { customFields: await findIntegration.customFields() }
              : {}),
            display: p.profile,
            type: p.type,
            time: JSON.parse(p.postingTimes),
            changeProfilePicture: !!findIntegration?.changeProfilePicture,
            changeNickName: !!findIntegration?.changeNickname,
            customer: p.customer,
            additionalSettings: p.additionalSettings || '[]',
          };
        })
      )).filter(Boolean),
    };

    try {
      await ioRedis.set(cacheKey, JSON.stringify(result), 'EX', 60);
    } catch {
      /* redis down — serve uncached */
    }

    return result;
  }

  @Post('/:id/settings')
  @RequirePermission('channels', 'update')
  async updateProviderSettings(
    @GetOrgFromRequest() org: Organization,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: UpdateProviderSettingsDto
  ) {
    await this._integrationService.updateProviderSettings(
      org.id,
      id,
      body.additionalSettings
    );
    await this._invalidateIntegrationsList(org.id);
  }
  @Post('/:id/nickname')
  @RequirePermission('channels', 'update')
  async setNickname(
    @GetOrgFromRequest() org: Organization,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: SetNicknameDto
  ) {
    const integration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );
    if (!integration) {
      throw new Error('Invalid integration');
    }

    const manager = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier,
      org.id
    );
    if (!manager.changeProfilePicture && !manager.changeNickname) {
      throw new Error('Invalid integration');
    }

    const { url } = manager.changeProfilePicture
      ? await manager.changeProfilePicture(
          integration.internalId,
          integration.token,
          body.picture
        )
      : { url: '' };

    const { name } = manager.changeNickname
      ? await manager.changeNickname(
          integration.internalId,
          integration.token,
          body.name
        )
      : { name: '' };

    const result = await this._integrationService.updateNameAndUrl(
      id,
      name,
      url
    );
    await this._invalidateIntegrationsList(org.id);
    return result;
  }

  @Get('/social/:integration')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getIntegrationUrl(
    @Param('integration') integration: string,
    @Query('refresh') refresh: string,
    @Query('externalUrl') externalUrl: string,
    @Query('redirectUrl') redirectUrl: string,
    @Query('onboarding') onboarding: string,
    @Query('config') config: string,
    @Query('campaign') campaign: string,
    @GetOrgFromRequest() org: Organization
  ) {
    if (
      !this._integrationManager
        .getAllowedSocialsIntegrations()
        .includes(integration)
    ) {
      throw new Error('Integration not allowed');
    }

    const integrationProvider =
      await this._integrationManager.getSocialIntegration(integration, org.id);

    if (integrationProvider.externalUrl && !externalUrl) {
      throw new Error('Missing external url');
    }

    try {
      const getExternalUrl = integrationProvider.externalUrl
        ? {
            ...(await integrationProvider.externalUrl(externalUrl)),
            instanceUrl: externalUrl,
          }
        : undefined;

      const clientInformation = await this._integrationManager.requireClientInformation(
        integration,
        org.id,
        config || undefined
      );

      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl(clientInformation);

      // Bind the chosen named credential config to this connection so the callback
      // (and later refresh/publish) use that config's own auth.
      if (config) {
        await ioRedis.set(`config:${state}`, config, 'EX', 3600);
      }

      if (refresh) {
        await ioRedis.set(`refresh:${state}`, refresh, 'EX', 3600);
      }

      if (onboarding === 'true') {
        await ioRedis.set(`onboarding:${state}`, 'true', 'EX', 3600);
      }

      // Campaign-scoped connect/invite: bind the campaign so the callback auto-tags
      // the new channel onto it. Verify ownership before trusting the id.
      if (campaign) {
        const owned = await this._campaignsService.get(campaign, org.id);
        if (owned) {
          await ioRedis.set(`campaign:${state}`, campaign, 'EX', 3600);
        }
      }

      if (redirectUrl) {
        if (!isAllowedReturnUrl(redirectUrl)) {
          throw new Error('Invalid redirect URL');
        }
        await ioRedis.set(`redirect:${state}`, redirectUrl, 'EX', 3600);
      }

      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(`login:${state}`, codeVerifier, 'EX', 3600);
      await ioRedis.set(
        `external:${state}`,
        JSON.stringify(getExternalUrl),
        'EX',
        3600
      );

      return { url };
    } catch (err) {
      return { err: true };
    }
  }

  @Post('/:id/time')
  @RequirePermission('channels', 'update')
  async setTime(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: IntegrationTimeDto
  ) {
    return this._integrationService.setTimes(org.id, id, body);
  }

  @Post('/mentions')
  @RequirePermission('channels', 'update')
  async mentions(
    @GetOrgFromRequest() org: Organization,
    @Body() body: IntegrationFunctionDto
  ) {
    const getIntegration = await this._integrationService.getIntegrationById(
      org.id,
      body.id
    );
    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    let newList: any[] | { none: true } = [];
    try {
      newList = (await this.functionIntegration(org, body)) || [];
    } catch (err) {
      this._logger.warn((err as Error)?.message ?? String(err));
    }

    if (!Array.isArray(newList) && newList?.none) {
      return newList;
    }

    const list = await this._integrationService.getMentions(
      getIntegration.providerIdentifier,
      body?.data?.query
    );

    if (Array.isArray(newList) && newList.length) {
      await this._integrationService.insertMentions(
        getIntegration.providerIdentifier,
        newList
          .map((p: any) => ({
            name: p.label || '',
            username: p.id || '',
            image: p.image || '',
            doNotCache: p.doNotCache || false,
          }))
          .filter((f: any) => f.name && !f.doNotCache)
      );
    }

    return uniqBy(
      [
        ...list.map((p) => ({
          id: p.username,
          image: p.image,
          label: p.name,
        })),
        ...(newList as any[]),
      ],
      (p) => p.id
    ).filter((f) => f.label && f.id);
  }

  @Post('/function')
  @RequirePermission('channels', 'update')
  async functionIntegration(
    @GetOrgFromRequest() org: Organization,
    @Body() body: IntegrationFunctionDto
  ): Promise<any> {
    const getIntegration = await this._integrationService.getIntegrationById(
      org.id,
      body.id
    );
    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    const integrationProvider = await this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier,
      org.id
    );
    if (!integrationProvider) {
      throw new Error('Invalid provider');
    }

    // POSTS-23/24: allow-list callable provider methods. Tool-decorated methods
    // plus the non-tool `mention` helper are the only legitimate dynamic-dispatch
    // targets for this route.
    const tools = this._integrationManager.getAllTools();
    const allowedMethods = new Set([
      ...(tools[integrationProvider.identifier] || []).map((t) => t.methodName),
      'mention',
    ]);
    if (!allowedMethods.has(body.name)) {
      throw new BadRequestException(`Unknown provider function: ${body.name}`);
    }

    // @ts-ignore
    if (integrationProvider[body.name]) {
      try {
        // @ts-ignore
        const load = await integrationProvider[body.name](
          getIntegration.token,
          body.data,
          getIntegration.internalId,
          getIntegration
        );

        return load;
      } catch (err) {
        if (err instanceof RefreshToken) {
          const data = await this._refreshIntegrationService.refresh(
            getIntegration
          );

          if (!data) {
            return;
          }

          const { accessToken } = data;

          if (accessToken) {
            if (integrationProvider.refreshWait) {
              await timer(10000);
            }
            return this.functionIntegration(org, body);
          }

          return false;
        }

        return false;
      }
    }
    throw new Error('Function not found');
  }

  @Post('/disable')
  @RequirePermission('channels', 'update')
  async disableChannel(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ChannelIdBodyDto
  ) {
    const result = await this._integrationService.disableChannel(org.id, body.id);
    await this._invalidateIntegrationsList(org.id);
    return result;
  }

  @Post('/enable')
  @RequirePermission('channels', 'update')
  async enableChannel(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ChannelIdBodyDto
  ) {
    const result = await this._integrationService.enableChannel(
      org.id,
      // @ts-ignore
      org?.subscription?.totalChannels || pricing.FREE.channel,
      body.id
    );
    await this._invalidateIntegrationsList(org.id);
    return result;
  }

  @Delete('/')
  @RequirePermission('channels', 'delete')
  async deleteChannel(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ChannelIdBodyDto
  ) {
    const isTherePosts = await this._integrationService.getPostsForChannel(
      org.id,
      body.id
    );
    if (isTherePosts.length) {
      for (const post of isTherePosts) {
        this._postService.deletePost(org.id, post.group).catch((err) => {});
      }
    }

    const result = await this._integrationService.deleteChannel(org.id, body.id);
    await this._invalidateIntegrationsList(org.id);
    return result;
  }

  @Get('/plug/list')
  async getPlugList() {
    return { plugs: this._integrationManager.getAllPlugs() };
  }

  @Get('/:id/plugs')
  async getPlugsByIntegrationId(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization
  ) {
    return this._integrationService.getPlugsByIntegrationId(org.id, id);
  }

  @Post('/:id/plugs')
  @RequirePermission('channels', 'create')
  async postPlugsByIntegrationId(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
    @Body() body: PlugDto
  ) {
    return this._integrationService.createOrUpdatePlug(org.id, id, body);
  }

  @Put('/plugs/:id/activate')
  @RequirePermission('channels', 'update')
  async changePlugActivation(
    @Param('id', ParseCuidPipe) id: string,
    @GetOrgFromRequest() org: Organization,
    @Body() body: PlugActivationDto
  ) {
    return this._integrationService.changePlugActivation(org.id, id, body.status);
  }

  @Get('/telegram/updates')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getUpdates(@Query() query: TelegramUpdatesQueryDto) {
    try {
      return await new TelegramProvider().getBotId(query);
    } catch (err) {
      // Telegram bot not configured (no TELEGRAM_TOKEN) or a transient getUpdates error.
      // The frontend polls this while waiting for the user's /connect message, so a 500
      // here just spams errors — return empty so the connect flow degrades gracefully (#10).
      Logger.warn('telegram getUpdates failed; returning empty');
      return {};
    }
  }

  @Post('/moltbook/register')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async moltbookRegister(@Body() body: MoltbookRegisterDto) {
    try {
      const provider = new MoltbookProvider();
      const result = await provider.registerAgent(body.name, body.description);
      return {
        apiKey: result.api_key,
        claimUrl: result.claim_url,
        verificationCode: result.verification_code,
      };
    } catch (err: any) {
      return { error: err.message || 'Registration failed' };
    }
  }

  @Get('/moltbook/status')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async moltbookStatus(@Query() query: MoltbookStatusQueryDto) {
    try {
      const provider = new MoltbookProvider();
      const result = await provider.checkAgentStatus(query.apiKey);
      return { claimed: result?.status === 'claimed' };
    } catch (err) {
      return { claimed: false };
    }
  }
}

import { randomBytes, createHash } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { ShortLinkAdapter } from '@gitroom/nestjs-libraries/short-linking/short-link.interface';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { UpsertShortlinkConfigDto } from '@gitroom/nestjs-libraries/dtos/short-links/upsert-shortlink-config.dto';
import { TestShortlinkDto } from '@gitroom/nestjs-libraries/dtos/short-links/test-shortlink.dto';
import { OAuthUrlDto } from '@gitroom/nestjs-libraries/dtos/short-links/oauth-url.dto';
import { OAuthCallbackDto } from '@gitroom/nestjs-libraries/dtos/short-links/oauth-callback.dto';
import { isAllowedReturnUrl } from '@gitroom/nestjs-libraries/security/return-url.validator';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

@ApiTags('Org ShortLink Settings')
@Controller('/settings/shortlinks')
@UseGuards(OrgRbacGuard)
export class OrgShortLinkSettingsController {
  constructor(
    private _orgShortLinkSettings: OrgShortLinkSettingsService,
    private _resolution: ProviderResolutionService,
  ) {}

  // Resolve a short-link adapter through the kernel, throwing a 400 when the
  // provider id is unknown/retired.
  private _requireAdapter(identifier: string, version?: string): ShortLinkAdapter {
    try {
      return this._resolution.resolveShortLink(
        identifier,
        ...(version ? [{ version }] as const : []),
      );
    } catch {
      throw new BadRequestException('Unknown short-link provider');
    }
  }

  @Get('/providers')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async listProviders() {
    return this._orgShortLinkSettings.listProviderMetadata();
  }

  @Get('/config')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async getConfig(@GetOrgFromRequest() org: Organization) {
    const active = await this._orgShortLinkSettings.getActiveProvider(org.id);
    const allConfigs = await this._orgShortLinkSettings.getProviders(org.id);
    const safeActive = active
      ? (({ credentials, extraConfig, ...rest }) => rest)(active as any)
      : null;
    return {
      active: safeActive,
      providers: allConfigs,
    };
  }

  @Put('/config/:identifier')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async upsertConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: UpsertShortlinkConfigDto,
  ) {
    this._requireAdapter(identifier);

    await this._orgShortLinkSettings.upsert(org.id, identifier, {
      enabled: true,
      credentials: body.credentials,
      customDomain: body.customDomain,
      extraConfig: body.extraConfig,
      name: body.name,
      accountFingerprint: body.accountFingerprint,
      version: body.version,
    });

    return { identifier, success: true };
  }

  @Post('/config/:identifier/set-active')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async setActive(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: { version?: string },
  ) {
    try {
      const result = await this._orgShortLinkSettings.setActive(org.id, identifier, body.version);
      return { identifier, isActive: result.isActive };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('/config/:identifier/test')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async testConnection(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: TestShortlinkDto,
  ) {
    const adapter = this._requireAdapter(identifier);

    if (body.credentials) {
      return adapter.validateCredentials({
        orgId: org.id,
        credentials: body.credentials,
        customDomain: body.customDomain,
      });
    }

    try {
      return await this._orgShortLinkSettings.testConnection(org.id, identifier);
    } catch (err) {
      throw new HttpException(
        (err as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('/config/:identifier')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
  ) {
    await this._orgShortLinkSettings.delete(org.id, identifier);
    return { success: true };
  }

  @Post('/config/:identifier/oauth/url')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getOAuthUrl(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: OAuthUrlDto,
  ) {
    // Resolve the same pinned version the org's config uses.
    const version = await this._orgShortLinkSettings.getPinnedVersion(org.id, identifier);
    const adapter = this._requireAdapter(identifier, version);
    if (!adapter.oauth) throw new BadRequestException('Provider does not support OAuth');

    if (!isAllowedReturnUrl(body.redirectUri)) {
      throw new ForbiddenException('Invalid redirect URI');
    }

    // B-1: load clientId/secret from extraConfig
    const cfg = await this._orgShortLinkSettings.getConfigForProvider(org.id, identifier);

    // CSPRNG state + PKCE verifier
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    // Store transient state in Redis, TTL 600s
    await ioRedis.set(
      `shortlink:oauth:${org.id}:${state}`,
      JSON.stringify({ codeVerifier, redirectUri: body.redirectUri, identifier }),
      'EX',
      600,
    );

    const url = adapter.oauth.authorizeUrl(
      { orgId: org.id, credentials: {}, extraConfig: cfg?.extraConfig },
      state,
      body.redirectUri,
      codeChallenge,
    );
    return { url, state };
  }

  @Post('/config/:identifier/oauth/callback')
  @RequirePermission('shortlink-config', 'manage')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async oauthCallback(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: OAuthCallbackDto,
  ) {
    // Resolve the same pinned version the org's config uses.
    const version = await this._orgShortLinkSettings.getPinnedVersion(org.id, identifier);
    const adapter = this._requireAdapter(identifier, version);
    if (!adapter.oauth) throw new BadRequestException('Provider does not support OAuth');

    if (!isAllowedReturnUrl(body.redirectUri)) {
      throw new ForbiddenException('Invalid redirect URI');
    }

    // Look up + delete the stored state (single-use)
    const key = `shortlink:oauth:${org.id}:${body.state}`;
    const storedRaw = await ioRedis.get(key);
    await ioRedis.del(key); // single-use
    if (!storedRaw) throw new ForbiddenException('Invalid or expired OAuth state');

    const stored = JSON.parse(storedRaw);
    const { codeVerifier, redirectUri: storedRedirectUri, identifier: storedId } = stored;
    if (storedId !== identifier || storedRedirectUri !== body.redirectUri) {
      throw new ForbiddenException('OAuth state mismatch');
    }

    // B-1: load clientId/secret for exchange
    const cfg = await this._orgShortLinkSettings.getConfigForProvider(org.id, identifier);

    const credentials = await adapter.oauth.exchangeCode(
      body.code,
      body.redirectUri,
      { orgId: org.id, credentials: {}, extraConfig: cfg?.extraConfig },
      codeVerifier,
    );

    await this._orgShortLinkSettings.upsert(org.id, identifier, {
      enabled: true,
      credentials,
      version,
    });

    return { identifier, success: true };
  }
}

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
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { UpsertShortlinkConfigDto } from '@gitroom/nestjs-libraries/dtos/short-links/upsert-shortlink-config.dto';
import { TestShortlinkDto } from '@gitroom/nestjs-libraries/dtos/short-links/test-shortlink.dto';
import { OAuthUrlDto } from '@gitroom/nestjs-libraries/dtos/short-links/oauth-url.dto';
import { OAuthCallbackDto } from '@gitroom/nestjs-libraries/dtos/short-links/oauth-callback.dto';
import { SetActiveShortlinkDto } from '@gitroom/backend/dtos/short-links/set-active-shortlink.dto';
import { isAllowedReturnUrl } from '@gitroom/nestjs-libraries/security/return-url.validator';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { accountFingerprint } from '@gitroom/nestjs-libraries/utils/account-fingerprint';

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
  async listProviders() {
    return this._orgShortLinkSettings.listProviderMetadata();
  }

  @Get('/config')
  @RequirePermission('shortlink-config', 'manage')
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
  async upsertConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: UpsertShortlinkConfigDto,
  ) {
    this._requireAdapter(identifier);

    // PROVIDER_REMEDIATION 6.6: compute the fingerprint SERVER-SIDE with the shared
    // util (as Storage does) and ignore any client-supplied `body.accountFingerprint`
    // — a client-controlled value lets an attacker mint unlimited duplicate rows /
    // defeat dedupe.
    const accountFingerprint = this._computeAccountFingerprint(
      identifier,
      body.credentials,
      body.customDomain,
    );

    // PROVIDER_REMEDIATION_02 §0.3: when a config already exists for this
    // provider (the normal edit/rotate flow — the UI is single-config-per-
    // provider), update THAT row in place. Routing a rotation through the
    // fingerprint-`upsert` branch created a second inactive row with the new key
    // while `getActive()` kept returning the old row with the *revoked* key. The
    // explicit fingerprint-`create` path is reserved for a first save / an
    // explicit "add another account" flow (no existing row).
    const existingId = await this._orgShortLinkSettings.getExistingConfigId(
      org.id,
      identifier,
    );
    if (existingId) {
      await this._orgShortLinkSettings.updateById(
        org.id,
        existingId,
        {
          credentials: body.credentials,
          customDomain: body.customDomain,
          extraConfig: body.extraConfig,
          name: body.name,
          accountFingerprint,
          version: body.version,
        },
        identifier,
      );
      return { identifier, success: true };
    }

    await this._orgShortLinkSettings.upsert(org.id, identifier, {
      enabled: true,
      credentials: body.credentials,
      customDomain: body.customDomain,
      extraConfig: body.extraConfig,
      name: body.name,
      accountFingerprint,
      version: body.version,
    });

    return { identifier, success: true };
  }

  // Row-id-targeted in-place update (rotation / rename / re-key of a specific
  // account). Mirrors Storage's by-id update route; the client already holds
  // `ShortlinkAccountConfig.id`. Reserves the fingerprint-`create` branch of the
  // identifier route strictly for the explicit "add another account" flow.
  @Put('/config/:identifier/:configId')
  @RequirePermission('shortlink-config', 'manage')
  async updateConfigById(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Param('configId') configId: string,
    @Body() body: UpsertShortlinkConfigDto,
  ) {
    this._requireAdapter(identifier);

    // The service cross-checks that the row actually belongs to `identifier`
    // (review F9) — a same-org caller must not stamp a bitly-computed fingerprint
    // onto a dub row via a mismatched configId.
    await this._orgShortLinkSettings.updateById(
      org.id,
      configId,
      {
        credentials: body.credentials,
        customDomain: body.customDomain,
        extraConfig: body.extraConfig,
        name: body.name,
        accountFingerprint: this._computeAccountFingerprint(
          identifier,
          body.credentials,
          body.customDomain,
        ),
        version: body.version,
      },
      identifier,
    );

    return { identifier, configId, success: true };
  }

  // Deterministic, credential-derived fingerprint (server-side only). Undefined when
  // no credentials are supplied so passthrough/empty configs aren't wrongly deduped.
  private _computeAccountFingerprint(
    identifier: string,
    credentials?: Record<string, string>,
    customDomain?: string,
  ): string | undefined {
    if (!credentials || Object.keys(credentials).length === 0) {
      return undefined;
    }
    const canonical = Object.keys(credentials)
      .sort()
      .map((k) => `${k}=${credentials[k]}`)
      .join('&');
    return accountFingerprint(identifier, customDomain ?? '', canonical);
  }

  @Post('/config/:identifier/set-active')
  @RequirePermission('shortlink-config', 'manage')
  async setActive(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: SetActiveShortlinkDto,
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
  async testConnection(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
    @Body() body: TestShortlinkDto,
  ) {
    const adapter = this._requireAdapter(identifier);

    if (body.credentials) {
      // 3.1: adapter validateCredentials may PROPAGATE an SSRF rejection
      // ("Blocked URL") — map it to a clean 400 instead of an unhandled 500
      // (parity with the AI test routes).
      try {
        return await adapter.validateCredentials({
          orgId: org.id,
          credentials: body.credentials,
          customDomain: body.customDomain,
        });
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
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
  async deleteConfig(
    @GetOrgFromRequest() org: Organization,
    @Param('identifier') identifier: string,
  ) {
    await this._orgShortLinkSettings.delete(org.id, identifier);
    return { success: true };
  }

  @Post('/config/:identifier/oauth/url')
  @RequirePermission('shortlink-config', 'manage')
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

    // 0.3: an OAuth re-connect of an existing config is a rotation — update the
    // (active-preferred) row in place, recomputing the fingerprint for the new
    // tokens. `updateById` keeps the row's pinned version, so re-authing a
    // deprecated-pinned config still works (1.4 in-place semantics); upsert stays
    // for the first-ever connect.
    const existingId = await this._orgShortLinkSettings.getExistingConfigId(
      org.id,
      identifier,
    );
    if (existingId) {
      await this._orgShortLinkSettings.updateById(
        org.id,
        existingId,
        {
          credentials,
          accountFingerprint: this._computeAccountFingerprint(
            identifier,
            credentials,
          ),
        },
        identifier,
      );
      return { identifier, success: true };
    }

    await this._orgShortLinkSettings.upsert(org.id, identifier, {
      enabled: true,
      credentials,
      version,
    });

    return { identifier, success: true };
  }
}

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const mockGetActiveProvider = vi.fn();
const mockGetProviders = vi.fn();
const mockListProviderMetadata = vi.fn();
const mockUpsert = vi.fn();
const mockSetActive = vi.fn();
const mockDelete = vi.fn();
const mockTestConnection = vi.fn();
const mockGetConfigForProvider = vi.fn();
const mockGetPinnedVersion = vi.fn();

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service',
  () => ({
    OrgShortLinkSettingsService: class {
      getActiveProvider = mockGetActiveProvider;
      getProviders = mockGetProviders;
      listProviderMetadata = mockListProviderMetadata;
      upsert = mockUpsert;
      setActive = mockSetActive;
      delete = mockDelete;
      deleteById = mockDelete;
      testConnection = mockTestConnection;
      getConfigForProvider = mockGetConfigForProvider;
      getPinnedVersion = mockGetPinnedVersion;
    },
  }),
);

const mockResolveShortLink = vi.fn();

vi.mock('@gitroom/nestjs-libraries/providers/provider-resolution.service', () => ({
  ProviderResolutionService: class {
    resolveShortLink = mockResolveShortLink;
  },
}));

const mockIsAllowedReturnUrl = vi.fn();

vi.mock('@gitroom/nestjs-libraries/security/return-url.validator', () => ({
  isAllowedReturnUrl: (url: string) => mockIsAllowedReturnUrl(url),
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
    del: (...args: any[]) => mockRedisDel(...args),
  },
}));

import { OrgShortLinkSettingsController } from './org-shortlink-settings.controller';
import { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import type { ShortLinkAdapter } from '@gitroom/nestjs-libraries/short-linking/short-link.interface';

const org = { id: 'org-1' } as any;

function stubAdapter(overrides: Record<string, any> = {}) {
  return {
    identifier: 'bitly',
    name: 'Bitly',
    capabilities: {
      create: true,
      expand: false,
      statistics: true,
      bulkStatistics: false,
      customDomain: true,
    },
    credentialFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
    authType: 'apiKey',
    defaultDomain: 'bit.ly',
    setupNotes: 'Get your API key from Bitly dashboard',
    validateCredentials: vi.fn().mockResolvedValue({ ok: true }),
    resolveDomain: vi.fn().mockReturnValue('bit.ly'),
    createShortLink: vi.fn(),
    oauth: undefined as ShortLinkAdapter['oauth'],
    ...overrides,
  };
}

describe('OrgShortLinkSettingsController', () => {
  let controller: OrgShortLinkSettingsController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPinnedVersion.mockResolvedValue('v1');

    controller = new OrgShortLinkSettingsController(
      new (OrgShortLinkSettingsService as any)(),
      new (ProviderResolutionService as any)(),
    );
  });

  // ---------------------------------------------------------------------------
  // Policy guards
  // ---------------------------------------------------------------------------
  describe('policy guards', () => {
    it('listProviders is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.listProviders,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });

    it('getConfig is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.getConfig,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });

    it('upsertConfig is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.upsertConfig,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });

    it('setActive is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.setActive,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });

    it('testConnection is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.testConnection,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });

    it('deleteConfig is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.deleteConfig,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });

    it('getOAuthUrl is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.getOAuthUrl,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });

    it('oauthCallback is gated with ADMIN create policy', () => {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        OrgShortLinkSettingsController.prototype.oauthCallback,
      );
      expect(policies).toEqual([[AuthorizationActions.Create, Sections.ADMIN]]);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /providers
  // ---------------------------------------------------------------------------
  describe('GET /providers', () => {
    it('delegates to the service for the safe provider metadata list', async () => {
      const meta = [
        {
          identifier: 'bitly',
          name: 'Bitly',
          capabilities: stubAdapter().capabilities,
          credentialFields: stubAdapter().credentialFields,
          authType: 'apiKey',
          defaultDomain: 'bit.ly',
          setupNotes: 'Get your API key from Bitly dashboard',
        },
      ];
      mockListProviderMetadata.mockReturnValue(meta);

      const result = await controller.listProviders();

      expect(mockListProviderMetadata).toHaveBeenCalledOnce();
      expect(result).toEqual(meta);
    });

    it('returns empty array when no adapters registered', async () => {
      mockListProviderMetadata.mockReturnValue([]);

      const result = await controller.listProviders();

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /config
  // ---------------------------------------------------------------------------
  describe('GET /config', () => {
    it('returns active provider without credentials', async () => {
      const active = {
        identifier: 'bitly',
        name: 'Bitly',
        credentials: 'encrypted-secret',
        customDomain: 'short.myco.com',
        extraConfig: { plan: 'business' },
        enabled: true,
        isActive: true,
      };
      mockGetActiveProvider.mockResolvedValue(active);
      mockGetProviders.mockResolvedValue([]);

      const result = await controller.getConfig(org);

      expect(mockGetActiveProvider).toHaveBeenCalledWith('org-1');
      expect(mockGetProviders).toHaveBeenCalledWith('org-1');
      expect(result.active).not.toHaveProperty('credentials');
      expect(result.active).not.toHaveProperty('extraConfig');
      expect(result.active).toEqual({
        identifier: 'bitly',
        name: 'Bitly',
        customDomain: 'short.myco.com',
        enabled: true,
        isActive: true,
      });
    });

    it('returns null active when no active provider', async () => {
      mockGetActiveProvider.mockResolvedValue(null);
      mockGetProviders.mockResolvedValue([]);

      const result = await controller.getConfig(org);

      expect(result.active).toBeNull();
      expect(result.providers).toEqual([]);
    });

    it('returns all provider configs', async () => {
      mockGetActiveProvider.mockResolvedValue(null);
      mockGetProviders.mockResolvedValue([
        { identifier: 'bitly', enabled: true, isActive: false },
        { identifier: 'rebrandly', enabled: false, isActive: false },
      ]);

      const result = await controller.getConfig(org);

      expect(result.providers).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /config/:identifier
  // ---------------------------------------------------------------------------
  describe('PUT /config/:identifier', () => {
    const body = {
      credentials: { apiKey: 'test-key' },
      customDomain: 'short.myco.com',
      extraConfig: { plan: 'enterprise' },
    };

    it('throws BadRequestException for unknown provider identifier', async () => {
      mockResolveShortLink.mockImplementation(() => { throw new Error('not found'); });

      await expect(
        controller.upsertConfig(org, 'nonexistent', body as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts config and returns success', async () => {
      const adapter = stubAdapter();
      mockResolveShortLink.mockReturnValue(adapter);
      mockUpsert.mockResolvedValue({});

      const result = await controller.upsertConfig(org, 'bitly', body as any);

      expect(mockResolveShortLink).toHaveBeenCalledWith('bitly');
      expect(mockUpsert).toHaveBeenCalledWith('org-1', 'bitly', {
        enabled: true,
        credentials: body.credentials,
        customDomain: body.customDomain,
        extraConfig: body.extraConfig,
        // PROVIDER_REMEDIATION 6.6: fingerprint is now computed server-side.
        accountFingerprint: expect.any(String),
        version: undefined,
      });
      expect(result).toEqual({ identifier: 'bitly', success: true });
    });

    it('passes explicit version to upsert', async () => {
      const adapter = stubAdapter();
      mockResolveShortLink.mockReturnValue(adapter);
      mockUpsert.mockResolvedValue({});

      const result = await controller.upsertConfig(org, 'bitly', {
        ...body,
        version: 'v2',
      } as any);

      expect(mockUpsert).toHaveBeenCalledWith('org-1', 'bitly', {
        enabled: true,
        credentials: body.credentials,
        customDomain: body.customDomain,
        extraConfig: body.extraConfig,
        accountFingerprint: expect.any(String),
        version: 'v2',
      });
      expect(result).toEqual({ identifier: 'bitly', success: true });
    });

    // PROVIDER_REMEDIATION 6.6: the fingerprint is derived server-side and any
    // client-supplied `accountFingerprint` is ignored (prevents duplicate-row minting).
    it('ignores a client-supplied accountFingerprint and computes it server-side', async () => {
      const adapter = stubAdapter();
      mockResolveShortLink.mockReturnValue(adapter);
      mockUpsert.mockResolvedValue({});

      await controller.upsertConfig(org, 'bitly', {
        credentials: { apiKey: 'test-key' },
        customDomain: 'short.myco.com',
        accountFingerprint: 'client-forged-value',
      } as any);

      const passed = mockUpsert.mock.calls[0][2];
      expect(passed.accountFingerprint).toEqual(expect.any(String));
      expect(passed.accountFingerprint).not.toBe('client-forged-value');
    });

    it('leaves the fingerprint undefined when no credentials are provided', async () => {
      const adapter = stubAdapter();
      mockResolveShortLink.mockReturnValue(adapter);
      mockUpsert.mockResolvedValue({});

      await controller.upsertConfig(org, 'bitly', {
        customDomain: 'short.myco.com',
      } as any);

      const passed = mockUpsert.mock.calls[0][2];
      expect(passed.accountFingerprint).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /config/:identifier/set-active
  // ---------------------------------------------------------------------------
  describe('POST /config/:identifier/set-active', () => {
    it('sets active provider and returns result', async () => {
      mockSetActive.mockResolvedValue({ isActive: true });

      const result = await controller.setActive(org, 'bitly', {});

      expect(mockSetActive).toHaveBeenCalledWith('org-1', 'bitly', undefined);
      expect(result).toEqual({ identifier: 'bitly', isActive: true });
    });

    it('passes explicit version to setActive', async () => {
      mockSetActive.mockResolvedValue({ isActive: true });

      const result = await controller.setActive(org, 'bitly', { version: 'v2' });

      expect(mockSetActive).toHaveBeenCalledWith('org-1', 'bitly', 'v2');
      expect(result).toEqual({ identifier: 'bitly', isActive: true });
    });

    it('wraps service errors in BadRequestException', async () => {
      mockSetActive.mockRejectedValue(new Error('Not configured'));

      await expect(
        controller.setActive(org, 'bitly', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /config/:identifier/test
  // ---------------------------------------------------------------------------
  describe('POST /config/:identifier/test', () => {
    it('throws BadRequestException for unknown provider', async () => {
      mockResolveShortLink.mockImplementation(() => { throw new Error('not found'); });

      await expect(
        controller.testConnection(org, 'nonexistent', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates inline credentials when provided in body', async () => {
      const adapter = stubAdapter();
      adapter.validateCredentials.mockResolvedValue({ ok: true });
      mockResolveShortLink.mockReturnValue(adapter);

      const body = { credentials: { apiKey: 'direct-key' } };
      const result = await controller.testConnection(org, 'bitly', body as any);

      expect(adapter.validateCredentials).toHaveBeenCalledWith({
        orgId: 'org-1',
        credentials: { apiKey: 'direct-key' },
        customDomain: undefined,
      });
      expect(result).toEqual({ ok: true });
    });

    it('tests connection from stored config when no inline credentials', async () => {
      mockResolveShortLink.mockReturnValue(stubAdapter());
      mockTestConnection.mockResolvedValue({ ok: true });

      const result = await controller.testConnection(org, 'bitly', {} as any);

      expect(mockTestConnection).toHaveBeenCalledWith('org-1', 'bitly');
      expect(result).toEqual({ ok: true });
    });

    it('wraps stored-config test errors in HttpException', async () => {
      mockResolveShortLink.mockReturnValue(stubAdapter());
      mockTestConnection.mockRejectedValue(new Error('Connection failed'));

      await expect(
        controller.testConnection(org, 'bitly', {} as any),
      ).rejects.toThrow(Error);
    });

    it('validates credentials with customDomain from body', async () => {
      const adapter = stubAdapter();
      adapter.validateCredentials.mockResolvedValue({ ok: true });
      mockResolveShortLink.mockReturnValue(adapter);

      const body = {
        credentials: { apiKey: 'key' },
        customDomain: 'links.example.com',
      };
      await controller.testConnection(org, 'bitly', body as any);

      expect(adapter.validateCredentials).toHaveBeenCalledWith({
        orgId: 'org-1',
        credentials: { apiKey: 'key' },
        customDomain: 'links.example.com',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /config/:identifier
  // ---------------------------------------------------------------------------
  describe('DELETE /config/:identifier', () => {
    it('deletes config and returns success', async () => {
      mockDelete.mockResolvedValue({});

      const result = await controller.deleteConfig(org, 'bitly');

      expect(mockDelete).toHaveBeenCalledWith('org-1', 'bitly');
      expect(result).toEqual({ success: true });
    });
  });

  // ---------------------------------------------------------------------------
  // POST /config/:identifier/oauth/url
  // ---------------------------------------------------------------------------
  describe('POST /config/:identifier/oauth/url', () => {
    it('throws BadRequestException for unknown provider', async () => {
      mockResolveShortLink.mockImplementation(() => { throw new Error('not found'); });

      await expect(
        controller.getOAuthUrl(org, 'nonexistent', { redirectUri: 'https://app.example.com/oauth/callback' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when provider does not support OAuth', async () => {
      const adapter = stubAdapter();
      mockResolveShortLink.mockReturnValue(adapter);

      await expect(
        controller.getOAuthUrl(org, 'bitly', { redirectUri: 'https://app.example.com/oauth/callback' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException for disallowed redirect URI', async () => {
      const adapter = stubAdapter({
        oauth: {
          authorizeUrl: vi.fn(),
          exchangeCode: vi.fn(),
        },
      });
      mockResolveShortLink.mockReturnValue(adapter);
      mockIsAllowedReturnUrl.mockReturnValue(false);

      await expect(
        controller.getOAuthUrl(org, 'bitly', { redirectUri: 'https://evil.com/steal' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns OAuth URL and state for valid redirect URI', async () => {
      mockGetConfigForProvider.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      const adapter = stubAdapter({
        oauth: {
          authorizeUrl: vi.fn().mockReturnValue('https://bitly.com/oauth/authorize?client_id=abc'),
          exchangeCode: vi.fn(),
        },
      });
      mockResolveShortLink.mockReturnValue(adapter);
      mockIsAllowedReturnUrl.mockReturnValue(true);

      const result = await controller.getOAuthUrl(org, 'bitly', {
        redirectUri: 'https://app.example.com/oauth/callback',
      } as any);

      expect(mockIsAllowedReturnUrl).toHaveBeenCalledWith('https://app.example.com/oauth/callback');
      expect(mockGetConfigForProvider).toHaveBeenCalledWith('org-1', 'bitly');
      expect(adapter.oauth!.authorizeUrl).toHaveBeenCalledWith(
        { orgId: 'org-1', credentials: {}, extraConfig: undefined },
        expect.any(String),
        'https://app.example.com/oauth/callback',
        expect.any(String),
      );
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('state');
      expect(typeof result.state).toBe('string');
      expect(result.state.length).toBeGreaterThanOrEqual(32);
    });

    it('stores codeVerifier in Redis with proper TTL', async () => {
      mockGetConfigForProvider.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      const adapter = stubAdapter({
        oauth: {
          authorizeUrl: vi.fn().mockReturnValue('https://bitly.com/oauth/authorize'),
          exchangeCode: vi.fn(),
        },
      });
      mockResolveShortLink.mockReturnValue(adapter);
      mockIsAllowedReturnUrl.mockReturnValue(true);

      const result = await controller.getOAuthUrl(org, 'bitly', {
        redirectUri: 'https://app.example.com/oauth/callback',
      } as any);

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringMatching(/^shortlink:oauth:org-1:.+$/),
        expect.any(String),
        'EX',
        600,
      );
      const stored = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(stored).toHaveProperty('codeVerifier');
      expect(stored).toHaveProperty('redirectUri', 'https://app.example.com/oauth/callback');
      expect(stored).toHaveProperty('identifier', 'bitly');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /config/:identifier/oauth/callback
  // ---------------------------------------------------------------------------
  describe('POST /config/:identifier/oauth/callback', () => {
    it('throws BadRequestException for unknown provider', async () => {
      mockResolveShortLink.mockImplementation(() => { throw new Error('not found'); });

      await expect(
        controller.oauthCallback(org, 'nonexistent', {
          code: 'auth-code',
          redirectUri: 'https://app.example.com/oauth/callback',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when provider does not support OAuth', async () => {
      mockResolveShortLink.mockReturnValue(stubAdapter());

      await expect(
        controller.oauthCallback(org, 'bitly', {
          code: 'auth-code',
          redirectUri: 'https://app.example.com/oauth/callback',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException for disallowed redirect URI', async () => {
      mockResolveShortLink.mockReturnValue(
        stubAdapter({
          oauth: { authorizeUrl: vi.fn(), exchangeCode: vi.fn() },
        }),
      );
      mockIsAllowedReturnUrl.mockReturnValue(false);

      await expect(
        controller.oauthCallback(org, 'bitly', {
          code: 'auth-code',
          redirectUri: 'https://evil.com/steal',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when OAuth state is missing from Redis', async () => {
      mockGetConfigForProvider.mockResolvedValue(null);
      mockRedisGet.mockResolvedValue(null);
      mockIsAllowedReturnUrl.mockReturnValue(true);

      await expect(
        controller.oauthCallback(org, 'bitly', {
          code: 'code123',
          state: 'unknown-state',
          redirectUri: 'https://app.example.com/oauth/callback',
        } as any),
      ).rejects.toThrow(ForbiddenException);

      expect(mockRedisGet).toHaveBeenCalledWith('shortlink:oauth:org-1:unknown-state');
      expect(mockRedisDel).toHaveBeenCalledWith('shortlink:oauth:org-1:unknown-state');
    });

    it('throws ForbiddenException when OAuth state identifier mismatches', async () => {
      mockGetConfigForProvider.mockResolvedValue(null);
      mockRedisGet.mockResolvedValue(JSON.stringify({
        codeVerifier: 'test-verifier',
        redirectUri: 'https://app.example.com/oauth/callback',
        identifier: 'other-provider',
      }));
      mockIsAllowedReturnUrl.mockReturnValue(true);

      await expect(
        controller.oauthCallback(org, 'bitly', {
          code: 'code123',
          state: 'known-state',
          redirectUri: 'https://app.example.com/oauth/callback',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when redirectUri mismatches stored state', async () => {
      mockGetConfigForProvider.mockResolvedValue(null);
      mockRedisGet.mockResolvedValue(JSON.stringify({
        codeVerifier: 'test-verifier',
        redirectUri: 'https://app.example.com/oauth/callback',
        identifier: 'bitly',
      }));
      mockIsAllowedReturnUrl.mockReturnValue(true);

      await expect(
        controller.oauthCallback(org, 'bitly', {
          code: 'code123',
          state: 'known-state',
          redirectUri: 'https://different.example.com/callback',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('exchanges code with codeVerifier and upserts config', async () => {
      const adapter = stubAdapter({
        oauth: {
          authorizeUrl: vi.fn(),
          exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'oauth-token' }),
        },
      });
      mockGetConfigForProvider.mockResolvedValue(null);
      mockRedisGet.mockResolvedValue(JSON.stringify({
        codeVerifier: 'test-verifier',
        redirectUri: 'https://app.example.com/oauth/callback',
        identifier: 'bitly',
      }));
      mockResolveShortLink.mockReturnValue(adapter);
      mockIsAllowedReturnUrl.mockReturnValue(true);
      mockUpsert.mockResolvedValue({});

      const result = await controller.oauthCallback(org, 'bitly', {
        code: 'auth-code-123',
        state: 'known-state',
        redirectUri: 'https://app.example.com/oauth/callback',
      } as any);

      expect(mockRedisGet).toHaveBeenCalledWith('shortlink:oauth:org-1:known-state');
      expect(mockRedisDel).toHaveBeenCalledWith('shortlink:oauth:org-1:known-state');
      expect(adapter.oauth!.exchangeCode).toHaveBeenCalledWith(
        'auth-code-123',
        'https://app.example.com/oauth/callback',
        { orgId: 'org-1', credentials: {}, extraConfig: undefined },
        'test-verifier',
      );
      expect(mockUpsert).toHaveBeenCalledWith('org-1', 'bitly', {
        enabled: true,
        credentials: { accessToken: 'oauth-token' },
        version: 'v1',
      });
      expect(result).toEqual({ identifier: 'bitly', success: true });
    });
  });
});

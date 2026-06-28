import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, Logger } from '@nestjs/common';
import { REQUIRE_PERMISSION_KEY } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

// The social provider list now comes from IntegrationManager (kernel-backed);
// the controller iterates `getSocialProviders()` / looks up a single provider
// via `getSocialIntegrationUnchecked(identifier)`.
const fakeProviders = [
  { identifier: 'x', name: 'X', toolTip: 'X social', scopes: ['tweet.read', 'tweet.write'] },
  { identifier: 'facebook', name: 'Facebook', toolTip: 'Facebook social', scopes: ['pages_manage_posts'] },
  { identifier: 'telegram', name: 'Telegram', toolTip: 'Telegram messenger', externalUrl: 'https://t.me', scopes: [] },
  { identifier: 'web3-test', name: 'Web3', isWeb3: true, scopes: [] },
  { identifier: 'ext-test', name: 'Extension', toolTip: 'Ext', isChromeExtension: true, customFields: true, scopes: ['ext_scope'] },
] as any[];

vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));

vi.mock('@prisma/client', () => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = opts.code;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError } };
});

import { ChannelConfigController } from './channel.config.controller';
import { Prisma } from '@prisma/client';

const mockProviderConfigService = {
  getAll: vi.fn(),
  getByIdentifier: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  decryptConfig: vi.fn(),
};

const mockProviderConfigManager = {
  refreshCache: vi.fn(),
};

const mockIntegrationManager = {
  getSocialProviders: () => fakeProviders,
  getSocialIntegrationUnchecked: (identifier: string) =>
    fakeProviders.find((p) => p.identifier === identifier),
};

function createDbConfig(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    identifier: 'x',
    name: 'X',
    enabled: true,
    clientId: 'enc-client-id',
    clientSecret: 'enc-client-secret',
    redirectUri: 'https://redirect.com',
    scopes: 'custom_scope',
    setupInstructions: 'Setup steps',
    additionalConfig: null,
    ...overrides,
  };
}

const adminUser = { id: '1', isSuperAdmin: true } as any;

let controller: ChannelConfigController;

beforeEach(() => {
  vi.clearAllMocks();
  controller = new ChannelConfigController(
    mockProviderConfigService as any,
    mockProviderConfigManager as any,
    mockIntegrationManager as any,
  );
  mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: undefined, clientSecret: undefined });
  mockProviderConfigManager.refreshCache.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // Permission guards
  // ---------------------------------------------------------------------------
  describe('permission guards', () => {
    it('listConfigs is gated with channels:manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        controller.listConfigs,
      );
      expect(metadata).toEqual({ resource: 'channels', action: 'manage' });
    });

    it('getConfig is gated with channels:manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        controller.getConfig,
      );
      expect(metadata).toEqual({ resource: 'channels', action: 'manage' });
    });

    it('saveConfig is gated with channels:manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        controller.saveConfig,
      );
      expect(metadata).toEqual({ resource: 'channels', action: 'manage' });
    });

    it('deleteConfig is gated with channels:manage permission', () => {
      const metadata = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        controller.deleteConfig,
      );
      expect(metadata).toEqual({ resource: 'channels', action: 'manage' });
    });
  });

  describe('listConfigs', () => {
  it('should return all integrations with config data merged in', async () => {
    const dbConfigs = [
      createDbConfig({ identifier: 'x', enabled: true, scopes: null, setupInstructions: 'Setup X' }),
      createDbConfig({ identifier: 'facebook', enabled: false, clientId: 'fb-id', clientSecret: undefined, scopes: null }),
    ];
    mockProviderConfigService.getAll.mockResolvedValue(dbConfigs);
    mockProviderConfigService.decryptConfig.mockImplementation((config: any) => ({
      clientId: config.clientId || undefined,
      clientSecret: config.clientSecret || undefined,
    }));

    const result = await controller.listConfigs(adminUser);

    expect(mockProviderConfigService.getAll).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(fakeProviders.length);

    const xConfig = result.find((r: any) => r.identifier === 'x');
    expect(xConfig).toMatchObject({
      identifier: 'x',
      name: 'X',
      description: 'X social',
      enabled: true,
      isConfigured: true,
      setupInstructions: 'Setup X',
      isExternal: false,
      isWeb3: false,
      isChromeExtension: false,
      customFields: false,
      scopes: 'tweet.read, tweet.write',
    });

    const fbConfig = result.find((r: any) => r.identifier === 'facebook');
    expect(fbConfig).toMatchObject({
      identifier: 'facebook',
      enabled: false,
      isConfigured: true,
      scopes: 'pages_manage_posts',
    });

    const tgConfig = result.find((r: any) => r.identifier === 'telegram');
    expect(tgConfig).toMatchObject({
      identifier: 'telegram',
      enabled: false,
      isConfigured: false,
      isExternal: true,
      scopes: '',
    });

    const web3Config = result.find((r: any) => r.identifier === 'web3-test');
    expect(web3Config).toMatchObject({ isWeb3: true });

    const extConfig = result.find((r: any) => r.identifier === 'ext-test');
    expect(extConfig).toMatchObject({ isChromeExtension: true, customFields: true, scopes: 'ext_scope' });
  });

  it('should set isConfigured to false when decrypt returns no credentials', async () => {
    const dbConfigs = [
      createDbConfig({ identifier: 'x', clientId: null, clientSecret: null }),
    ];
    mockProviderConfigService.getAll.mockResolvedValue(dbConfigs);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: undefined, clientSecret: undefined });

    const result = await controller.listConfigs(adminUser);
    const xConfig = result.find((r: any) => r.identifier === 'x');

    expect(xConfig.isConfigured).toBe(false);
  });

  it('should handle decrypt failure gracefully per-provider', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const dbConfigs = [
      createDbConfig({ identifier: 'x', clientId: 'enc-id', clientSecret: 'enc-secret' }),
      createDbConfig({ identifier: 'facebook', clientId: 'fb-id', clientSecret: 'fb-secret' }),
    ];
    mockProviderConfigService.getAll.mockResolvedValue(dbConfigs);
    mockProviderConfigService.decryptConfig.mockImplementation((config: any) => {
      if (config.identifier === 'x') {
        throw new Error('decrypt failed');
      }
      return { clientId: 'decrypted-fb', clientSecret: 'decrypted-fb-secret' };
    });

    const result = await controller.listConfigs(adminUser);

    const xConfig = result.find((r: any) => r.identifier === 'x');
    expect(xConfig.isConfigured).toBe(false);

    const fbConfig = result.find((r: any) => r.identifier === 'facebook');
    expect(fbConfig.isConfigured).toBe(true);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to decrypt config for x, treating as unconfigured'),
    );
    warnSpy.mockRestore();
  });

  it('should handle empty DB configs gracefully', async () => {
    mockProviderConfigService.getAll.mockResolvedValue([]);

    const result = await controller.listConfigs(adminUser);

    for (const item of result) {
      expect(item.enabled).toBe(false);
      expect(item.isConfigured).toBe(false);
      expect(item.setupInstructions).toBe('');
    }
  });

  it('should fall back to empty description when provider has no toolTip', async () => {
    mockProviderConfigService.getAll.mockResolvedValue([]);
    const result = await controller.listConfigs(adminUser);
    const web3 = result.find((r: any) => r.identifier === 'web3-test');
    expect(web3.description).toBe('');
  });
});

describe('getConfig', () => {
  it('should return config for an existing provider', async () => {
    const config = createDbConfig({ scopes: 'custom_scope' });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: 'decrypted-id', clientSecret: 'decrypted-secret' });

    const result = await controller.getConfig(adminUser, 'x');

    expect(mockProviderConfigService.getByIdentifier).toHaveBeenCalledWith('x');
    expect(result).toMatchObject({
      identifier: 'x',
      name: 'X',
      enabled: true,
      redirectUri: 'https://redirect.com',
      scopes: 'custom_scope',
      setupInstructions: 'Setup steps',
      isConfigured: true,
      isExternal: false,
      isWeb3: false,
      isChromeExtension: false,
      customFields: false,
    });
  });

  it('should use provider scopes when DB config has no scopes', async () => {
    const config = createDbConfig({ scopes: null });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: 'id', clientSecret: 'secret' });

    const result = await controller.getConfig(adminUser, 'x');

    expect(result.scopes).toBe('tweet.read, tweet.write');
  });

  it('should fall back to identifier as name when provider not in list', async () => {
    const config = createDbConfig({ identifier: 'unknown-provider', scopes: null });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: 'id', clientSecret: 'secret' });

    const result = await controller.getConfig(adminUser, 'unknown-provider');

    expect(result.name).toBe('unknown-provider');
    expect(result.scopes).toBe('');
  });

  it('should return isConfigured false when no config exists', async () => {
    mockProviderConfigService.getByIdentifier.mockResolvedValue(null);

    const result = await controller.getConfig(adminUser, 'x');

    expect(result.isConfigured).toBe(false);
    expect(result.enabled).toBe(false);
    expect(result.redirectUri).toBe('');
    expect(result.name).toBe('X');
    expect(result.scopes).toBe('tweet.read, tweet.write');
  });

  it('should return isConfigured false when decrypt returns empty', async () => {
    const config = createDbConfig({ clientId: 'enc-id', clientSecret: 'enc-secret' });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: undefined, clientSecret: undefined });

    const result = await controller.getConfig(adminUser, 'x');

    expect(result.isConfigured).toBe(false);
  });

  it('should return isConfigured true when only clientId is present', async () => {
    const config = createDbConfig({ clientId: 'enc-id', clientSecret: null });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: 'decrypted-id', clientSecret: undefined });

    const result = await controller.getConfig(adminUser, 'x');

    expect(result.isConfigured).toBe(true);
  });
});

describe('saveConfig', () => {
  const validBody = {
    enabled: true,
    clientId: 'my-client-id',
    clientSecret: 'my-client-secret',
    redirectUri: 'https://callback.com',
    scopes: 'read,write',
    setupInstructions: 'How to set up',
    additionalConfig: '{"key":"val"}',
  };

  it('should upsert with correct data and return result', async () => {
    const upsertResult = createDbConfig({ identifier: 'x' });
    mockProviderConfigService.upsert.mockResolvedValue(upsertResult);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: 'decrypted-id', clientSecret: 'decrypted-secret' });

    const result = await controller.saveConfig(adminUser, 'x', validBody);

    expect(mockProviderConfigService.upsert).toHaveBeenCalledWith('x', {
      name: 'X',
      enabled: true,
      clientId: 'my-client-id',
      clientSecret: 'my-client-secret',
      redirectUri: 'https://callback.com',
      scopes: 'read,write',
      setupInstructions: 'How to set up',
      additionalConfig: '{"key":"val"}',
    });

    expect(mockProviderConfigManager.refreshCache).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      identifier: 'x',
      name: 'X',
      enabled: true,
      isConfigured: true,
      redirectUri: upsertResult.redirectUri,
      scopes: upsertResult.scopes,
      additionalConfig: upsertResult.additionalConfig,
      setupInstructions: upsertResult.setupInstructions,
    });
  });

  it('should pass undefined for body fields not provided', async () => {
    const body = { enabled: true };
    const upsertResult = createDbConfig({ identifier: 'x' });
    mockProviderConfigService.upsert.mockResolvedValue(upsertResult);
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: undefined, clientSecret: undefined });

    await controller.saveConfig(adminUser, 'x', body);

    expect(mockProviderConfigService.upsert).toHaveBeenCalledWith('x', {
      name: 'X',
      enabled: true,
      clientId: undefined,
      clientSecret: undefined,
      redirectUri: undefined,
      scopes: undefined,
      setupInstructions: undefined,
      additionalConfig: undefined,
    });
  });

  it.each([
    ['enabled', 'enabled must be a boolean'],
  ])('should throw 400 when %s is not boolean', async (field, message) => {
    const body = { enabled: 'not-boolean' } as any;
    await expect(controller.saveConfig(adminUser, 'x', body))
      .rejects.toThrow(BadRequestException);
  });

  it.each([
    ['clientId', 'clientId must be a string', { enabled: true, clientId: 123 }],
    ['clientSecret', 'clientSecret must be a string', { enabled: true, clientSecret: 456 }],
    ['redirectUri', 'redirectUri must be a string', { enabled: true, redirectUri: 789 }],
    ['scopes', 'scopes must be a string', { enabled: true, scopes: true }],
    ['setupInstructions', 'setupInstructions must be a string', { enabled: true, setupInstructions: 999 }],
    ['additionalConfig', 'additionalConfig must be a string', { enabled: true, additionalConfig: [] }],
  ])('should throw 400 when %s is not a string', async (_field, message, body) => {
    const err = await controller.saveConfig(adminUser, 'x', body as any).catch(e => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe(message);
  });

  it('should throw 400 for unknown provider identifier', async () => {
    const body = { enabled: true };
    const err = await controller.saveConfig(adminUser, 'nonexistent', body).catch(e => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('should handle refreshCache failure gracefully', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const err = new Error('cache down');

    mockProviderConfigService.upsert.mockResolvedValue(createDbConfig({ identifier: 'x' }));
    mockProviderConfigService.decryptConfig.mockReturnValue({ clientId: 'id', clientSecret: 'secret' });
    mockProviderConfigManager.refreshCache.mockRejectedValue(err);

    const result = await controller.saveConfig(adminUser, 'x', { enabled: true });

    expect(result.isConfigured).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to refresh cache after config upsert, stale cache will self-correct'),
    );
    warnSpy.mockRestore();
  });
});

describe('deleteConfig', () => {
  it('should delete existing config and refresh cache', async () => {
    const config = createDbConfig({ identifier: 'x' });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    mockProviderConfigService.delete.mockResolvedValue(undefined);

    const result = await controller.deleteConfig(adminUser, 'x');

    expect(mockProviderConfigService.getByIdentifier).toHaveBeenCalledWith('x');
    expect(mockProviderConfigService.delete).toHaveBeenCalledWith('x');
    expect(mockProviderConfigManager.refreshCache).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('should return already deleted when no config exists', async () => {
    mockProviderConfigService.getByIdentifier.mockResolvedValue(null);

    const result = await controller.deleteConfig(adminUser, 'x');

    expect(mockProviderConfigService.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, message: 'Already deleted' });
  });

  it('should handle Prisma P2025 error gracefully', async () => {
    const config = createDbConfig({ identifier: 'x' });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    mockProviderConfigService.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.5.0',
      }),
    );

    const result = await controller.deleteConfig(adminUser, 'x');

    expect(result).toEqual({ success: true, message: 'Already deleted' });
  });

  it('should throw non-P2025 errors', async () => {
    const config = createDbConfig({ identifier: 'x' });
    mockProviderConfigService.getByIdentifier.mockResolvedValue(config);
    const genericError = new Error('DB connection failed');
    mockProviderConfigService.delete.mockRejectedValue(genericError);

    await expect(controller.deleteConfig(adminUser, 'x')).rejects.toThrow('DB connection failed');
  });
});

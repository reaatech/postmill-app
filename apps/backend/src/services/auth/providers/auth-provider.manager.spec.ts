import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AuthProviderManager } from './auth-provider.manager';

const ORIGINAL_ENV = { ...process.env };

function makeManager(overrides: {
  kernel?: Partial<{
    latestActive: (...args: any[]) => any;
    versions: (...args: any[]) => any;
    resolveForRead: (...args: any[]) => any;
  }>;
  repo?: Partial<{ list: (...args: any[]) => any }>;
  runtimeContext?: Partial<{ build: (...args: any[]) => any }>;
}) {
  const kernel = {
    latestActive: vi.fn().mockReturnValue(undefined),
    versions: vi.fn().mockReturnValue([]),
    resolveForRead: vi.fn().mockReturnValue({
      create: vi.fn().mockReturnValue({ mocked: 'provider' }),
    }),
    ...overrides.kernel,
  };

  const repo = {
    list: vi.fn().mockResolvedValue([]),
    ...overrides.repo,
  };

  const runtimeContext = {
    build: vi.fn().mockReturnValue({ mocked: 'ctx' }),
    ...overrides.runtimeContext,
  };

  const manager = new AuthProviderManager(
    kernel as any,
    runtimeContext as any,
    repo as any
  );

  return { manager, kernel, repo, runtimeContext };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('AuthProviderManager', () => {
  describe('getProviders', () => {
    it('returns enabled DB providers when at least one is configured', async () => {
      const { manager, kernel, repo } = makeManager({
        repo: {
          list: vi.fn().mockResolvedValue([
            {
              provider: 'GOOGLE',
              enabled: true,
              displayName: 'Workspace SSO',
            },
            { provider: 'GITHUB', enabled: false, displayName: null },
            { provider: 'GENERIC', enabled: true, displayName: null },
          ]),
        },
        kernel: {
          latestActive: vi.fn().mockReturnValue({
            manifest: { version: 'v2', status: 'active' },
          }),
        },
      });

      const result = await manager.getProviders();

      expect(repo.list).toHaveBeenCalled();
      expect(result.providers).toEqual([
        { provider: 'GOOGLE', displayName: 'Workspace SSO', version: 'v2', status: 'active' },
        { provider: 'GENERIC', displayName: 'OIDC', version: 'v2', status: 'active' },
      ]);
    });

    it('falls back to LOCAL + GITHUB outside IS_GENERAL mode', async () => {
      delete process.env.IS_GENERAL;
      const { manager, kernel } = makeManager({
        kernel: {
          latestActive: vi.fn().mockReturnValue({
            manifest: { version: 'v1', status: 'active' },
          }),
        },
      });

      const result = await manager.getProviders();

      expect(result.providers).toEqual([
        { provider: 'LOCAL', displayName: 'Email', version: 'v1', status: 'active' },
        { provider: 'GITHUB', displayName: 'GitHub', version: 'v1', status: 'active' },
      ]);
    });

    it('falls back to LOCAL + GENERIC in IS_GENERAL mode when POSTMILL_GENERIC_OAUTH is set', async () => {
      process.env.IS_GENERAL = 'true';
      process.env.POSTMILL_GENERIC_OAUTH = 'true';
      process.env.NEXT_PUBLIC_POSTMILL_OAUTH_DISPLAY_NAME = 'Custom OIDC';
      const { manager } = makeManager({});

      const result = await manager.getProviders();

      expect(result.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: 'LOCAL', displayName: 'Email' }),
          expect.objectContaining({ provider: 'GENERIC', displayName: 'Custom OIDC' }),
        ])
      );
      expect(result.providers).toHaveLength(2);
    });

    it('falls back to Google + optional Farcaster/Wallet in IS_GENERAL mode without generic OAuth', async () => {
      process.env.IS_GENERAL = 'true';
      delete process.env.POSTMILL_GENERIC_OAUTH;
      process.env.NEYNAR_CLIENT_ID = 'neynar-id';
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
      const { manager } = makeManager({});

      const result = await manager.getProviders();

      expect(result.providers.map((p: any) => p.provider)).toEqual([
        'LOCAL',
        'GOOGLE',
        'FARCASTER',
        'WALLET',
      ]);
    });

    it('omits optional providers when their env keys are absent', async () => {
      process.env.IS_GENERAL = 'true';
      delete process.env.POSTMILL_GENERIC_OAUTH;
      delete process.env.NEYNAR_CLIENT_ID;
      delete process.env.STRIPE_PUBLISHABLE_KEY;
      const { manager } = makeManager({});

      const result = await manager.getProviders();

      expect(result.providers.map((p: any) => p.provider)).toEqual([
        'LOCAL',
        'GOOGLE',
      ]);
    });

    it('uses DEFAULT_VERSION/active when the kernel has no manifest for a provider', async () => {
      delete process.env.IS_GENERAL;
      const { manager } = makeManager({
        kernel: {
          latestActive: vi.fn().mockReturnValue(undefined),
          versions: vi.fn().mockReturnValue([]),
        },
      });

      const result = await manager.getProviders();

      expect(result.providers).toEqual([
        { provider: 'LOCAL', displayName: 'Email', version: 'v1', status: 'active' },
        { provider: 'GITHUB', displayName: 'GitHub', version: 'v1', status: 'active' },
      ]);
    });
  });

  describe('getProvider', () => {
    it('resolves the kernel module, normalises the id to lowercase, and forwards repo + redis', () => {
      const { manager, kernel, runtimeContext, repo } = makeManager({});

      const provider = manager.getProvider('GITHUB');

      expect(kernel.resolveForRead).toHaveBeenCalledWith('auth', 'github', 'v1');
      expect(runtimeContext.build).toHaveBeenCalledWith({
        extras: { authProviderRepo: repo, redis: expect.anything() },
      });
      expect(provider).toEqual({ mocked: 'provider' });
    });

    it('respects an explicit version', () => {
      const { manager, kernel } = makeManager({});

      manager.getProvider('GOOGLE', 'v2');

      expect(kernel.resolveForRead).toHaveBeenCalledWith('auth', 'google', 'v2');
    });
  });
});

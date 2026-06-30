import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgAiSettingsController } from './org-ai-settings.controller';
import { DefaultsSeedService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-seed.service';
import { DefaultsResolutionService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-resolution.service';
import { DefaultsSettingsValidator } from '@gitroom/nestjs-libraries/ai/defaults/defaults-settings.validator';
import { OrgDefaultModelRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-default-model.repository';

const mockRedisKeys = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: vi.fn(),
    set: vi.fn(),
    del: (...args: any[]) => mockRedisDel(...args),
    keys: (...args: any[]) => mockRedisKeys(...args),
  },
}));

const mockResolveAI = vi.fn();
vi.mock('@gitroom/nestjs-libraries/providers/provider-resolution.service', () => ({
  ProviderResolutionService: class {
    resolveAI = mockResolveAI;
  },
}));

const mockKernelListManifests = vi.fn().mockReturnValue([]);
vi.mock('@gitroom/nestjs-libraries/providers/providers.module', () => ({
  PROVIDER_KERNEL: 'PROVIDER_KERNEL',
}));

const mockOrgAiUpsert = vi.fn();
const mockOrgAiSetActive = vi.fn();
const mockOrgAiGetActiveProvider = vi.fn();
const mockOrgAiGetProviders = vi.fn();
const mockOrgAiDelete = vi.fn();

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service',
  () => ({
    OrgAiSettingsService: class {
      upsert = mockOrgAiUpsert;
      setActive = mockOrgAiSetActive;
      getActiveProvider = mockOrgAiGetActiveProvider;
      getProviders = mockOrgAiGetProviders;
      delete = mockOrgAiDelete;
    },
  }),
);

const mockDefaultsResolve = vi.fn();
const mockDefaultsCandidates = vi.fn();

vi.mock(
  '@gitroom/nestjs-libraries/ai/defaults/defaults-resolution.service',
  () => ({
    DefaultsResolutionService: class {
      resolve = mockDefaultsResolve;
      resolveAll = vi.fn();
      candidates = mockDefaultsCandidates;
    },
  }),
);

const mockRepositoryGet = vi.fn();
const mockRepositoryUpsert = vi.fn();
const mockRepositoryGetAll = vi.fn();
const mockRepositoryRemove = vi.fn();

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-default-model.repository',
  () => ({
    OrgDefaultModelRepository: class {
      get = mockRepositoryGet;
      upsert = mockRepositoryUpsert;
      getAll = mockRepositoryGetAll;
      remove = mockRepositoryRemove;
    },
  }),
);

const mockOrganizationGetAllIds = vi.fn();
vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({
    OrganizationService: class {
      getAllIds = mockOrganizationGetAllIds;
    },
  }),
);

const org = { id: 'org-1' } as any;

function stubAdapter(identifier = 'openai') {
  return {
    identifier,
    name: 'OpenAI',
    type: 'direct',
    credentialFields: [{ key: 'apiKey', required: true }],
    capabilities: { text: true },
    validateCredentials: vi.fn(),
  };
}

function makeController(seedService?: DefaultsSeedService) {
  return new OrgAiSettingsController(
    new (OrgAiSettingsService as any)(),
    seedService ?? (new (DefaultsSeedService as any)() as DefaultsSeedService),
    new (DefaultsResolutionService as any)(),
    new (OrgDefaultModelRepository as any)(),
    new (ProviderResolutionService as any)(),
    { validate: (_domain: any, _category: any, settings: any) => settings } as any,
    {
      listManifests: mockKernelListManifests,
    } as any,
  );
}

import { OrgAiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';

describe('OrgAiSettingsController — seed + cache invalidation', () => {
  let controller: OrgAiSettingsController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAI.mockReturnValue(stubAdapter());
    mockOrgAiUpsert.mockResolvedValue({ identifier: 'openai' });
    mockOrgAiSetActive.mockResolvedValue({ isActive: true });
    mockRedisKeys.mockResolvedValue([]);
    mockRedisDel.mockResolvedValue(0);
  });

  it('enabling a provider seeds unset OrgDefaultModel rows and leaves existing rows untouched', async () => {
    const storedRows: Record<string, any> = {
      'ai:low-reasoning': {
        providerId: 'openai',
        version: 'v1',
        model: 'existing-model',
        settings: null,
      },
    };

    mockRepositoryGet.mockImplementation(
      (_orgId: string, domain: string, category: string) => {
        const key = `${domain}:${category}`;
        return Promise.resolve(storedRows[key] ?? null);
      },
    );

    mockDefaultsResolve.mockResolvedValue({
      providerId: 'openai',
      version: 'v1',
      model: 'gpt-4.1',
      source: 'auto',
    });

    const seedService = new DefaultsSeedService(
      new (OrgDefaultModelRepository as any)() as OrgDefaultModelRepository,
      new (DefaultsResolutionService as any)() as DefaultsResolutionService,
      { getAllIds: mockOrganizationGetAllIds } as any,
    );
    const seedSpy = vi.spyOn(seedService, 'seedUnset');

    controller = makeController(seedService);
    const result = await controller.upsertConfig(org, 'openai', {
      credentials: { apiKey: 'sk-test' },
    });

    expect(result).toEqual({ identifier: 'openai', success: true });

    // The controller fires seeding asynchronously; await it before asserting.
    await seedSpy.mock.results[0].value;

    // The existing low-reasoning row must not be overwritten.
    const upsertCalls = mockRepositoryUpsert.mock.calls.map(
      (c: any) => `${c[1]}:${c[2]}`,
    );
    expect(upsertCalls).not.toContain('ai:low-reasoning');

    // Other AI categories should have been seeded.
    expect(upsertCalls.length).toBeGreaterThan(0);
    expect(upsertCalls).toContain('ai:high-reasoning');
    expect(upsertCalls).toContain('ai:workflow');
    expect(upsertCalls).toContain('ai:vision');
  });

  it('keeps the config call successful even if seeding throws', async () => {
    const seedService = {
      seedUnset: vi.fn().mockRejectedValue(new Error('seed failed')),
      seedAllOrgs: vi.fn(),
    } as unknown as DefaultsSeedService;

    controller = makeController(seedService);
    const result = await controller.upsertConfig(org, 'openai', {
      credentials: { apiKey: 'sk-test' },
    });

    expect(result).toEqual({ identifier: 'openai', success: true });
    expect(seedService.seedUnset).toHaveBeenCalledWith('org-1');
  });

  it('busts both AI and media defaults catalog caches on provider change', async () => {
    mockRedisKeys
      .mockResolvedValueOnce([
        'settings:ai:defaults:catalog:org-1:low-reasoning',
      ])
      .mockResolvedValueOnce([
        'settings:content:media-defaults:catalog:org-1:text-to-image',
      ]);

    controller = makeController();
    await controller.upsertConfig(org, 'openai', {
      credentials: { apiKey: 'sk-test' },
    });

    expect(mockRedisKeys).toHaveBeenCalledWith(
      'settings:ai:defaults:catalog:org-1:*',
    );
    expect(mockRedisKeys).toHaveBeenCalledWith(
      'settings:content:media-defaults:catalog:org-1:*',
    );
    expect(mockRedisDel).toHaveBeenCalledWith(
      'settings:ai:defaults:catalog:org-1:low-reasoning',
    );
    expect(mockRedisDel).toHaveBeenCalledWith(
      'settings:content:media-defaults:catalog:org-1:text-to-image',
    );
  });

  it('busts both caches on set-active and delete', async () => {
    mockRedisKeys.mockResolvedValue([]);

    controller = makeController();
    await controller.setActive(org, 'openai');
    expect(mockRedisKeys).toHaveBeenCalledWith(
      'settings:ai:defaults:catalog:org-1:*',
    );
    expect(mockRedisKeys).toHaveBeenCalledWith(
      'settings:content:media-defaults:catalog:org-1:*',
    );

    vi.clearAllMocks();
    mockRedisKeys.mockResolvedValue([]);
    await controller.deleteConfig(org, 'openai');
    expect(mockRedisKeys).toHaveBeenCalledWith(
      'settings:ai:defaults:catalog:org-1:*',
    );
    expect(mockRedisKeys).toHaveBeenCalledWith(
      'settings:content:media-defaults:catalog:org-1:*',
    );
  });
});

describe('OrgAiSettingsController — model defaults validation', () => {
  const validator = new DefaultsSettingsValidator();

  function makeControllerWithValidator() {
    return new OrgAiSettingsController(
      new (OrgAiSettingsService as any)(),
      { seedUnset: vi.fn() } as any,
      new (DefaultsResolutionService as any)(),
      new (OrgDefaultModelRepository as any)(),
      new (ProviderResolutionService as any)(),
      validator,
      { listManifests: vi.fn().mockReturnValue([]) } as any,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepositoryUpsert.mockResolvedValue(undefined);
    mockRedisKeys.mockResolvedValue([]);
    mockRedisDel.mockResolvedValue(0);
  });

  it('PUT /settings/ai/defaults/:category strips prompt and persists cleaned settings', async () => {
    const controller = makeControllerWithValidator();
    await controller.setModelDefault(org, 'low-reasoning', {
      providerId: 'openai',
      version: 'v1',
      model: 'gpt-4.1',
      settings: { prompt: 'ignored', temperature: 0.7 },
    } as any);

    expect(mockRepositoryUpsert).toHaveBeenCalledWith(
      'org-1',
      'ai',
      'low-reasoning',
      expect.objectContaining({
        settings: { temperature: 0.7 },
      }),
    );
  });

  it('PUT rejects unknown AI settings keys', async () => {
    const controller = makeControllerWithValidator();
    await expect(
      controller.setModelDefault(org, 'low-reasoning', {
        providerId: 'openai',
        version: 'v1',
        settings: { unknownKey: 'x' },
      } as any),
    ).rejects.toMatchObject({ status: 400 });
  });
});

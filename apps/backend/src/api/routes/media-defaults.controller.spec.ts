import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaDefaultsController } from './media-defaults.controller';
import { DefaultsResolutionService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-resolution.service';
import { DefaultsSeedService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-seed.service';
import { OrgDefaultModelRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-default-model.repository';
import { OrgMediaProviderSettingsService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service';
import { DefaultsSettingsValidator } from '@gitroom/nestjs-libraries/ai/defaults/defaults-settings.validator';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisKeys = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
    keys: (...args: any[]) => mockRedisKeys(...args),
    del: (...args: any[]) => mockRedisDel(...args),
  },
}));

const mockOrgMediaGetProviders = vi.fn();
const mockOrgMediaUpsert = vi.fn();
const mockOrgMediaSetActive = vi.fn();
const mockOrgMediaDelete = vi.fn();
const mockOrgMediaGetConfigForProvider = vi.fn().mockResolvedValue({ credentials: {} });

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.service',
  () => ({
    OrgMediaProviderSettingsService: class {
      getProviders = mockOrgMediaGetProviders;
      upsert = mockOrgMediaUpsert;
      setActive = mockOrgMediaSetActive;
      delete = mockOrgMediaDelete;
      getConfigForProvider = mockOrgMediaGetConfigForProvider;
    },
  }),
);

const mockDefaultsResolveAll = vi.fn();
const mockDefaultsCandidates = vi.fn();

vi.mock(
  '@gitroom/nestjs-libraries/ai/defaults/defaults-resolution.service',
  () => ({
    DefaultsResolutionService: class {
      resolveAll = mockDefaultsResolveAll;
      candidates = mockDefaultsCandidates;
    },
  }),
);

const mockRepositoryGetAll = vi.fn();
const mockRepositoryUpsert = vi.fn();
const mockRepositoryRemove = vi.fn();

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-default-model.repository',
  () => ({
    OrgDefaultModelRepository: class {
      getAll = mockRepositoryGetAll;
      upsert = mockRepositoryUpsert;
      remove = mockRepositoryRemove;
    },
  }),
);

const mockKernelGet = vi.fn();
const mockKernelListManifests = vi.fn();

vi.mock('@gitroom/nestjs-libraries/providers/providers.module', () => ({
  PROVIDER_KERNEL: 'PROVIDER_KERNEL',
}));

function makeController() {
  return new MediaDefaultsController(
    new (OrgMediaProviderSettingsService as any)(),
    { seedUnset: vi.fn() } as any,
    new (DefaultsResolutionService as any)(),
    new (OrgDefaultModelRepository as any)(),
    {
      get: mockKernelGet,
      listManifests: mockKernelListManifests,
    } as any,
    { resolveMedia: vi.fn() } as any,
    { validate: (_domain: any, _category: any, settings: any) => settings } as any,
  );
}

const org = { id: 'org-1' } as any;

describe('MediaDefaultsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisKeys.mockResolvedValue([]);
    mockRedisDel.mockResolvedValue(0);
  });

  it('GET / returns resolved and stored categories', async () => {
    mockDefaultsResolveAll.mockResolvedValue({
      'text-to-image': { providerId: 'openai', version: 'v1', model: 'dall-e-3' },
    });
    mockRepositoryGetAll.mockResolvedValue([
      { category: 'text-to-image', providerId: 'openai', version: 'v1', model: 'dall-e-3' },
    ]);

    const controller = makeController();
    const result = await controller.getMediaDefaults(org);

    expect(result.categories).toHaveLength(16);
    const imageRow = result.categories.find((c: any) => c.category === 'text-to-image');
    expect(imageRow).toMatchObject({
      category: 'text-to-image',
      providerId: 'openai',
      version: 'v1',
      model: 'dall-e-3',
      source: 'stored',
    });
  });

  it('PUT /:category persists a default and busts catalog cache', async () => {
    mockRepositoryUpsert.mockResolvedValue(undefined);
    const controller = makeController();

    const result = await controller.setMediaDefault(org, 'text-to-image', {
      providerId: 'openai',
      version: 'v1',
      model: 'dall-e-3',
    } as any);

    expect(result).toEqual({ category: 'text-to-image', success: true });
    expect(mockRepositoryUpsert).toHaveBeenCalledWith(
      'org-1',
      'media',
      'text-to-image',
      expect.objectContaining({ providerId: 'openai', version: 'v1', model: 'dall-e-3' }),
    );
    expect(mockRedisKeys).toHaveBeenCalledWith(
      'settings:content:media-defaults:catalog:org-1:*',
    );
  });

  it('PUT /:category strips prompt and validates settings', async () => {
    const validateSpy = vi.fn((_d, _c, s) => s);
    const controller = new MediaDefaultsController(
      new (OrgMediaProviderSettingsService as any)(),
      { seedUnset: vi.fn() } as any,
      new (DefaultsResolutionService as any)(),
      new (OrgDefaultModelRepository as any)(),
      { get: mockKernelGet, listManifests: mockKernelListManifests } as any,
      { resolveMedia: vi.fn() } as any,
      { validate: validateSpy } as any,
    );

    await controller.setMediaDefault(org, 'text-to-image', {
      providerId: 'openai',
      version: 'v1',
      settings: { prompt: 'ignore', resolution: '1024x1024' },
    } as any);

    expect(validateSpy).toHaveBeenCalledWith(
      'media',
      'text-to-image',
      {
        prompt: 'ignore',
        resolution: '1024x1024',
      },
      { providerId: 'openai', model: undefined },
    );
  });

  it('DELETE /:category removes a default', async () => {
    mockRepositoryRemove.mockResolvedValue(undefined);
    const controller = makeController();

    const result = await controller.clearMediaDefault(org, 'text-to-image');

    expect(result).toEqual({ category: 'text-to-image', success: true });
    expect(mockRepositoryRemove).toHaveBeenCalledWith('org-1', 'media', 'text-to-image');
  });

  it('GET /catalog returns candidates and models with label format', async () => {
    mockDefaultsCandidates.mockResolvedValue([
      {
        providerId: 'heygen',
        version: 'v1',
        metadata: { hasModelList: false, kind: 'action', uiName: undefined },
      },
      {
        providerId: 'openai',
        version: 'v1',
        metadata: { hasModelList: true, kind: 'model', uiName: undefined },
      },
    ]);

    mockKernelGet.mockReturnValue({
      create: () => ({
        listModels: vi.fn().mockResolvedValue([
          { id: 'dall-e-3', label: 'DALL·E 3' },
          { id: 'gpt-image-1', label: 'GPT Image' },
        ]),
      }),
    });

    const controller = makeController();
    const result = await controller.getMediaDefaultsCatalog(org, 'text-to-image');

    expect(result.category).toBe('text-to-image');
    expect(result.options).toContainEqual({
      providerId: 'heygen',
      version: 'v1',
      label: 'heygen',
    });
    expect(result.options).toContainEqual({
      providerId: 'openai',
      version: 'v1',
      model: 'dall-e-3',
      label: 'openai: DALL·E 3',
    });
    expect(mockRedisSet).toHaveBeenCalledWith(
      'settings:content:media-defaults:catalog:org-1:text-to-image',
      expect.any(String),
      'EX',
      60,
    );
  });

  it('rejects an invalid category with 400', async () => {
    const controller = makeController();
    await expect(
      controller.setMediaDefault(org, 'not-a-category', {
        providerId: 'openai',
      } as any),
    ).rejects.toMatchObject({ status: 400 });
  });
});

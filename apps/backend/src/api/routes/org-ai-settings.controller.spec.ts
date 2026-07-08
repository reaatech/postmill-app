import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgAiSettingsController } from './org-ai-settings.controller';
import { DefaultsSeedService } from '@gitroom/nestjs-libraries/ai/defaults/defaults-seed.service';
import { AiDefaultsService } from '@gitroom/nestjs-libraries/ai/defaults/ai-defaults.service';

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

const mockDefaultsServiceListProviders = vi.fn();
const mockDefaultsServiceGetProviderConfigSummary = vi.fn();
const mockDefaultsServiceResolveAdapter = vi.fn();
const mockDefaultsServiceBustCache = vi.fn();
const mockDefaultsServiceGetModelDefaults = vi.fn();
const mockDefaultsServiceSetModelDefault = vi.fn();
const mockDefaultsServiceClearModelDefault = vi.fn();
const mockDefaultsServiceGetModelDefaultsCatalog = vi.fn();

function makeDefaultsService(seedService?: DefaultsSeedService): AiDefaultsService {
  return {
    listProviders: mockDefaultsServiceListProviders,
    getProviderConfigSummary: mockDefaultsServiceGetProviderConfigSummary,
    resolveAdapter: mockDefaultsServiceResolveAdapter,
    bustDefaultsCatalogCache: mockDefaultsServiceBustCache,
    getModelDefaults: mockDefaultsServiceGetModelDefaults,
    setModelDefault: mockDefaultsServiceSetModelDefault,
    clearModelDefault: mockDefaultsServiceClearModelDefault,
    getModelDefaultsCatalog: mockDefaultsServiceGetModelDefaultsCatalog,
  } as unknown as AiDefaultsService;
}

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
    makeDefaultsService(seedService),
    seedService ?? (new (DefaultsSeedService as any)() as DefaultsSeedService),
  );
}

import { OrgAiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service';

describe('OrgAiSettingsController — provider config + cache invalidation', () => {
  let controller: OrgAiSettingsController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultsServiceResolveAdapter.mockReturnValue(stubAdapter());
    mockOrgAiUpsert.mockResolvedValue({ identifier: 'openai' });
    mockOrgAiSetActive.mockResolvedValue({ isActive: true });
    mockRedisKeys.mockResolvedValue([]);
    mockRedisDel.mockResolvedValue(0);
  });

  it('listProviders delegates to AiDefaultsService', async () => {
    mockDefaultsServiceListProviders.mockResolvedValue([{ identifier: 'openai' }]);
    controller = makeController();
    const result = await controller.listProviders();
    expect(mockDefaultsServiceListProviders).toHaveBeenCalled();
    expect(result).toEqual([{ identifier: 'openai' }]);
  });

  it('getConfig delegates to AiDefaultsService', async () => {
    mockDefaultsServiceGetProviderConfigSummary.mockResolvedValue({
      active: null,
      providers: [],
    });
    controller = makeController();
    const result = await controller.getConfig(org);
    expect(mockDefaultsServiceGetProviderConfigSummary).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ active: null, providers: [] });
  });

  it('upsertConfig validates provider and busts catalog cache', async () => {
    controller = makeController();
    const result = await controller.upsertConfig(org, 'openai', {
      credentials: { apiKey: 'sk-test' },
    });

    expect(result).toEqual({ identifier: 'openai', success: true });
    expect(mockDefaultsServiceResolveAdapter).toHaveBeenCalledWith('openai', undefined);
    expect(mockOrgAiUpsert).toHaveBeenCalled();
    expect(mockDefaultsServiceBustCache).toHaveBeenCalledWith('org-1');
  });

  it('setActive busts catalog cache', async () => {
    controller = makeController();
    const result = await controller.setActive(org, 'openai');

    expect(result).toEqual({ identifier: 'openai', isActive: true });
    expect(mockOrgAiSetActive).toHaveBeenCalledWith('org-1', 'openai', undefined);
    expect(mockDefaultsServiceBustCache).toHaveBeenCalledWith('org-1');
  });

  it('deleteConfig busts catalog cache', async () => {
    controller = makeController();
    const result = await controller.deleteConfig(org, 'openai');

    expect(result).toEqual({ success: true });
    expect(mockOrgAiDelete).toHaveBeenCalledWith('org-1', 'openai');
    expect(mockDefaultsServiceBustCache).toHaveBeenCalledWith('org-1');
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
});

describe('OrgAiSettingsController — model defaults delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /settings/ai/defaults delegates to AiDefaultsService', async () => {
    mockDefaultsServiceGetModelDefaults.mockResolvedValue({ categories: [] });
    const controller = makeController();
    const result = await controller.getModelDefaults(org);
    expect(mockDefaultsServiceGetModelDefaults).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ categories: [] });
  });

  it('PUT /settings/ai/defaults/:category delegates to AiDefaultsService', async () => {
    mockDefaultsServiceSetModelDefault.mockResolvedValue({
      category: 'low-reasoning',
      success: true,
    });
    const controller = makeController();
    const body = { providerId: 'openai', version: 'v1', model: 'gpt-4.1' } as any;
    const result = await controller.setModelDefault(org, 'low-reasoning', body);
    expect(mockDefaultsServiceSetModelDefault).toHaveBeenCalledWith(
      'org-1',
      'low-reasoning',
      body,
    );
    expect(result).toEqual({ category: 'low-reasoning', success: true });
  });

  it('DELETE /settings/ai/defaults/:category delegates to AiDefaultsService', async () => {
    mockDefaultsServiceClearModelDefault.mockResolvedValue({
      category: 'low-reasoning',
      success: true,
    });
    const controller = makeController();
    const result = await controller.clearModelDefault(org, 'low-reasoning');
    expect(mockDefaultsServiceClearModelDefault).toHaveBeenCalledWith(
      'org-1',
      'low-reasoning',
    );
    expect(result).toEqual({ category: 'low-reasoning', success: true });
  });

  it('GET /settings/ai/defaults/catalog delegates to AiDefaultsService', async () => {
    mockDefaultsServiceGetModelDefaultsCatalog.mockResolvedValue({
      category: 'low-reasoning',
      options: [],
    });
    const controller = makeController();
    const result = await controller.getModelDefaultsCatalog(org, 'low-reasoning');
    expect(mockDefaultsServiceGetModelDefaultsCatalog).toHaveBeenCalledWith(
      'org-1',
      'low-reasoning',
    );
    expect(result).toEqual({ category: 'low-reasoning', options: [] });
  });
});

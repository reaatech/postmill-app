import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: vi.fn(function () {
    return { model: {} };
  }),
}));

import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { OrgAiSettingsRepository } from './org-ai-settings.repository';

describe('OrgAiSettingsRepository', () => {
  let repository: OrgAiSettingsRepository;
  let providerConfig: Record<string, ReturnType<typeof vi.fn>>;
  let systemSettings: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    providerConfig = {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    };
    systemSettings = {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    };
    const pc = new (PrismaRepository as any)();
    pc.model = { aIOrgProviderConfig: providerConfig };
    const ss = new (PrismaRepository as any)();
    ss.model = { aISystemSettings: systemSettings };
    repository = new OrgAiSettingsRepository(pc, ss);
  });

  it('getByOrg scopes by organization', () => {
    repository.getByOrg('org1');
    expect(providerConfig.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1' },
    });
  });

  it('getByIdentifier uses default version v1', () => {
    repository.getByIdentifier('org1', 'openai');
    expect(providerConfig.findUnique).toHaveBeenCalledWith({
      where: { organizationId_identifier_version: { organizationId: 'org1', identifier: 'openai', version: 'v1' } },
    });
  });

  it('getByIdentifier honors an explicit version', () => {
    repository.getByIdentifier('org1', 'openai', 'v2');
    expect(providerConfig.findUnique).toHaveBeenCalledWith({
      where: { organizationId_identifier_version: { organizationId: 'org1', identifier: 'openai', version: 'v2' } },
    });
  });

  it('getActive filters on isActive', () => {
    repository.getActive('org1');
    expect(providerConfig.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org1', isActive: true },
    });
  });

  it('upsert builds create/update payloads with default version', () => {
    repository.upsert('org1', 'openai', { enabled: true, credentials: 'enc' });
    const arg = (providerConfig.upsert as any).mock.calls[0][0];
    expect(arg.where.organizationId_identifier_version.version).toBe('v1');
    expect(arg.create).toMatchObject({ organizationId: 'org1', identifier: 'openai', version: 'v1', enabled: true });
    expect(arg.update).toMatchObject({ enabled: true, credentials: 'enc' });
  });

  it('delete uses default version', () => {
    repository.delete('org1', 'openai');
    expect(providerConfig.delete).toHaveBeenCalledWith({
      where: { organizationId_identifier_version: { organizationId: 'org1', identifier: 'openai', version: 'v1' } },
    });
  });

  it('setActive clears prior actives then activates the target', async () => {
    await repository.setActive('org1', 'openai', 'v2');
    expect(providerConfig.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1', isActive: true },
      data: { isActive: false },
    });
    expect(providerConfig.update).toHaveBeenCalledWith({
      where: { organizationId_identifier_version: { organizationId: 'org1', identifier: 'openai', version: 'v2' } },
      data: { isActive: true, enabled: true },
    });
  });

  describe('getBudget', () => {
    it('parses stored budget settings JSON', async () => {
      systemSettings.findUnique.mockResolvedValue({ budgetSettings: JSON.stringify({ monthlyCap: 50 }) });
      expect(await repository.getBudget('org1')).toEqual({ monthlyCap: 50 });
    });

    it('returns null when no settings row', async () => {
      systemSettings.findUnique.mockResolvedValue(null);
      expect(await repository.getBudget('org1')).toBeNull();
    });

    it('returns null when budgetSettings is empty', async () => {
      systemSettings.findUnique.mockResolvedValue({ budgetSettings: null });
      expect(await repository.getBudget('org1')).toBeNull();
    });

    it('returns null when budgetSettings is invalid JSON', async () => {
      systemSettings.findUnique.mockResolvedValue({ budgetSettings: '{not json' });
      expect(await repository.getBudget('org1')).toBeNull();
    });
  });

  describe('upsertBudget', () => {
    it('merges into existing budget settings', async () => {
      systemSettings.findUnique.mockResolvedValue({ budgetSettings: JSON.stringify({ monthlyCap: 50, dailyCap: 5 }) });
      await repository.upsertBudget('org1', { dailyCap: 10 });
      const arg = (systemSettings.upsert as any).mock.calls[0][0];
      expect(JSON.parse(arg.create.budgetSettings)).toEqual({ monthlyCap: 50, dailyCap: 10 });
      expect(JSON.parse(arg.update.budgetSettings)).toEqual({ monthlyCap: 50, dailyCap: 10 });
    });

    it('starts from empty when no prior settings', async () => {
      systemSettings.findUnique.mockResolvedValue(null);
      await repository.upsertBudget('org1', { monthlyCap: 99 });
      const arg = (systemSettings.upsert as any).mock.calls[0][0];
      expect(JSON.parse(arg.create.budgetSettings)).toEqual({ monthlyCap: 99 });
    });
  });
});

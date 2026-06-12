import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrgAiSettingsRepository {
  constructor(
    private _aiOrgProviderConfig: PrismaRepository<'aIOrgProviderConfig'>,
    private _aiSpendLog: PrismaRepository<'aISpendLog'>,
    private _aiSystemSettings: PrismaRepository<'aISystemSettings'>,
  ) {}

  getByOrg(orgId: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.findMany({
      where: { organizationId: orgId },
    });
  }

  getByIdentifier(orgId: string, identifier: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.findUnique({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
    });
  }

  getActive(orgId: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.findFirst({
      where: { organizationId: orgId, isActive: true },
    });
  }

  upsert(
    orgId: string,
    identifier: string,
    data: {
      enabled?: boolean;
      isActive?: boolean;
      credentials?: string;
      defaultModel?: string;
      reasoningModel?: string;
      extraConfig?: string;
    },
  ) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.upsert({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      create: { organizationId: orgId, identifier, ...data },
      update: data,
    });
  }

  delete(orgId: string, identifier: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.delete({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
    });
  }

  async setActive(orgId: string, identifier: string) {
    await this._aiOrgProviderConfig.model.aIOrgProviderConfig.updateMany({
      where: { organizationId: orgId, isActive: true },
      data: { isActive: false },
    });
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.update({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      data: { isActive: true, enabled: true },
    });
  }

  getSpendLogs(orgId: string, scope?: string, limit = 100, offset = 0) {
    const where: Record<string, any> = { organizationId: orgId };
    if (scope) where.scope = scope;
    return this._aiSpendLog.model.aISpendLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getBudget(orgId: string) {
    const settings = await this._aiSystemSettings.model.aISystemSettings.findUnique({
      where: { id: 'singleton' },
      select: { budgetSettings: true },
    });
    if (settings?.budgetSettings) {
      try {
        return JSON.parse(settings.budgetSettings);
      } catch { /* fall through */ }
    }
    return null;
  }

  async upsertBudget(orgId: string, data: Record<string, any>) {
    const settings = await this._aiSystemSettings.model.aISystemSettings.findUnique({
      where: { id: 'singleton' },
    });
    const existing = settings?.budgetSettings ? JSON.parse(settings.budgetSettings) : {};
    const budgetSettings = JSON.stringify({ ...existing, ...data });
    return this._aiSystemSettings.model.aISystemSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', budgetSettings },
      update: { budgetSettings },
    });
  }
}

import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrgAiSettingsRepository {
  constructor(
    private _aiOrgProviderConfig: PrismaRepository<'aIOrgProviderConfig'>,
    private _aiSystemSettings: PrismaRepository<'aISystemSettings'>,
  ) {}

  getByOrg(orgId: string) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.findMany({
      where: { organizationId: orgId },
    });
  }

  getByIdentifier(orgId: string, identifier: string, version = 'v1') {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.findUnique({
      where: { organizationId_identifier_version: { organizationId: orgId, identifier, version } },
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
    version = 'v1',
  ) {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.upsert({
      where: { organizationId_identifier_version: { organizationId: orgId, identifier, version } },
      create: { organizationId: orgId, identifier, version, ...data },
      update: data,
    });
  }

  delete(orgId: string, identifier: string, version = 'v1') {
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.delete({
      where: { organizationId_identifier_version: { organizationId: orgId, identifier, version } },
    });
  }

  async setActive(orgId: string, identifier: string, version = 'v1') {
    await this._aiOrgProviderConfig.model.aIOrgProviderConfig.updateMany({
      where: { organizationId: orgId, isActive: true },
      data: { isActive: false },
    });
    return this._aiOrgProviderConfig.model.aIOrgProviderConfig.update({
      where: { organizationId_identifier_version: { organizationId: orgId, identifier, version } },
      data: { isActive: true, enabled: true },
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

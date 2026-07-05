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

  // 0.3: budget caps are per-org, stored under the singleton's
  // `budgetSettings.perOrgCaps[orgId]`. Return ONLY this org's slice — never the
  // whole blob (which would leak `perOrgCaps` = other tenants' org ids + caps).
  // The stored slice uses BudgetService's per-org keys (`monthly`/`daily`);
  // translate back to the client/DTO contract (`monthlyCap`/`dailyCap`) on read.
  async getBudget(orgId: string) {
    const settings = await this._aiSystemSettings.model.aISystemSettings.findUnique({
      where: { id: 'singleton' },
      select: { budgetSettings: true },
    });
    if (settings?.budgetSettings) {
      try {
        const parsed = JSON.parse(settings.budgetSettings);
        const slice = parsed?.perOrgCaps?.[orgId];
        return slice ? this.#budgetSliceToDto(slice) : null;
      } catch { /* fall through */ }
    }
    return null;
  }

  // 0.3: merge the update into this org's slice only, preserving other orgs'
  // caps. 3.10: guard the JSON.parse so a corrupt/legacy blob doesn't 500 every
  // subsequent update (mirror the read path — fall back to `{}`).
  // CRITICAL: `BudgetService.checkBudget` enforces `perOrgCaps[org].monthly` /
  // `.daily` (the `perOrgCaps: Record<string,{monthly?,daily?}>` type), while the
  // client/DTO sends `monthlyCap`/`dailyCap`. Translate to the enforced keys here
  // or the org cap is stored but never enforced.
  async upsertBudget(orgId: string, data: Record<string, any>) {
    const settings = await this._aiSystemSettings.model.aISystemSettings.findUnique({
      where: { id: 'singleton' },
    });
    let existing: Record<string, any> = {};
    if (settings?.budgetSettings) {
      try {
        existing = JSON.parse(settings.budgetSettings);
      } catch {
        existing = {};
      }
    }
    const perOrgCaps = { ...(existing.perOrgCaps ?? {}) };
    perOrgCaps[orgId] = {
      ...(perOrgCaps[orgId] ?? {}),
      ...this.#dtoToBudgetSlice(data),
    };
    const budgetSettings = JSON.stringify({ ...existing, perOrgCaps });
    return this._aiSystemSettings.model.aISystemSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', budgetSettings },
      update: { budgetSettings },
    });
  }

  // DTO (`monthlyCap`/`dailyCap`) → the per-org slice keys BudgetService enforces
  // (`monthly`/`daily`). Any other fields (alertThresholdPct, enabled) pass through.
  #dtoToBudgetSlice(data: Record<string, any>): Record<string, any> {
    const { monthlyCap, dailyCap, ...rest } = data ?? {};
    const slice: Record<string, any> = { ...rest };
    if (monthlyCap !== undefined) slice.monthly = monthlyCap;
    if (dailyCap !== undefined) slice.daily = dailyCap;
    return slice;
  }

  // Stored slice (`monthly`/`daily`) → the client/DTO contract
  // (`monthlyCap`/`dailyCap`) so GET round-trips what PUT accepts.
  #budgetSliceToDto(slice: Record<string, any>): Record<string, any> {
    const { monthly, daily, ...rest } = slice ?? {};
    const dto: Record<string, any> = { ...rest };
    if (monthly !== undefined) dto.monthlyCap = monthly;
    if (daily !== undefined) dto.dailyCap = daily;
    return dto;
  }
}

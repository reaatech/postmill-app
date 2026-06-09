import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrgProviderConfigRepository {
  constructor(
    private _orgProviderConfig: PrismaRepository<'orgProviderConfiguration'>
  ) {}

  getByOrg(orgId: string) {
    return this._orgProviderConfig.model.orgProviderConfiguration.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
  }

  getByIdentifier(orgId: string, identifier: string) {
    return this._orgProviderConfig.model.orgProviderConfiguration.findUnique({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
    });
  }

  getEnabledByOrg(orgId: string) {
    return this._orgProviderConfig.model.orgProviderConfiguration.findMany({
      where: { organizationId: orgId, enabled: true },
      orderBy: { name: 'asc' },
    });
  }

  upsert(
    orgId: string,
    identifier: string,
    data: {
      name: string;
      enabled: boolean;
      clientId?: string | null;
      clientSecret?: string | null;
      redirectUri?: string | null;
      scopes?: string | null;
      additionalConfig?: string | null;
      setupNotes?: string | null;
    }
  ) {
    return this._orgProviderConfig.model.orgProviderConfiguration.upsert({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      create: { organizationId: orgId, identifier, ...data },
      update: data,
    });
  }

  setEnabled(orgId: string, identifier: string, enabled: boolean) {
    return this._orgProviderConfig.model.orgProviderConfiguration.update({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      data: { enabled },
    });
  }

  delete(orgId: string, identifier: string) {
    return this._orgProviderConfig.model.orgProviderConfiguration.update({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      data: { enabled: false, clientId: null, clientSecret: null, additionalConfig: null },
    });
  }

  hardDelete(orgId: string, identifier: string) {
    return this._orgProviderConfig.model.orgProviderConfiguration.delete({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
    });
  }
}

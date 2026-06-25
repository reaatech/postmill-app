import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrgContentPackSettingsRepository {
  constructor(
    private _contentPackConfig: PrismaRepository<'contentPackConfig'>,
    private _organization: PrismaRepository<'organization'>,
  ) {}

  getByOrg(orgId: string) {
    return this._contentPackConfig.model.contentPackConfig.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  getByIdentifier(orgId: string, identifier: string) {
    return this._contentPackConfig.model.contentPackConfig.findUnique({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
    });
  }

  upsert(
    orgId: string,
    identifier: string,
    data: {
      credentials?: string;
      extraConfig?: any;
    }
  ) {
    return this._contentPackConfig.model.contentPackConfig.upsert({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      create: {
        organizationId: orgId,
        identifier,
        ...data,
      },
      update: data,
    });
  }

  delete(orgId: string, identifier: string) {
    return this._contentPackConfig.model.contentPackConfig.deleteMany({
      where: { organizationId: orgId, identifier },
    });
  }

  getActivePointer(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: { id: orgId },
      select: { activeContentPackIdentifier: true },
    });
  }

  setActivePointer(orgId: string, identifier: string | null) {
    return this._organization.model.organization.update({
      where: { id: orgId },
      data: { activeContentPackIdentifier: identifier },
    });
  }
}

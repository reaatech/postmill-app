import { Injectable } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class OrgVpnConfigRepository {
  constructor(private _prisma: PrismaService) {}

  getByOrg(orgId: string) {
    return this._prisma.orgVpnConfig.findMany({
      where: { organizationId: orgId },
    });
  }

  getByIdentifier(orgId: string, identifier: string) {
    return this._prisma.orgVpnConfig.findFirst({
      where: { organizationId: orgId, identifier },
    });
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      name?: string;
      credentials?: string;
      regions?: string;
      enabled?: boolean;
    },
    version = 'v1',
  ) {
    const existing = await this.getByIdentifier(orgId, identifier);
    if (existing) {
      return this._prisma.orgVpnConfig.update({
        where: { id: existing.id },
        data,
      });
    }
    return this._prisma.orgVpnConfig.create({
      data: { organizationId: orgId, identifier, version, ...data },
    });
  }

  async delete(orgId: string, identifier: string) {
    return this._prisma.orgVpnConfig.deleteMany({
      where: { organizationId: orgId, identifier },
    });
  }
}

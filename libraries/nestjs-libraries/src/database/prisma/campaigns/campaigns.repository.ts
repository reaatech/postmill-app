import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CampaignsRepository {
  constructor(
    private _prisma: PrismaService,
  ) {}

  findByOrg(organizationId: string) {
    return this._prisma.campaign.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { posts: true } } },
    });
  }

  findById(id: string, organizationId: string) {
    return this._prisma.campaign.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { _count: { select: { posts: true } } },
    });
  }

  create(data: {
    organizationId: string;
    name: string;
    color?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    return this._prisma.campaign.create({ data });
  }

  update(
    id: string,
    organizationId: string,
    data: {
      name?: string;
      color?: string;
      description?: string;
      startDate?: Date;
      endDate?: Date;
      archived?: boolean;
    },
  ) {
    return this._prisma.campaign.update({ where: { id, organizationId }, data });
  }

  softDelete(id: string, organizationId: string) {
    return this._prisma.campaign.update({
      where: { id, organizationId },
      data: { deletedAt: new Date() },
    });
  }
}

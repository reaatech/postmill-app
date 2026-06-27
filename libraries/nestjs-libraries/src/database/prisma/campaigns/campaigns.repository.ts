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

  // Lightweight fetch for the per-entity campaign selector (id/name/color/dates).
  findByIds(organizationId: string, ids: string[]) {
    return this._prisma.campaign.findMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        color: true,
        startDate: true,
        endDate: true,
        archived: true,
      },
      orderBy: { createdAt: 'desc' },
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

  async getEngagement(id: string, organizationId: string) {
    const result = await this._prisma.post.aggregate({
      where: { campaignId: id, organizationId, deletedAt: null },
      _sum: { lastViews: true, lastLikes: true, lastComments: true },
      _avg: { lastViews: true, lastLikes: true, lastComments: true },
    });

    const topPost = await this._prisma.post.findFirst({
      where: { campaignId: id, organizationId, deletedAt: null },
      orderBy: [
        { lastLikes: { sort: 'desc', nulls: 'last' } },
        { lastComments: { sort: 'desc', nulls: 'last' } },
      ],
      select: {
        id: true,
        content: true,
        title: true,
        lastViews: true,
        lastLikes: true,
        lastComments: true,
        integration: { select: { name: true } },
      },
    });

    return {
      totalViews: result._sum.lastViews || 0,
      totalLikes: result._sum.lastLikes || 0,
      totalComments: result._sum.lastComments || 0,
      avgViews: result._avg.lastViews || 0,
      avgLikes: result._avg.lastLikes || 0,
      avgComments: result._avg.lastComments || 0,
      topPost: topPost
        ? {
            id: topPost.id,
            title: topPost.title || topPost.content?.slice(0, 100) || '',
            lastViews: topPost.lastViews,
            lastLikes: topPost.lastLikes,
            lastComments: topPost.lastComments,
            integration: topPost.integration?.name || '',
          }
        : null,
    };
  }
}

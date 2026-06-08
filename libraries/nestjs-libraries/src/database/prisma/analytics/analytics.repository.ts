import { PrismaRepository, PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsRepository {
  constructor(
    private _analyticsSnapshot: PrismaRepository<'analyticsSnapshot'>,
    private _postAnalyticsSnapshot: PrismaRepository<'postAnalyticsSnapshot'>,
    private _integration: PrismaRepository<'integration'>,
    private _post: PrismaRepository<'post'>,
    private _prisma: PrismaService,
  ) {}

  getSnapshots(
    orgId: string,
    integrationIds: string[],
    from: Date,
    to: Date,
  ) {
    return this._analyticsSnapshot.model.analyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
    });
  }

  getPostSnapshots(
    orgId: string,
    integrationIds: string[],
    from: Date,
    to: Date,
  ) {
    return this._postAnalyticsSnapshot.model.postAnalyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
    });
  }

  getIntegrations(orgId: string, integrationIds: string[]) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: orgId,
        id: { in: integrationIds },
        deletedAt: null,
        disabled: false,
      },
    });
  }

  checkCoverage(orgId: string, integrationIds: string[], from: Date, to: Date) {
    return this._analyticsSnapshot.model.analyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        date: { gte: from, lte: to },
      },
      select: { date: true },
      distinct: ['date'],
    });
  }

  findPosts(
    orgId: string,
    integrationIds: string[],
    from: Date,
    to: Date,
    skip?: number,
    take?: number,
  ) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        publishDate: { gte: from, lte: to },
        deletedAt: null,
      },
      include: { integration: true },
      orderBy: { publishDate: 'desc' },
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    });
  }

  countPosts(orgId: string, integrationIds: string[], from: Date, to: Date) {
    return this._post.model.post.count({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        publishDate: { gte: from, lte: to },
        deletedAt: null,
      },
    });
  }

  findPost(orgId: string, postId: string) {
    return this._post.model.post.findFirst({
      where: { id: postId, organizationId: orgId, deletedAt: null },
      include: { integration: true },
    });
  }

  getPostDetailSnapshots(orgId: string, postId: string, from: Date, to: Date) {
    return this._postAnalyticsSnapshot.model.postAnalyticsSnapshot.findMany({
      where: {
        postId,
        organizationId: orgId,
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
    });
  }

  getMetricDetailTopPosts(
    orgId: string,
    integrationIds: string[],
    metric: string,
    from: Date,
    to: Date,
  ) {
    return this._postAnalyticsSnapshot.model.postAnalyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        metric,
        date: { gte: from, lte: to },
      },
      include: {
        post: { select: { content: true, publishDate: true } },
      },
      orderBy: { value: 'desc' },
      take: 10,
    });
  }

  getDayAnalyticsSnapshots(
    orgId: string,
    integrationIds: string[],
    metric: string,
    dateStart: Date,
    dateEnd: Date,
  ) {
    return this._analyticsSnapshot.model.analyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        metric,
        date: { gte: dateStart, lte: dateEnd },
      },
    });
  }

  getDayPostSnapshots(
    orgId: string,
    integrationIds: string[],
    metric: string,
    dateStart: Date,
    dateEnd: Date,
  ) {
    return this._postAnalyticsSnapshot.model.postAnalyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        metric,
        date: { gte: dateStart, lte: dateEnd },
      },
      include: { post: { select: { content: true, publishDate: true } } },
    });
  }

  getChannelAnalyticsSnapshots(
    orgId: string,
    integrationId: string,
    metric: string,
    from: Date,
    to: Date,
  ) {
    return this._analyticsSnapshot.model.analyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId,
        metric,
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
    });
  }

  getChannelPostSnapshots(
    orgId: string,
    integrationId: string,
    metric: string,
    from: Date,
    to: Date,
  ) {
    return this._postAnalyticsSnapshot.model.postAnalyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId,
        metric,
        date: { gte: from, lte: to },
      },
      include: { post: { select: { content: true, publishDate: true } } },
      orderBy: { value: 'desc' },
      take: 10,
    });
  }

  getBestTimeIntegrations(orgId: string) {
    return this._integration.model.integration.findMany({
      where: { organizationId: orgId, deletedAt: null, disabled: false },
      select: {
        id: true,
        name: true,
        providerIdentifier: true,
        picture: true,
      },
    });
  }

  getBestTimePosts(
    orgId: string,
    integrationIds: string[],
    dateThreshold: Date,
  ) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        publishDate: { gte: dateThreshold },
        deletedAt: null,
      },
      select: {
        id: true,
        publishDate: true,
        integrationId: true,
        lastViews: true,
        lastLikes: true,
        lastComments: true,
      },
      orderBy: [{ publishDate: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  }

  async getCommentBacklogCount(orgId: string): Promise<number> {
    const count = await this._prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*)::int as count FROM "SocialComment" sc
       WHERE sc."organizationId" = $1
         AND sc."deletedAt" IS NULL
         AND sc."isOwn" = false
         AND sc."status" IS DISTINCT FROM 'handled'`,
      orgId
    );
    return Number(count[0]?.count || 0);
  }

  getBestTimeSnapshots(
    orgId: string,
    integrationIds: string[],
    dateThreshold: Date,
    metrics: string[],
  ) {
    return this._analyticsSnapshot.model.analyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        date: { gte: dateThreshold },
        metric: { in: metrics },
      },
      orderBy: { date: 'asc' },
    });
  }
}

import { PrismaRepository, PrismaTransaction } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrgShortLinkSettingsRepository {
  constructor(
    private _orgShortLinkConfig: PrismaRepository<'orgShortLinkConfig'>,
    private _shortLink: PrismaRepository<'shortLink'>,
    private _shortLinkSnapshot: PrismaRepository<'shortLinkSnapshot'>,
    private _transaction: PrismaTransaction,
  ) {}

  getByOrg(orgId: string) {
    return this._orgShortLinkConfig.model.orgShortLinkConfig.findMany({
      where: { organizationId: orgId },
    });
  }

  getByIdentifier(orgId: string, identifier: string) {
    return this._orgShortLinkConfig.model.orgShortLinkConfig.findUnique({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
    });
  }

  getActive(orgId: string) {
    return this._orgShortLinkConfig.model.orgShortLinkConfig.findFirst({
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
      customDomain?: string;
      extraConfig?: string;
    },
  ) {
    return this._orgShortLinkConfig.model.orgShortLinkConfig.upsert({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      create: { organizationId: orgId, identifier, ...data },
      update: data,
    });
  }

  delete(orgId: string, identifier: string) {
    return this._orgShortLinkConfig.model.orgShortLinkConfig.delete({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
    });
  }

  async setActive(orgId: string, identifier: string) {
    await this._orgShortLinkConfig.model.orgShortLinkConfig.updateMany({
      where: { organizationId: orgId, isActive: true },
      data: { isActive: false },
    });
    return this._orgShortLinkConfig.model.orgShortLinkConfig.update({
      where: { organizationId_identifier: { organizationId: orgId, identifier } },
      data: { isActive: true, enabled: true },
    });
  }

  recordLink(data: {
    organizationId: string;
    provider: string;
    shortUrl: string;
    originalUrl: string;
    providerLinkId?: string;
    postId?: string;
  }) {
    return this._shortLink.model.shortLink.create({ data });
  }

  findLinkByShortUrl(orgId: string, shortUrl: string) {
    return this._shortLink.model.shortLink.findUnique({
      where: { organizationId_shortUrl: { organizationId: orgId, shortUrl } },
    });
  }

  getLinksForOrg(orgId: string) {
    return this._shortLink.model.shortLink.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertSnapshotFull(shortLinkId: string, organizationId: string, date: Date, clicks: number) {
    const existing = await this._shortLinkSnapshot.model.shortLinkSnapshot.findUnique({
      where: { shortLinkId_date: { shortLinkId, date } },
    });
    if (existing) {
      return this._shortLinkSnapshot.model.shortLinkSnapshot.update({
        where: { id: existing.id },
        data: { clicks },
      });
    }
    return this._shortLinkSnapshot.model.shortLinkSnapshot.create({
      data: { shortLinkId, organizationId, date, clicks },
    });
  }

  // N6: write a whole sweep batch of daily snapshots in a single transaction,
  // so a link-heavy org incurs one round-trip per batch instead of one per link.
  async upsertSnapshotsBatch(
    rows: { shortLinkId: string; organizationId: string; date: Date; clicks: number }[],
  ) {
    if (rows.length === 0) return [];
    const ops = rows.map((r) =>
      this._shortLinkSnapshot.model.shortLinkSnapshot.upsert({
        where: { shortLinkId_date: { shortLinkId: r.shortLinkId, date: r.date } },
        create: {
          shortLinkId: r.shortLinkId,
          organizationId: r.organizationId,
          date: r.date,
          clicks: r.clicks,
        },
        update: { clicks: r.clicks },
      }),
    );
    return this._transaction.model.$transaction(ops);
  }

  getSnapshotsForLinks(orgId: string, shortLinkIds: string[], from?: Date, to?: Date) {
    return this._shortLinkSnapshot.model.shortLinkSnapshot.findMany({
      where: {
        organizationId: orgId,
        shortLinkId: { in: shortLinkIds },
        ...(from || to ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        } : {}),
      },
      orderBy: { date: 'asc' },
    });
  }

  async pruneSnapshots(orgId: string, before: Date) {
    const links = await this._shortLink.model.shortLink.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    if (links.length === 0) return { count: 0 };
    const result = await this._shortLinkSnapshot.model.shortLinkSnapshot.deleteMany({
      where: {
        shortLinkId: { in: links.map(l => l.id) },
        date: { lt: before },
      },
    });
    return result;
  }

  getAggregatedClicks(orgId: string, from: Date, to: Date) {
    return this._shortLinkSnapshot.model.shortLinkSnapshot.findMany({
      where: {
        organizationId: orgId,
        date: { gte: from, lte: to },
      },
      include: { shortLink: true },
      orderBy: { date: 'asc' },
    });
  }
}

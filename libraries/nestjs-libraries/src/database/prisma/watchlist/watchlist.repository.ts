import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WatchlistRepository {
  constructor(
    private _prisma: PrismaService,
  ) {}

  findByOrg(organizationId: string) {
    return this._prisma.watchedAccount.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { metrics: { take: 1, orderBy: { capturedAt: 'desc' } } },
    });
  }

  findEnabledByOrg(organizationId: string) {
    return this._prisma.watchedAccount.findMany({
      where: { organizationId, enabled: true, deletedAt: null },
    });
  }

  create(data: {
    organizationId: string;
    provider: string;
    handle: string;
    displayName?: string;
  }) {
    return this._prisma.watchedAccount.create({ data });
  }

  update(id: string, data: { displayName?: string; enabled?: boolean }) {
    return this._prisma.watchedAccount.update({ where: { id }, data });
  }

  softDelete(id: string) {
    return this._prisma.watchedAccount.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  recordMetric(data: {
    watchedAccountId: string;
    metric: string;
    value: number;
  }) {
    return this._prisma.watchedAccountMetric.create({ data });
  }

  setLastError(id: string, error: string | null) {
    return this._prisma.watchedAccount.update({
      where: { id },
      data: { lastError: error },
    });
  }

  disableWithError(id: string, error: string) {
    return this._prisma.watchedAccount.update({
      where: { id },
      data: { enabled: false, lastError: error },
    });
  }
}

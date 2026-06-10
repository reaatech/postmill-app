import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailLogRepository {
  constructor(private _db: PrismaRepository<'emailLog'>) {}

  create(data: {
    provider: string;
    toAddress: string;
    fromAddress: string;
    subject: string;
    replyTo?: string;
    providerMessageId?: string;
    status?: string;
    deliveredAt?: Date;
    organizationId?: string;
  }) {
    return this._db.model.emailLog.create({ data });
  }

  findById(id: string) {
    return this._db.model.emailLog.findUnique({ where: { id } });
  }

  findByMessageId(provider: string, providerMessageId: string) {
    return this._db.model.emailLog.findFirst({
      where: { provider, providerMessageId },
    });
  }

  updateById(id: string, data: {
    status?: string;
    providerMessageId?: string;
    error?: string;
    deliveredAt?: Date;
  }) {
    return this._db.model.emailLog.update({ where: { id }, data });
  }

  applyStatus(id: string, status: string, deliveredAt?: Date) {
    return this._db.model.emailLog.update({
      where: { id },
      data: { status, ...(deliveredAt ? { deliveredAt } : {}) },
    });
  }

  deleteOlderThan(date: Date) {
    return this._db.model.emailLog.deleteMany({
      where: { sentAt: { lt: date } },
    });
  }
}

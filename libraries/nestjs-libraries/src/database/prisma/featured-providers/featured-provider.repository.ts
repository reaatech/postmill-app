import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * Data-layer access for the platform-wide FeaturedProvider curation table.
 * Only this repository touches Prisma (layering rule). Keyed by
 * (domain, providerId); version-agnostic.
 */
@Injectable()
export class FeaturedProviderRepository {
  constructor(
    private _featuredProvider: PrismaRepository<'featuredProvider'>,
  ) {}

  list(domain?: string) {
    return this._featuredProvider.model.featuredProvider.findMany({
      where: domain ? { domain } : {},
      orderBy: [{ domain: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  upsert(domain: string, providerId: string, sortOrder: number) {
    return this._featuredProvider.model.featuredProvider.upsert({
      where: { domain_providerId: { domain, providerId } },
      create: { domain, providerId, sortOrder },
      update: { sortOrder },
    });
  }

  remove(domain: string, providerId: string) {
    return this._featuredProvider.model.featuredProvider.deleteMany({
      where: { domain, providerId },
    });
  }

  /** Bulk set sortOrder for a domain's featured providers (upsert each). */
  async reorder(
    domain: string,
    entries: Array<{ providerId: string; sortOrder: number }>,
  ) {
    for (const { providerId, sortOrder } of entries) {
      await this.upsert(domain, providerId, sortOrder);
    }
    return this.list(domain);
  }
}

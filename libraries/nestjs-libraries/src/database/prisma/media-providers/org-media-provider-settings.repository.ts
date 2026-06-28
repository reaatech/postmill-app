import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrgMediaProviderSettingsRepository {
  constructor(
    private _mediaProviderConfig: PrismaRepository<'mediaProviderConfig'>,
  ) {}

  getByOrg(orgId: string) {
    return this._mediaProviderConfig.model.mediaProviderConfig.findMany({
      where: { organizationId: orgId },
    });
  }

  getByIdentifier(orgId: string, identifier: string, version = 'v1') {
    return this._mediaProviderConfig.model.mediaProviderConfig.findUnique({
      where: { organizationId_identifier_version: { organizationId: orgId, identifier, version } },
    });
  }

  /** Identifiers enabled in at least one org — for the platform-admin overview. */
  async getEnabledIdentifiers(): Promise<string[]> {
    const rows = await this._mediaProviderConfig.model.mediaProviderConfig.findMany({
      where: { enabled: true },
      select: { identifier: true },
      distinct: ['identifier'],
    });
    return rows.map((r) => r.identifier);
  }

  upsert(
    orgId: string,
    identifier: string,
    data: {
      enabled?: boolean;
      credentials?: string;
      storageProviderId?: string;
      storageRootFolderId?: string;
      accountFingerprint?: string;
      extraConfig?: string;
      version?: string;
    },
    version = 'v1',
  ) {
    return this._mediaProviderConfig.model.mediaProviderConfig.upsert({
      where: { organizationId_identifier_version: { organizationId: orgId, identifier, version } },
      create: { organizationId: orgId, identifier, version, ...data },
      update: data,
    });
  }

  delete(orgId: string, identifier: string, version = 'v1') {
    return this._mediaProviderConfig.model.mediaProviderConfig.delete({
      where: { organizationId_identifier_version: { organizationId: orgId, identifier, version } },
    });
  }
}

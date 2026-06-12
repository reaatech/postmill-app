import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// Pre-drop User rows still carry the profile columns that moved to UserProfile;
// the current Prisma client no longer types them, so model the legacy shape here.
type LegacyUserRow = {
  id: string;
  name?: string | null;
  lastName?: string | null;
  bio?: string | null;
  pictureId?: string | null;
  sendSuccessEmails?: boolean;
  sendFailureEmails?: boolean;
  sendStreakEmails?: boolean;
};

function deriveFingerprint(data: (string | null | undefined)[]): string {
  const hash = createHash('sha1');
  for (const part of data) {
    if (part) hash.update(part);
  }
  return hash.digest('hex').substring(0, 16);
}

@Injectable()
export class BackfillService {
  constructor(private prisma: PrismaService) {}

  async backfill() {
    await this.prisma.$transaction(async (tx) => {
      await this.backfillUserProfiles(tx);
      await this.backfillUserOrganizationRoles(tx);
      await this.backfillAIBrandProfiles(tx);
      await this.backfillStorageProviderFingerprints(tx);
      await this.backfillShortLinkConfigs(tx);
      await this.migrateRagSettingsMediaProviders(tx);
    });
  }

  private async backfillUserProfiles(tx: Prisma.TransactionClient) {
    try {
      const users: LegacyUserRow[] = await tx.user.findMany({
        where: { profile: null },
      });

      for (const user of users) {
        await tx.userProfile.create({
          data: {
            userId: user.id,
            name: user.name,
            lastName: user.lastName,
            bio: user.bio,
            pictureId: user.pictureId,
            timezone: null,
            sendSuccessEmails: user.sendSuccessEmails,
            sendFailureEmails: user.sendFailureEmails,
            sendStreakEmails: user.sendStreakEmails,
          },
        });
      }
    } catch {
      // Profile fields on User may already be dropped after the destructive push —
      // this backfill is only needed pre-drop.
    }
  }

  private async backfillUserOrganizationRoles(tx: Prisma.TransactionClient) {
    const appRoles = await tx.appRole.findMany({
      where: { organizationId: null, isSystem: true },
    });
    const appRoleByKey = new Map<string, string>(appRoles.map((r: { key: string; id: string }) => [r.key, r.id]));

    const ownerRoleId = appRoleByKey.get('owner');
    const memberRoleId = appRoleByKey.get('member');
    if (!ownerRoleId || !memberRoleId) return;

    const orgIds = (
      await tx.userOrganization.groupBy({
        by: ['organizationId'],
        where: { roleId: null },
      })
    ).map((r: { organizationId: string }) => r.organizationId);

    for (const orgId of orgIds) {
      const memberships = await tx.userOrganization.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'asc' },
      });

      const earliestId = memberships[0]?.id;

      for (const m of memberships) {
        if (m.roleId) continue;

        const roleId = m.id === earliestId ? ownerRoleId : memberRoleId;
        await tx.userOrganization.update({
          where: { id: m.id },
          data: { roleId },
        });
      }
    }
  }

  private async backfillAIBrandProfiles(tx: Prisma.TransactionClient) {
    await tx.aIBrandProfile.updateMany({
      where: { name: null },
      data: { name: 'Default', isDefault: true },
    });
  }

  private async backfillStorageProviderFingerprints(tx: Prisma.TransactionClient) {
    const configs = await tx.storageProviderConfig.findMany({
      where: { accountFingerprint: null },
    });

    for (const config of configs) {
      const fp = deriveFingerprint([
        config.type,
        config.region,
        config.bucket,
        config.endpoint,
        config.credentials,
      ]);

      await tx.storageProviderConfig.update({
        where: { id: config.id },
        data: { accountFingerprint: fp },
      });
    }
  }

  private async backfillShortLinkConfigs(tx: Prisma.TransactionClient) {
    const configs = await tx.orgShortLinkConfig.findMany({
      where: { OR: [{ name: null }, { accountFingerprint: null }] },
    });

    for (const config of configs) {
      const updates: { name?: string; accountFingerprint?: string } = {};

      if (config.name === null) {
        updates.name = config.identifier;
      }

      if (config.accountFingerprint === null) {
        updates.accountFingerprint = deriveFingerprint([
          config.identifier,
          config.credentials,
        ]);
      }

      if (Object.keys(updates).length > 0) {
        await tx.orgShortLinkConfig.update({
          where: { id: config.id },
          data: updates,
        });
      }
    }
  }

  private async migrateRagSettingsMediaProviders(tx: Prisma.TransactionClient) {
    const aiSettings = await tx.aISystemSettings.findFirst();

    if (!aiSettings?.ragSettings) return;

    let ragData: Record<string, unknown>;
    let mediaProviders: Record<string, { enabled?: boolean; operations?: string[]; c2paAvailable?: boolean }>;
    try {
      ragData = JSON.parse(aiSettings.ragSettings);
      mediaProviders = ragData?.mediaProviders as typeof mediaProviders;
    } catch {
      return;
    }

    if (!mediaProviders || typeof mediaProviders !== 'object' || Object.keys(mediaProviders).length === 0) return;

    const orgs = await tx.aIOrgProviderConfig.findMany({
      select: { organizationId: true },
      distinct: ['organizationId'],
    });

    for (const org of orgs) {
      for (const [identifier, mp] of Object.entries(mediaProviders)) {
        if (!mp || typeof mp !== 'object') continue;

        const extraConfig = JSON.stringify({
          operations: mp.operations ?? [],
          c2paAvailable: mp.c2paAvailable ?? false,
        });

        await tx.mediaProviderConfig.upsert({
          where: {
            organizationId_identifier: {
              organizationId: org.organizationId,
              identifier,
            },
          },
          update: {
            enabled: mp.enabled ?? false,
            extraConfig,
          },
          create: {
            organizationId: org.organizationId,
            identifier,
            enabled: mp.enabled ?? false,
            extraConfig,
          },
        });
      }
    }

    // Step 7: the blob is fully migrated to MediaProviderConfig rows — strip
    // it from ragSettings so nothing can read stale media-provider state.
    const { mediaProviders: _migrated, ...remainingRag } = ragData;
    await tx.aISystemSettings.update({
      where: { id: aiSettings.id },
      data: { ragSettings: JSON.stringify(remainingRag) },
    });
  }
}

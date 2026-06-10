import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';

interface ProviderMapping {
  identifier: string;
  name: string;
  clientIdEnv: string;
  clientSecretEnv?: string;
  isTokenOnly?: boolean;
}

const PROVIDER_MAPPINGS: ProviderMapping[] = [
  { identifier: 'x', name: 'X', clientIdEnv: 'X_API_KEY', clientSecretEnv: 'X_API_SECRET' },
  { identifier: 'linkedin', name: 'LinkedIn', clientIdEnv: 'LINKEDIN_CLIENT_ID', clientSecretEnv: 'LINKEDIN_CLIENT_SECRET' },
  { identifier: 'linkedin-page', name: 'LinkedIn Page', clientIdEnv: 'LINKEDIN_CLIENT_ID', clientSecretEnv: 'LINKEDIN_CLIENT_SECRET' },
  { identifier: 'facebook', name: 'Facebook', clientIdEnv: 'FACEBOOK_APP_ID', clientSecretEnv: 'FACEBOOK_APP_SECRET' },
  { identifier: 'instagram', name: 'Instagram', clientIdEnv: 'FACEBOOK_APP_ID', clientSecretEnv: 'FACEBOOK_APP_SECRET' },
  { identifier: 'instagram-standalone', name: 'Instagram Standalone', clientIdEnv: 'INSTAGRAM_APP_ID', clientSecretEnv: 'INSTAGRAM_APP_SECRET' },
  { identifier: 'discord', name: 'Discord', clientIdEnv: 'DISCORD_CLIENT_ID', clientSecretEnv: 'DISCORD_CLIENT_SECRET' },
  { identifier: 'slack', name: 'Slack', clientIdEnv: 'SLACK_ID', clientSecretEnv: 'SLACK_SECRET' },
  { identifier: 'tiktok', name: 'TikTok', clientIdEnv: 'TIKTOK_CLIENT_ID', clientSecretEnv: 'TIKTOK_CLIENT_SECRET' },
  { identifier: 'youtube', name: 'YouTube', clientIdEnv: 'YOUTUBE_CLIENT_ID', clientSecretEnv: 'YOUTUBE_CLIENT_SECRET' },
  { identifier: 'pinterest', name: 'Pinterest', clientIdEnv: 'PINTEREST_CLIENT_ID', clientSecretEnv: 'PINTEREST_CLIENT_SECRET' },
  { identifier: 'reddit', name: 'Reddit', clientIdEnv: 'REDDIT_CLIENT_ID', clientSecretEnv: 'REDDIT_CLIENT_SECRET' },
  { identifier: 'twitch', name: 'Twitch', clientIdEnv: 'TWITCH_CLIENT_ID', clientSecretEnv: 'TWITCH_CLIENT_SECRET' },
  { identifier: 'threads', name: 'Threads', clientIdEnv: 'THREADS_APP_ID', clientSecretEnv: 'THREADS_APP_SECRET' },
  { identifier: 'dribbble', name: 'Dribbble', clientIdEnv: 'DRIBBBLE_CLIENT_ID', clientSecretEnv: 'DRIBBBLE_CLIENT_SECRET' },
  { identifier: 'mastodon', name: 'Mastodon', clientIdEnv: 'MASTODON_CLIENT_ID', clientSecretEnv: 'MASTODON_CLIENT_SECRET' },
  { identifier: 'mewe', name: 'MeWe', clientIdEnv: 'MEWE_APP_ID', clientSecretEnv: 'MEWE_API_KEY' },
  { identifier: 'kick', name: 'Kick', clientIdEnv: 'KICK_CLIENT_ID', clientSecretEnv: 'KICK_SECRET' },
  { identifier: 'gmb', name: 'Google My Business', clientIdEnv: 'GOOGLE_GMB_CLIENT_ID', clientSecretEnv: 'GOOGLE_GMB_CLIENT_SECRET' },
  { identifier: 'wrapcast', name: 'Farcaster', clientIdEnv: 'NEYNAR_CLIENT_ID', clientSecretEnv: 'NEYNAR_SECRET_KEY' },
  { identifier: 'vk', name: 'VK', clientIdEnv: 'VK_ID' },
  { identifier: 'whop', name: 'Whop', clientIdEnv: 'WHOP_CLIENT_ID' },
  { identifier: 'telegram', name: 'Telegram', clientIdEnv: 'TELEGRAM_TOKEN', isTokenOnly: true },
  { identifier: 'oauth_custom', name: 'Custom OAuth', clientIdEnv: 'POSTMILL_OAUTH_CLIENT_ID', clientSecretEnv: 'POSTMILL_OAUTH_CLIENT_SECRET' },
];

@Injectable()
export class ChannelEnvMigrationService implements OnModuleInit {
  private readonly _logger = new Logger(ChannelEnvMigrationService.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _encryption: EncryptionService,
  ) {}

  async onModuleInit() {
    let seeded = 0;

    for (const mapping of PROVIDER_MAPPINGS) {
      const clientId = process.env[mapping.clientIdEnv];
      if (!clientId) continue;

      const orgs = await this._prisma.organization.findMany({
        select: { id: true },
      });

      if (orgs.length === 0) continue;

      const encryptedClientId = this._encryption.encrypt(clientId);
      const rawSecret = mapping.clientSecretEnv ? process.env[mapping.clientSecretEnv] : undefined;
      const encryptedClientSecret = rawSecret ? this._encryption.encrypt(rawSecret) : undefined;

      let orgCount = 0;

      for (const org of orgs) {
        const existingCount = await this._prisma.orgProviderConfiguration.count({
          where: { organizationId: org.id, identifier: mapping.identifier },
        });

        if (existingCount > 0) continue;

        await this._prisma.orgProviderConfiguration.upsert({
          where: {
            organizationId_identifier: { organizationId: org.id, identifier: mapping.identifier },
          },
          create: {
            organizationId: org.id,
            identifier: mapping.identifier,
            name: mapping.name,
            enabled: true,
            ...(mapping.isTokenOnly
              ? { additionalConfig: this._encryption.encrypt(JSON.stringify({ botToken: clientId })) }
              : { clientId: encryptedClientId, clientSecret: encryptedClientSecret || null }),
          },
          update: { enabled: true, name: mapping.name },
        });
        orgCount++;
      }

      if (orgCount > 0) {
        this._logger.log(`Seeded ${mapping.name} channel config from ${mapping.clientIdEnv} env var for ${orgCount} org(s)`);
        seeded++;
      }
    }

    if (seeded > 0) {
      this._logger.log(`Channel env migration complete: ${seeded} provider(s) seeded`);
    }
  }
}

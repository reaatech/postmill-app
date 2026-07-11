import { Ability, AbilityBuilder, AbilityClass } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import {
  pricing,
  SELF_HOST_PLAN,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import dayjs from 'dayjs';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { BrandsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.repository';
import { WatchlistRepository } from '@gitroom/nestjs-libraries/database/prisma/watchlist/watchlist.repository';
import { FileRepository } from '@gitroom/nestjs-libraries/database/prisma/file/file.repository';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { StorageProviderType } from '@prisma/client';
import { AuthorizationActions, Sections } from './permission.exception.class';

export type AppAbility = Ability<[AuthorizationActions, Sections]>;

const BYTES_PER_GB = 1024 * 1024 * 1024;

function getBillingMonthStart(createdAt: Date): dayjs.Dayjs {
  const start = dayjs(createdAt);
  const now = dayjs();
  let current = start;
  while (current.isBefore(now, 'month') || current.isBefore(now, 'day')) {
    const next = current.add(1, 'month');
    if (next.isAfter(now)) {
      break;
    }
    current = next;
  }
  return current;
}

@Injectable()
export class PermissionsService {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _postsService: PostsService,
    private _integrationService: IntegrationService,
    private _webhooksService: WebhooksService,
    private _organizationService: OrganizationService,
    private _brandsRepository: BrandsRepository,
    private _watchlistRepository: WatchlistRepository,
    private _fileRepository: FileRepository,
    private _storageService: StorageService
  ) {}

  async getPackageOptions(orgId: string) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(orgId);

    const tier =
      subscription?.subscriptionTier ||
      (!process.env.STRIPE_PUBLISHABLE_KEY ? SELF_HOST_PLAN : 'STARTER');

    const { channel, ...all } = pricing[tier] ?? pricing['STARTER'];
    return {
      subscription,
      options: {
        ...all,
        channel: subscription ? -10 : channel,
      },
    };
  }

  async getEffectiveLimits(orgId: string) {
    const { subscription, options } = await this.getPackageOptions(orgId);
    const extraStorageGb = subscription?.extraStorageGb ?? 0;
    const extraVideoExports = subscription?.extraVideoExports ?? 0;
    const mounted = await this._storageService.getMountedConfigs(orgId);
    const byoStorageActive = mounted.some(
      (c) => c.type !== StorageProviderType.LOCAL
    );

    return {
      subscription,
      options: {
        ...options,
        storage_gb: options.storage_gb + extraStorageGb,
        video_exports: options.video_exports + extraVideoExports,
      },
      byoStorageActive,
    };
  }

  async check(
    orgId: string,
    created_at: Date,
    permission: 'USER' | 'ADMIN' | 'SUPERADMIN',
    requestedPermission: Array<[AuthorizationActions, Sections]>,
    refreshChannelId?: string
  ) {
    const { can, build } = new AbilityBuilder<
      Ability<[AuthorizationActions, Sections]>
    >(Ability as AbilityClass<AppAbility>);

    if (
      requestedPermission.length === 0 ||
      !process.env.STRIPE_PUBLISHABLE_KEY
    ) {
      for (const [action, section] of requestedPermission) {
        can(action, section);
      }
      return build({
        detectSubjectType: (item) =>
          // @ts-ignore
          item.constructor,
      });
    }

    const { subscription, options, byoStorageActive } =
      await this.getEffectiveLimits(orgId);

    const teamPromise = this._organizationService.getTeam(orgId);

    for (const [action, section] of requestedPermission) {
      // check for the amount of channels
      if (section === Sections.CHANNEL) {
        // Refreshing an existing channel doesn't add a new one, so skip the limit check
        // but only if the channel actually belongs to this org
        if (refreshChannelId) {
          const existingIntegration =
            await this._integrationService.getIntegrationById(
              orgId,
              refreshChannelId
            );
          if (existingIntegration) {
            can(action, section);
            continue;
          }
        }

        const totalChannels = (
          await this._integrationService.getIntegrationsList(orgId)
        ).filter((f) => !f.refreshNeeded).length;

        if (
          (options.channel && options.channel > totalChannels) ||
          (subscription?.totalChannels || 0) > totalChannels
        ) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.WEBHOOKS) {
        const totalWebhooks = await this._webhooksService.getTotal(orgId);
        if (totalWebhooks < options.webhooks) {
          can(AuthorizationActions.Create, section);
          continue;
        }
      }

      // check for posts per month
      if (section === Sections.POSTS_PER_MONTH) {
        const createdAt =
          subscription?.createdAt || created_at;
        const totalMonthPast = Math.abs(
          dayjs(createdAt).diff(dayjs(), 'month')
        );
        const checkFrom = dayjs(createdAt).add(totalMonthPast, 'month');
        const count = await this._postsService.countPostsFromDay(
          orgId,
          checkFrom.toDate()
        );

        if (count < options.posts_per_month) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.TEAM_MEMBERS) {
        const team = await teamPromise;
        // Count only ENABLED seats — a disabled member (e.g. one pruned on downgrade) must
        // not consume the cap, or an entitled active invite would be wrongly blocked.
        const totalMembers =
          team?.users?.filter((u: { disabled?: boolean }) => !u.disabled).length ?? 0;
        if (totalMembers < options.team_members) {
          can(action, section);
          continue;
        }
      }

      // Media management is not a billed dimension — any authenticated org
      // member may manage their org's media. The guard still enforces auth +
      // org resolution; this branch just keeps MEDIA from being paywalled.
      if (section === Sections.MEDIA) {
        can(action, section);
        continue;
      }

      if (section === Sections.BRANDS) {
        const totalBrands = await this._brandsRepository.countBrands(orgId);
        if (totalBrands < options.brand_kits) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.CAMPAIGNS && options.campaigns) {
        can(action, section);
        continue;
      }

      if (section === Sections.API && options.api) {
        can(action, section);
        continue;
      }

      if (section === Sections.MCP && options.mcp) {
        can(action, section);
        continue;
      }

      if (section === Sections.COMPETITORS) {
        const totalCompetitors =
          await this._watchlistRepository.countByOrg(orgId);
        if (totalCompetitors < options.competitors) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.VIDEO_EXPORTS) {
        const createdAt = subscription?.createdAt || created_at;
        const checkFrom = getBillingMonthStart(createdAt);
        const used = await this._subscriptionService.getCreditsFrom(
          orgId,
          checkFrom,
          'video_export'
        );
        if (used < options.video_exports) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.STORAGE) {
        if (byoStorageActive) {
          can(action, section);
          continue;
        }
        const usedBytes = await this._fileRepository.getStorageBytes(orgId);
        const capBytes = (options.storage_gb as number) * BYTES_PER_GB;
        if (usedBytes < capBytes) {
          can(action, section);
          continue;
        }
      }
    }

    return build({
      detectSubjectType: (item) =>
        // @ts-ignore
        item.constructor,
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { WatchlistService } from '@gitroom/nestjs-libraries/database/prisma/watchlist/watchlist.service';
import { PROVIDER_CAPABILITIES } from '@gitroom/nestjs-libraries/integrations/social/provider-capabilities';
import {
  normalizeMetric,
  METRIC_REGISTRY,
} from '@gitroom/nestjs-libraries/integrations/social/analytics.metrics';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { timer } from '@gitroom/helpers/utils/timer';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { decryptIntegrationTokens, decryptPostIntegrationTokens } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration-token.utils';
import { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import { OrgShortLinkSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.repository';
import { ShortLinkRegistry } from '@gitroom/nestjs-libraries/short-linking/short-link.registry';
import { EmailLogService } from '@gitroom/nestjs-libraries/database/prisma/emails/email-log.service';

dayjs.extend(isoWeek);

const CHANNEL_DAYS_BACK = 7;

// Retention defaults: keep raw daily channel snapshots for ~18 months, then
// roll them up to one weekly row per (integration, metric). Per-post daily
// snapshots are pruned (not archived) beyond the post-tracking window.
// Both are overridable via env (read per-run so config changes don't require
// a restart): ANALYTICS_DAILY_RETENTION_DAYS / ANALYTICS_POST_RETENTION_DAYS.
const DEFAULT_DAILY_RETENTION_DAYS = 548; // ~18 months
const DEFAULT_POST_RETENTION_DAYS = 90;

function retentionDays(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    Logger.warn(
      `AnalyticsActivity: invalid ${envKey}="${raw}", falling back to ${fallback}`
    );
    return fallback;
  }
  return Math.floor(parsed);
}

@Injectable()
export class AnalyticsActivity {
  private readonly logger = new Logger(AnalyticsActivity.name);

  constructor(
    private readonly _prisma: PrismaService,
    private readonly _integrationManager: IntegrationManager,
    private readonly _orgProviderConfigManager: OrgProviderConfigManager,
    private readonly _organizationService: OrganizationService,
    private readonly _integrationService: IntegrationService,
    private readonly _refreshIntegrationService: RefreshIntegrationService,
    private readonly _webhooksService: WebhooksService,
    private readonly _watchlistService: WatchlistService,
    private readonly _shortLinkSettingsService: OrgShortLinkSettingsService,
    private readonly _shortLinkSettingsRepository: OrgShortLinkSettingsRepository,
    private readonly _shortLinkRegistry: ShortLinkRegistry,
    private readonly _emailLogService: EmailLogService,
  ) {}

  async getAllOrganizationIds(): Promise<string[]> {
    const orgs = await this._organizationService.getAllIds();
    return orgs.map((o) => o.id);
  }

  async collectChannelSnapshots(
    orgId: string,
    daysBack: number = CHANNEL_DAYS_BACK
  ): Promise<void> {
    await this._orgProviderConfigManager.ensureFresh(orgId);

    const integrations = await this._integrationService.getIntegrationsList(
      orgId
    );
    const socialIntegrations = integrations.filter(
      (i) => i.type === 'social' && !i.disabled && !i.deletedAt
    );

    for (const integration of socialIntegrations) {
      const provider = this._integrationManager.getSocialIntegrationUnchecked(
        integration.providerIdentifier
      );
      if (!provider?.analytics) continue;

      let token = integration.token;
      if (
        integration.tokenExpiration &&
        dayjs(integration.tokenExpiration).isBefore(dayjs())
      ) {
        const refreshed = await this._refreshIntegrationService.refresh(
          integration
        );
        if (!refreshed || !refreshed.accessToken) continue;
        token = refreshed.accessToken;
        if (provider.refreshWait) {
          await timer(10000);
        }
      }

      try {
        const clientInformation = await this._integrationManager.requireClientInformation(
          integration.providerIdentifier,
          integration.organizationId
        ).catch(() => undefined);

        const data = await provider.analytics(
          integration.internalId,
          token,
          daysBack,
          clientInformation
        );

        for (const entry of data) {
          const canonical = normalizeMetric(
            integration.providerIdentifier,
            entry.label
          );
          if (!canonical) continue;

          for (const point of entry.data) {
            const val = parseFloat(String(point.total));
            if (isNaN(val)) continue;

            await this._prisma.analyticsSnapshot.upsert({
              where: {
                integrationId_metric_date: {
                  integrationId: integration.id,
                  metric: canonical,
                  date: dayjs(point.date).startOf('day').toDate(),
                },
              },
              create: {
                organizationId: orgId,
                integrationId: integration.id,
                metric: canonical,
                value: val,
                date: dayjs(point.date).startOf('day').toDate(),
              },
              update: {
                value: val,
              },
            });
          }
        }
      } catch (err: any) {
        if (err instanceof RefreshToken) {
          continue;
        }
        this.logger.error(
          `AnalyticsActivity: Error collecting analytics for ${integration.id}:`,
          { integrationId: integration.id, providerId: integration.providerIdentifier, error: err?.message }
        );
      }
    }
  }

  async collectPostSnapshots(orgId: string, daysBack: number): Promise<void> {
    await this._orgProviderConfigManager.ensureFresh(orgId);
    const since = dayjs().subtract(daysBack, 'day').startOf('day').toDate();

    const posts = (await this._prisma.post.findMany({
      where: {
        organizationId: orgId,
        releaseId: { not: null },
        publishDate: { gte: since },
      },
      include: {
        integration: true,
      },
    })).map(decryptPostIntegrationTokens);

    for (const post of posts) {
      if (!post.releaseId || post.releaseId === 'missing') continue;

      try {
        const provider = this._integrationManager.getSocialIntegrationUnchecked(
          post.integration.providerIdentifier
        );
        if (!provider?.postAnalytics) continue;

        let token = post.integration.token;
        if (
          post.integration.tokenExpiration &&
          dayjs(post.integration.tokenExpiration).isBefore(dayjs())
        ) {
          const refreshed = await this._refreshIntegrationService.refresh(
            post.integration
          );
          if (!refreshed || !refreshed.accessToken) continue;
          token = refreshed.accessToken;
          if (provider.refreshWait) {
            await timer(10000);
          }
        }

        const clientInformation = await this._integrationManager.requireClientInformation(
          post.integration.providerIdentifier,
          post.integration.organizationId
        ).catch(() => undefined);

        const data = await provider.postAnalytics(
          post.integration.internalId,
          token,
          post.releaseId,
          2,
          clientInformation
        );

        for (const entry of data) {
          const canonical = normalizeMetric(
            post.integration.providerIdentifier,
            entry.label
          );
          if (!canonical) continue;

          for (const point of entry.data) {
            const val = parseFloat(String(point.total));
            if (isNaN(val)) continue;

            await this._prisma.postAnalyticsSnapshot.upsert({
              where: {
                postId_metric_date: {
                  postId: post.id,
                  metric: canonical,
                  date: dayjs(point.date).startOf('day').toDate(),
                },
              },
              create: {
                organizationId: orgId,
                postId: post.id,
                integrationId: post.integrationId,
                metric: canonical,
                value: val,
                date: dayjs(point.date).startOf('day').toDate(),
              },
              update: {
                value: val,
              },
            });
          }
        }

        // Update denormalized counters on the Post record
        const latestSnapshots = await this._prisma.postAnalyticsSnapshot.findMany({
          where: { postId: post.id, metric: { in: ['views', 'likes', 'comments', 'impressions', 'reactions', 'replies'] } },
          orderBy: { date: 'desc' },
          select: { metric: true, value: true },
        });

        const latestByMetric: Record<string, number> = {};
        for (const snap of latestSnapshots) {
          if (!(snap.metric in latestByMetric)) {
            latestByMetric[snap.metric] = snap.value;
          }
        }

        const updateData: Record<string, number> = {};
        const views = latestByMetric['views'] || latestByMetric['impressions'];
        const likes = latestByMetric['likes'] || latestByMetric['reactions'];
        const comments = latestByMetric['comments'] || latestByMetric['replies'];
        if (views !== undefined) updateData.lastViews = views;
        if (likes !== undefined) updateData.lastLikes = likes;
        if (comments !== undefined) updateData.lastComments = comments;

        if (Object.keys(updateData).length > 0) {
          await this._prisma.post.update({
            where: { id: post.id },
            data: updateData,
          });
        }
      } catch (err: any) {
        if (err instanceof RefreshToken) {
          continue;
        }
        this.logger.error(
          `AnalyticsActivity: Error collecting post analytics for ${post.id}:`,
          { postId: post.id, integrationId: post.integrationId, providerId: post.integration?.providerIdentifier, error: err?.message }
        );
      }
    }
  }

  async pruneAndRollupSnapshots(orgId: string): Promise<void> {
    const dailyCutoff = dayjs()
      .subtract(
        retentionDays(
          'ANALYTICS_DAILY_RETENTION_DAYS',
          DEFAULT_DAILY_RETENTION_DAYS
        ),
        'day'
      )
      .startOf('day')
      .toDate();
    const postCutoff = dayjs()
      .subtract(
        retentionDays(
          'ANALYTICS_POST_RETENTION_DAYS',
          DEFAULT_POST_RETENTION_DAYS
        ),
        'day'
      )
      .startOf('day')
      .toDate();

    // 1. Prune post snapshots beyond the tracking window — per-post daily
    //    detail is not worth archiving.
    await this._prisma.postAnalyticsSnapshot.deleteMany({
      where: { organizationId: orgId, date: { lt: postCutoff } },
    });

    // 2. Roll up channel snapshots older than the daily-retention window into
    //    a single weekly row per (integration, metric, ISO week): flow metrics
    //    are summed, stock metrics keep the latest value in the week.
    const oldRows = await this._prisma.analyticsSnapshot.findMany({
      where: { organizationId: orgId, date: { lt: dailyCutoff } },
      orderBy: { date: 'asc' },
    });
    if (!oldRows.length) {
      return;
    }

    const groups = new Map<
      string,
      {
        integrationId: string;
        metric: string;
        weekStart: Date;
        sum: number;
        latestDate: Date;
        latestValue: number;
      }
    >();

    for (const row of oldRows) {
      const weekStart = dayjs(row.date).startOf('isoWeek').startOf('day').toDate();
      const key = `${row.integrationId}|${row.metric}|${weekStart.getTime()}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          integrationId: row.integrationId,
          metric: row.metric,
          weekStart,
          sum: row.value,
          latestDate: row.date,
          latestValue: row.value,
        });
        continue;
      }
      existing.sum += row.value;
      if (dayjs(row.date).isAfter(dayjs(existing.latestDate))) {
        existing.latestDate = row.date;
        existing.latestValue = row.value;
      }
    }

    const weeklyRows = Array.from(groups.values()).map((g) => {
      const def = METRIC_REGISTRY[g.metric];
      const value = def?.kind === 'stock' ? g.latestValue : g.sum;
      return {
        organizationId: orgId,
        integrationId: g.integrationId,
        metric: g.metric,
        value,
        date: g.weekStart,
      };
    });

    // Replace the rolled-up daily rows with their weekly aggregates atomically.
    // Re-running is idempotent: a weekly row dated on its own week-start
    // collapses to itself, and newly-aged days fold into the existing weekly row.
    await this._prisma.$transaction([
      this._prisma.analyticsSnapshot.deleteMany({
        where: { organizationId: orgId, date: { lt: dailyCutoff } },
      }),
      this._prisma.analyticsSnapshot.createMany({
        data: weeklyRows,
        skipDuplicates: true,
      }),
    ]);
  }

  async notifySnapshotComplete(orgId: string): Promise<void> {
    try {
      await this._webhooksService.dispatchEvent(orgId, 'analytics.snapshot_complete', {
        orgId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error('notifySnapshotComplete error:', { error: (err as Error)?.message });
    }
  }

  async backfillIntegration(integrationId: string): Promise<void> {
    const integration = decryptIntegrationTokens(await this._prisma.integration.findUnique({
      where: { id: integrationId },
    }));
    if (!integration || integration.type !== 'social') return;

    await this._orgProviderConfigManager.ensureFresh(integration.organizationId);

    const provider = this._integrationManager.getSocialIntegrationUnchecked(
      integration.providerIdentifier
    );
    if (!provider?.analytics) return;

    let token = integration.token;
    if (
      integration.tokenExpiration &&
      dayjs(integration.tokenExpiration).isBefore(dayjs())
    ) {
      const refreshed = await this._refreshIntegrationService.refresh(
        integration
      );
      if (!refreshed || !refreshed.accessToken) return;
      token = refreshed.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }

    try {
      const clientInformation = await this._integrationManager.requireClientInformation(
        integration.providerIdentifier,
        integration.organizationId
      ).catch(() => undefined);

      const data = await provider.analytics(integration.internalId, token, 90, clientInformation);

      for (const entry of data) {
        const canonical = normalizeMetric(
          integration.providerIdentifier,
          entry.label
        );
        if (!canonical) continue;

        for (const point of entry.data) {
          const val = parseFloat(String(point.total));
          if (isNaN(val)) continue;

          await this._prisma.analyticsSnapshot.upsert({
            where: {
              integrationId_metric_date: {
                integrationId: integration.id,
                metric: canonical,
                date: dayjs(point.date).startOf('day').toDate(),
              },
            },
            create: {
              organizationId: integration.organizationId,
              integrationId: integration.id,
              metric: canonical,
              value: val,
              date: dayjs(point.date).startOf('day').toDate(),
            },
            update: {
              value: val,
            },
          });
        }
      }
    } catch (err: any) {
      if (err instanceof RefreshToken) return;
      this.logger.error(`AnalyticsActivity: Error backfilling ${integration.id}:`, {
        integrationId: integration.id, providerId: integration.providerIdentifier, error: err?.message,
      });
    }
  }

  async probeWatchedAccounts(orgId: string): Promise<void> {
    try {
      const accounts = await this._watchlistService.getEnabledAccounts(orgId);
      for (const account of accounts) {
        try {
          const capabilities =
            PROVIDER_CAPABILITIES[
              account.provider as keyof typeof PROVIDER_CAPABILITIES
            ];
          if (!capabilities?.watchlist) {
            await this._watchlistService.markProbeFailed(
              account.id,
              orgId,
              `Watchlist probes are not supported for ${account.provider}`
            );
            continue;
          }

          await this._watchlistService.probeAndRecord({
            watchedAccountId: account.id,
            organizationId: orgId,
            provider: account.provider,
            handle: account.handle,
            metric: 'followers',
          });
        } catch (err: any) {
          this.logger.error(
            `AnalyticsActivity: watchlist probe failed for ${account.provider}:${account.handle}`,
            { error: err?.message }
          );
          await this._watchlistService.markProbeFailed(
            account.id,
            orgId,
            err?.message || 'Probe failed'
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `AnalyticsActivity: probeWatchedAccounts failed for org ${orgId}`,
        { error: err?.message }
      );
    }
  }

  async collectShortLinkSnapshots(orgId: string): Promise<void> {
    const active = await this._shortLinkSettingsService.getActiveProvider(orgId);
    if (!active) return;

    const adapter = this._shortLinkRegistry.getAdapter(active.identifier);
    if (!adapter) return;
    if (!adapter.capabilities.statistics) return;
    if (!adapter.linkStatistics) return;

    const links = await this._shortLinkSettingsRepository.getLinksForOrg(orgId);
    if (links.length === 0) return;

    const batchSize = 20;
    const today = dayjs().startOf('day').toDate();

    try {
      for (let i = 0; i < links.length; i += batchSize) {
        const batch = links.slice(i, i + batchSize);
        const shortUrls = batch.map((l) => l.shortUrl);

        try {
          const stats = await adapter.linkStatistics(
            {
              orgId,
              credentials: active.credentials || {},
              customDomain: active.customDomain || undefined,
            },
            shortUrls,
          );

          const rows: {
            shortLinkId: string;
            organizationId: string;
            date: Date;
            clicks: number;
          }[] = [];
          for (const stat of stats) {
            const link = batch.find((l) => l.shortUrl === stat.short);
            if (!link) continue;
            rows.push({
              shortLinkId: link.id,
              organizationId: orgId,
              date: today,
              clicks: parseInt(stat.clicks, 10) || 0,
            });
          }

          // N6: one transaction per batch instead of one upsert per link.
          await this._shortLinkSettingsRepository.upsertSnapshotsBatch(rows);
        } catch (err) {
          this.logger.warn(
            `AnalyticsActivity: short-link snapshot batch failed for org ${orgId}, provider ${active.identifier}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `AnalyticsActivity: short-link snapshot collection failed for org ${orgId}: ${(err as Error).message}`,
      );
    }
  }

  async pruneShortLinkSnapshots(orgId: string): Promise<void> {
    const retentionDays = (() => {
      const raw = process.env.ANALYTICS_POST_RETENTION_DAYS;
      if (raw === undefined || raw === '') return 90;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return 90;
      return Math.floor(parsed);
    })();

    const before = dayjs().subtract(retentionDays, 'day').startOf('day').toDate();
    await this._shortLinkSettingsRepository.pruneSnapshots(orgId, before);
  }

  async pruneEmailLogs(): Promise<void> {
    const days = (() => {
      const raw = process.env.EMAIL_LOG_RETENTION_DAYS;
      if (raw === undefined || raw === '') return 90;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return 90;
      return Math.floor(parsed);
    })();
    await this._emailLogService.prune(days);
  }
}

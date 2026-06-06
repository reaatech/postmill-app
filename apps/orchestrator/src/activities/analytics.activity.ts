import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { ProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/provider-config.manager';
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
import { log } from '@temporalio/activity';
import { decryptIntegrationTokens, decryptPostIntegrationTokens } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration-token.utils';

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
    log.warn(
      `AnalyticsActivity: invalid ${envKey}="${raw}", falling back to ${fallback}`
    );
    return fallback;
  }
  return Math.floor(parsed);
}

@Injectable()
@Activity()
export class AnalyticsActivity {
  constructor(
    private readonly _prisma: PrismaService,
    private readonly _integrationManager: IntegrationManager,
    private readonly _providerConfigManager: ProviderConfigManager,
    private readonly _organizationService: OrganizationService,
    private readonly _integrationService: IntegrationService,
    private readonly _refreshIntegrationService: RefreshIntegrationService,
    private readonly _webhooksService: WebhooksService,
    private readonly _watchlistService: WatchlistService,
  ) {}

  @ActivityMethod()
  async getAllOrganizationIds(): Promise<string[]> {
    const orgs = await this._organizationService.getAllIds();
    return orgs.map((o) => o.id);
  }

  @ActivityMethod()
  async collectChannelSnapshots(
    orgId: string,
    daysBack: number = CHANNEL_DAYS_BACK
  ): Promise<void> {
    await this._providerConfigManager.ensureFresh();

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
        const data = await provider.analytics(
          integration.internalId,
          token,
          daysBack
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
        log.error(
          `AnalyticsActivity: Error collecting analytics for ${integration.id}:`,
          { error: err?.message }
        );
      }
    }
  }

  @ActivityMethod()
  async collectPostSnapshots(orgId: string, daysBack: number): Promise<void> {
    await this._providerConfigManager.ensureFresh();
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

        const data = await provider.postAnalytics(
          post.integration.internalId,
          token,
          post.releaseId,
          2
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
          where: { postId: post.id, metric: { in: ['views', 'likes', 'comments'] } },
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
        if ('views' in latestByMetric) updateData.lastViews = latestByMetric.views;
        if ('likes' in latestByMetric) updateData.lastLikes = latestByMetric.likes;
        if ('comments' in latestByMetric) updateData.lastComments = latestByMetric.comments;

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
        log.error(
          `AnalyticsActivity: Error collecting post analytics for ${post.id}:`,
          { error: err?.message }
        );
      }
    }
  }

  @ActivityMethod()
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

  @ActivityMethod()
  async notifySnapshotComplete(orgId: string): Promise<void> {
    try {
      await this._webhooksService.dispatchEvent(orgId, 'analytics.snapshot_complete', {
        orgId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error('notifySnapshotComplete error:', { error: (err as Error)?.message });
    }
  }

  @ActivityMethod()
  async backfillIntegration(integrationId: string): Promise<void> {
    await this._providerConfigManager.ensureFresh();

    const integration = decryptIntegrationTokens(await this._prisma.integration.findUnique({
      where: { id: integrationId },
    }));
    if (!integration || integration.type !== 'social') return;

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
      const data = await provider.analytics(integration.internalId, token, 90);

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
      log.error(`AnalyticsActivity: Error backfilling ${integration.id}:`, {
        error: err?.message,
      });
    }
  }

  @ActivityMethod()
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
              `Watchlist probes are not supported for ${account.provider}`
            );
            continue;
          }

          await this._watchlistService.probeAndRecord({
            watchedAccountId: account.id,
            provider: account.provider,
            handle: account.handle,
            metric: 'followers',
          });
        } catch (err: any) {
          log.error(
            `AnalyticsActivity: watchlist probe failed for ${account.provider}:${account.handle}`,
            { error: err?.message }
          );
          await this._watchlistService.markProbeFailed(
            account.id,
            err?.message || 'Probe failed'
          );
        }
      }
    } catch (err: any) {
      log.error(
        `AnalyticsActivity: probeWatchedAccounts failed for org ${orgId}`,
        { error: err?.message }
      );
    }
  }
}

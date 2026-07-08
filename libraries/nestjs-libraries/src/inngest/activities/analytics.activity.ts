import { Injectable, Logger } from '@nestjs/common';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { AnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics.repository';
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
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { EmailLogService } from '@gitroom/nestjs-libraries/database/prisma/emails/email-log.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import {
  detectAnomaly,
  DEFAULT_ANOMALY_FLOORS,
  MetricKind,
} from '@gitroom/nestjs-libraries/analytics/anomaly.detection';
import { getRetentionDays } from '@gitroom/nestjs-libraries/analytics/analytics-aggregation';

dayjs.extend(isoWeek);

const CHANNEL_DAYS_BACK = 7;
const POST_SNAPSHOT_BATCH_SIZE = 500;

// 6.9: structured "your week in numbers" summary returned by buildWeeklySummary.
export interface WeeklyAnalyticsSummary {
  orgId: string;
  weekStart: Date;
  weekEnd: Date;
  metrics: {
    metric: string;
    label: string;
    thisWeek: number;
    lastWeek: number;
    changePct: number | null;
  }[];
  topPost: { postId: string; title: string; metric: string; value: number } | null;
  bestChannel: { integrationId: string; name: string; total: number } | null;
  anomalyRecap: string | null;
  hasData: boolean;
}

// Retention defaults: keep raw daily channel snapshots for ~18 months, then
// roll them up to one weekly row per (integration, metric). Per-post daily
// snapshots are pruned (not archived) beyond the post-tracking window.
// Both are overridable via env (read per-run so config changes don't require
// a restart): ANALYTICS_DAILY_RETENTION_DAYS / ANALYTICS_POST_RETENTION_DAYS.
const DEFAULT_DAILY_RETENTION_DAYS = 548; // ~18 months
const DEFAULT_POST_RETENTION_DAYS = 90;
// R1.8: the post rollup only re-reads/deletes/re-creates rows within this
// window below the post-retention cutoff each sweep (instead of the org's entire
// pre-cutoff history). Chronological aging guarantees every week receiving newly
// aged dailies has its weekly row (dated startOf('isoWeek')) inside the window,
// so bounded delete+recreate stays correct and — with R1.7 latest-wins —
// idempotent. Rows that miss the window after a >30-day sweep outage stay daily.
const POST_ROLLUP_LOOKBACK_DAYS = 30;

// Float env reader (for ANALYTICS_ANOMALY_Z) — invalid/≤0 falls back.
function envFloat(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    Logger.warn(
      `AnalyticsActivity: invalid ${envKey}="${raw}", falling back to ${fallback}`
    );
    return fallback;
  }
  return parsed;
}

@Injectable()
export class AnalyticsActivity {
  private readonly logger = new Logger(AnalyticsActivity.name);

  constructor(
    private readonly _analyticsRepository: AnalyticsRepository,
    private readonly _integrationManager: IntegrationManager,
    private readonly _orgProviderConfigManager: OrgProviderConfigManager,
    private readonly _organizationService: OrganizationService,
    private readonly _integrationService: IntegrationService,
    private readonly _refreshIntegrationService: RefreshIntegrationService,
    private readonly _webhooksService: WebhooksService,
    private readonly _watchlistService: WatchlistService,
    private readonly _shortLinkSettingsService: OrgShortLinkSettingsService,
    private readonly _resolution: ProviderResolutionService,
    private readonly _emailLogService: EmailLogService,
    private readonly _notificationService: NotificationService,
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
        integration.providerIdentifier,
        integration.providerVersion ?? undefined
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

      const channelRows: {
        organizationId: string;
        integrationId: string;
        metric: string;
        value: number;
        date: Date;
      }[] = [];

      try {
        const clientInformation = await this._integrationManager.requireClientInformation(
          integration.providerIdentifier,
          integration.organizationId,
          integration.providerConfigId
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

            channelRows.push({
              organizationId: orgId,
              integrationId: integration.id,
              metric: canonical,
              value: val,
              date: dayjs(point.date).startOf('day').toDate(),
            });
          }
        }

        if (channelRows.length > 0) {
          await this._analyticsRepository.upsertChannelSnapshots(channelRows);
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

  // Process one keyset page of posts for snapshot collection. Durable callers
  // (the Inngest sync-org function) loop over this with a per-page step.run so
  // the cursor is checkpointed across retries; the all-pages wrapper below stays
  // available for callers that don't need durability.
  async collectPostSnapshotsPage(
    orgId: string,
    daysBack: number,
    cursor?: string
  ): Promise<{ nextCursor?: string; processed: number }> {
    await this._orgProviderConfigManager.ensureFresh(orgId);
    const since = dayjs().subtract(daysBack, 'day').startOf('day').toDate();

    const posts = (
      await this._analyticsRepository.findPostsForSnapshots(
        orgId,
        since,
        POST_SNAPSHOT_BATCH_SIZE,
        cursor
      )
    ).map(decryptPostIntegrationTokens);

    for (const post of posts) {
      if (!post.releaseId || post.releaseId === 'missing') continue;

      const postRows: {
        organizationId: string;
        postId: string;
        integrationId: string;
        metric: string;
        value: number;
        date: Date;
      }[] = [];

      try {
        const provider = this._integrationManager.getSocialIntegrationUnchecked(
          post.integration.providerIdentifier,
          post.integration.providerVersion ?? undefined
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
          post.integration.organizationId,
          post.integration.providerConfigId
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

            postRows.push({
              organizationId: orgId,
              postId: post.id,
              integrationId: post.integrationId,
              metric: canonical,
              value: val,
              date: dayjs(point.date).startOf('day').toDate(),
            });
          }
        }

        if (postRows.length > 0) {
          await this._analyticsRepository.upsertPostSnapshots(postRows);
        }

        // Update denormalized counters on the Post record
        const latestSnapshots =
          await this._analyticsRepository.getLatestPostSnapshots(orgId, [post.id], [
            'views',
            'likes',
            'comments',
            'impressions',
            'reactions',
            'replies',
          ]);

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
          await this._analyticsRepository.updatePostCounters(
            orgId,
            post.id,
            updateData
          );
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

    return {
      nextCursor:
        posts.length === POST_SNAPSHOT_BATCH_SIZE
          ? posts[posts.length - 1].id
          : undefined,
      processed: posts.length,
    };
  }

  // Non-durable all-pages wrapper. Keeps the original contract for callers and
  // tests that don't need per-page checkpointing.
  async collectPostSnapshots(orgId: string, daysBack: number): Promise<void> {
    let cursor: string | undefined;
    do {
      const result = await this.collectPostSnapshotsPage(orgId, daysBack, cursor);
      cursor = result.nextCursor;
    } while (cursor);
  }

  async pruneAndRollupSnapshots(orgId: string): Promise<void> {
    const dailyCutoff = dayjs()
      .subtract(
        getRetentionDays(
          'ANALYTICS_DAILY_RETENTION_DAYS',
          DEFAULT_DAILY_RETENTION_DAYS
        ),
        'day'
      )
      .startOf('day')
      .toDate();
    const postCutoff = dayjs()
      .subtract(
        getRetentionDays(
          'ANALYTICS_POST_RETENTION_DAYS',
          DEFAULT_POST_RETENTION_DAYS
        ),
        'day'
      )
      .startOf('day')
      .toDate();

    // 1. Roll up post snapshots older than the post-retention window into one
    //    weekly row per (postId, metric, ISO week) — always the week's LATEST
    //    known level (R1.7), because PostAnalyticsSnapshot.value is a cumulative
    //    lifetime level for every metric (not a per-window flow). A weekly row is
    //    then simply the week's last level, and the read-time level-differencing
    //    keeps working across the daily→weekly granularity seam with no special
    //    cases. Bounded below by `postFloor` (R1.8) so the sweep only compacts a
    //    fixed recent window, not the org's whole pre-cutoff history. Same atomic
    //    delete+createMany-in-$transaction machinery as the channel rollup below.
    const postFloor = dayjs(postCutoff)
      .subtract(POST_ROLLUP_LOOKBACK_DAYS, 'day')
      .startOf('day')
      .toDate();

    // No silent truncation: report rows aging past the bounded window (they stay
    // daily and still aggregate correctly as levels — only compaction is missed).
    const skippedBelowFloor =
      await this._analyticsRepository.countPostSnapshotsBeforeFloor(
        orgId,
        postFloor
      );
    if (skippedBelowFloor > 0) {
      this.logger.warn(
        `AnalyticsActivity: ${skippedBelowFloor} post snapshot(s) older than the rollup floor were left un-compacted (org ${orgId})`
      );
    }

    const oldPostRows = await this._analyticsRepository.findPostSnapshotsBefore(
      orgId,
      postFloor,
      postCutoff
    );
    if (oldPostRows.length) {
      const postGroups = new Map<
        string,
        {
          postId: string;
          integrationId: string;
          metric: string;
          weekStart: Date;
          latestDate: Date;
          latestValue: number;
        }
      >();

      for (const row of oldPostRows) {
        const weekStart = dayjs(row.date)
          .startOf('isoWeek')
          .startOf('day')
          .toDate();
        const key = `${row.postId}|${row.metric}|${weekStart.getTime()}`;
        const existing = postGroups.get(key);
        if (!existing) {
          postGroups.set(key, {
            postId: row.postId,
            integrationId: row.integrationId,
            metric: row.metric,
            weekStart,
            latestDate: row.date,
            latestValue: row.value,
          });
          continue;
        }
        if (dayjs(row.date).isAfter(dayjs(existing.latestDate))) {
          existing.latestDate = row.date;
          existing.latestValue = row.value;
        }
      }

      const weeklyPostRows = Array.from(postGroups.values()).map((g) => ({
        organizationId: orgId,
        postId: g.postId,
        integrationId: g.integrationId,
        metric: g.metric,
        // R1.7: levels — always the week's last known value, every metric.
        value: g.latestValue,
        date: g.weekStart,
      }));

      await this._analyticsRepository.replaceRolledUpPostSnapshots(
        orgId,
        postFloor,
        postCutoff,
        weeklyPostRows
      );
    }

    // 2. Roll up channel snapshots older than the daily-retention window into
    //    a single weekly row per (integration, metric, ISO week): flow metrics
    //    are summed, stock metrics keep the latest value in the week.
    const oldRows = await this._analyticsRepository.findChannelSnapshotsBefore(
      orgId,
      dailyCutoff
    );
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
    await this._analyticsRepository.replaceRolledUpSnapshots(
      orgId,
      dailyCutoff,
      weeklyRows
    );
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

  // ── Anomaly detection (Phase 4) ──
  // Loads 35d of channel snapshots, runs the pure detector per (integration,
  // metric), persists anomaly rows idempotently, and fires notifications
  // (cooldown-gated, capped 3/org/day). Never throws — a detection failure must
  // not fail the sweep (same posture as notifySnapshotComplete).
  async detectAnomalies(orgId: string): Promise<void> {
    try {
      const z = envFloat('ANALYTICS_ANOMALY_Z', 3);
      const cooldownDays = getRetentionDays('ANALYTICS_ANOMALY_COOLDOWN_DAYS', 3);

      const since = dayjs().subtract(35, 'day').startOf('day').toDate();
      const loaded =
        await this._analyticsRepository.getSnapshotsForOrgSince(orgId, since);
      // Exclude today's rows: the 02:00 UTC sweep upserts a ~2-hour PARTIAL day
      // for flow metrics, and testing that partial against a 28-full-day
      // baseline systematically fires false "drop" alerts. Yesterday is the
      // newest complete day — it becomes the candidate for the detector AND for
      // alert-rule evaluation (both read the series' last point).
      const todayStart = dayjs().startOf('day');
      const snapshots = loaded.filter((s) =>
        dayjs(s.date).isBefore(todayStart)
      );
      if (snapshots.length === 0) return;

      const integrations =
        await this._analyticsRepository.getBestTimeIntegrations(orgId);
      const intById = new Map(integrations.map((i) => [i.id, i]));

      // Group by (integrationId, metric).
      const groups = new Map<
        string,
        { integrationId: string; metric: string; series: { date: Date; value: number }[] }
      >();
      for (const s of snapshots) {
        const key = `${s.integrationId}::${s.metric}`;
        let g = groups.get(key);
        if (!g) {
          g = { integrationId: s.integrationId, metric: s.metric, series: [] };
          groups.set(key, g);
        }
        g.series.push({ date: s.date, value: s.value });
      }

      const cooldownFrom = dayjs()
        .subtract(cooldownDays, 'day')
        .startOf('day')
        .toDate();

      type Pending = {
        row: {
          organizationId: string;
          integrationId: string;
          metric: string;
          date: Date;
          value: number;
          baseline: number;
          deviation: number;
          direction: string;
          topPostId?: string | null;
          ruleId?: string | null;
          notifiedAt?: Date | null;
        };
        canNotify: boolean;
        integrationName: string;
        topPostTitle?: string;
      };
      const pending: Pending[] = [];

      type FiredGroup = {
        integrationId: string;
        metric: string;
        candidateDate: Date;
        result: {
          value: number;
          baseline: number;
          deviation: number;
          direction: string;
        };
      };
      const fired: FiredGroup[] = [];

      for (const g of groups.values()) {
        const def = METRIC_REGISTRY[g.metric];
        const kind: MetricKind = def?.kind === 'stock' ? 'stock' : 'flow';
        const result = detectAnomaly(g.series, kind, {
          z,
          floor: DEFAULT_ANOMALY_FLOORS[kind],
        });
        if (!result) continue;

        fired.push({
          integrationId: g.integrationId,
          metric: g.metric,
          candidateDate: g.series[g.series.length - 1].date,
          result,
        });
      }

      // Root-cause hint (4.9): batch-read the top post for every fired group in
      // one query (ANALYTICS-06). Falls back to one query per group when the
      // batch method is unavailable (e.g. older test mocks).
      const rootCauseByGroup = new Map<
        string,
        { topPostId: string | null; topPostTitle?: string }
      >();
      if (fired.length > 0) {
        if (
          typeof this._analyticsRepository.getDayPostSnapshotsForGroups ===
          'function'
        ) {
          try {
            const starts = fired.map((f) => dayjs(f.candidateDate).startOf('day'));
            const ends = fired.map((f) => dayjs(f.candidateDate).endOf('day'));
            const dayStart = starts
              .reduce((min, d) => (d.isBefore(min) ? d : min))
              .toDate();
            const dayEnd = ends
              .reduce((max, d) => (d.isAfter(max) ? d : max))
              .toDate();
            const allDayPosts =
              await this._analyticsRepository.getDayPostSnapshotsForGroups(
                orgId,
                fired.map((f) => ({
                  integrationId: f.integrationId,
                  metric: f.metric,
                })),
                dayStart,
                dayEnd
              );

            const firedMap = new Map(
              fired.map((f) => [`${f.integrationId}::${f.metric}`, f])
            );
            const grouped = new Map<string, typeof allDayPosts>();
            for (const row of allDayPosts) {
              const key = `${row.integrationId}::${row.metric}`;
              const fg = firedMap.get(key);
              if (
                !fg ||
                !dayjs(row.date).isSame(dayjs(fg.candidateDate), 'day')
              ) {
                continue;
              }
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(row);
            }

            for (const fg of fired) {
              const key = `${fg.integrationId}::${fg.metric}`;
              const rows = grouped.get(key) || [];
              if (rows.length === 0) continue;
              const top = rows.reduce((a, b) =>
                b.value > a.value ? b : a
              );
              const content = (top as any).post?.content as
                | string
                | undefined;
              rootCauseByGroup.set(key, {
                topPostId: top.postId,
                topPostTitle: content
                  ? content.replace(/<[^>]*>/g, '').slice(0, 80).trim()
                  : undefined,
              });
            }
          } catch {
            // root-cause is best-effort; never block an anomaly on it
          }
        } else {
          // P-03: the batched `getDayPostSnapshotsForGroups` path above is the
          // production default (single OR-ed query). This per-group fallback is
          // retained only for older repository mocks/test fixtures that do not
          // implement the batch method; it is best-effort and never blocks the
          // anomaly detection pipeline.
          for (const fg of fired) {
            try {
              const dayStart = dayjs(fg.candidateDate).startOf('day').toDate();
              const dayEnd = dayjs(fg.candidateDate).endOf('day').toDate();
              const dayPosts = await this._analyticsRepository.getDayPostSnapshots(
                orgId,
                [fg.integrationId],
                fg.metric,
                dayStart,
                dayEnd
              );
              if (dayPosts.length > 0) {
                const top = dayPosts.reduce((a, b) =>
                  b.value > a.value ? b : a
                );
                const content = (top as any).post?.content as
                  | string
                  | undefined;
                rootCauseByGroup.set(`${fg.integrationId}::${fg.metric}`, {
                  topPostId: top.postId,
                  topPostTitle: content
                    ? content.replace(/<[^>]*>/g, '').slice(0, 80).trim()
                    : undefined,
                });
              }
            } catch {
              // root-cause is best-effort
            }
          }
        }
      }

      for (const fg of fired) {
        const key = `${fg.integrationId}::${fg.metric}`;
        const rc = rootCauseByGroup.get(key);

        const recent = await this._analyticsRepository.getRecentAnomaly(
          orgId,
          fg.integrationId,
          fg.metric,
          fg.result.direction,
          cooldownFrom,
        );

        pending.push({
          row: {
            organizationId: orgId,
            integrationId: fg.integrationId,
            metric: fg.metric,
            date: fg.candidateDate,
            value: fg.result.value,
            baseline: fg.result.baseline,
            deviation: fg.result.deviation,
            direction: fg.result.direction,
            topPostId: rc?.topPostId ?? null,
          },
          canNotify: !recent,
          integrationName:
            intById.get(fg.integrationId)?.name || 'a channel',
          topPostTitle: rc?.topPostTitle,
        });
      }

      // ── 7.3: evaluate user-defined alert rules against the SAME loaded
      //    snapshots, after the automatic detector. A fired rule writes an
      //    AnalyticsAnomaly row (ruleId set) and folds into the same
      //    notification cap+cooldown pipeline below. Cooldown is the rule's own
      //    `lastFiredAt` (reusing the anomaly cooldown window) so a rule can't
      //    re-fire day after day; firing sets `lastFiredAt`. Non-fatal: a rule
      //    read/eval failure must not abort the sweep.
      const firedRuleIds = new Set<string>();
      try {
        const rules =
          await this._analyticsRepository.getEnabledAlertRules(orgId);
        for (const rule of rules) {
          // Cooldown gate: skip firing while inside the window.
          if (
            rule.lastFiredAt &&
            dayjs(rule.lastFiredAt).isAfter(dayjs(cooldownFrom))
          ) {
            continue;
          }

          for (const g of groups.values()) {
            if (g.metric !== rule.metric) continue;
            if (rule.integrationId && rule.integrationId !== g.integrationId) {
              continue;
            }

            const evaluated = this.evaluateAlertRule(rule, g.series);
            if (!evaluated) continue;

            firedRuleIds.add(rule.id);

            // R4.3: a detector row may already be pending for the SAME
            // @@unique([integrationId, metric, date]) key. Pushing a second row
            // makes createAnomalies' skipDuplicates silently drop the rule row —
            // losing the ruleId attribution while both notifications still fire.
            // Instead, attach the rule to the existing row and ensure it notifies
            // (a user-defined rule fire is always notify-worthy).
            const existing = pending.find(
              (pp) =>
                pp.row.integrationId === g.integrationId &&
                pp.row.metric === g.metric &&
                dayjs(pp.row.date).isSame(dayjs(evaluated.date), 'day')
            );
            if (existing) {
              existing.row.ruleId = rule.id;
              existing.canNotify = true;
              continue;
            }

            pending.push({
              row: {
                organizationId: orgId,
                integrationId: g.integrationId,
                metric: g.metric,
                date: evaluated.date,
                value: evaluated.value,
                baseline: evaluated.baseline,
                deviation: evaluated.deviation,
                direction: evaluated.direction,
                topPostId: null,
                ruleId: rule.id,
              },
              canNotify: true,
              integrationName:
                intById.get(g.integrationId)?.name || 'a channel',
            });
          }
        }
      } catch (err) {
        this.logger.warn('alert-rule evaluation failed', {
          error: (err as Error)?.message,
        });
      }

      if (pending.length === 0) return;

      // Notification cap: 3/org/day, highest |deviation| first. Non-notified
      // anomalies still persist their rows.
      const notifiable = pending
        .filter((p) => p.canNotify)
        .sort((a, b) => Math.abs(b.row.deviation) - Math.abs(a.row.deviation))
        .slice(0, 3);
      const now = new Date();
      for (const p of notifiable) p.row.notifiedAt = now;

      await this._analyticsRepository.createAnomalies(pending.map((p) => p.row));

      // 7.3: stamp lastFiredAt on rules that fired this run so the cooldown gate
      // above suppresses a daily re-fire. P2: batch into a single updateMany.
      if (firedRuleIds.size > 0) {
        try {
          await this._analyticsRepository.updateAlertRulesLastFiredAt(
            orgId,
            Array.from(firedRuleIds),
            now
          );
        } catch (err) {
          this.logger.warn('alert-rule lastFiredAt batch update failed', {
            error: (err as Error)?.message,
            ruleIds: Array.from(firedRuleIds),
          });
        }
      }

      // 6.8: dispatch an `analytics.anomaly_detected` webhook for the persisted
      // batch so n8n/Zapier users can automate on spikes/drops. Guarded with the
      // same error-swallowed posture as notifySnapshotComplete — a webhook
      // failure must not skip the in-app notifications below. Only fires when at
      // least one anomaly persisted (pending is non-empty here).
      try {
        await this._webhooksService.dispatchEvent(
          orgId,
          'analytics.anomaly_detected',
          {
            orgId,
            anomalies: pending.map((p) => ({
              integrationId: p.row.integrationId,
              integrationName: p.integrationName,
              metric: p.row.metric,
              direction: p.row.direction,
              value: p.row.value,
              baseline: p.row.baseline,
              deviation: p.row.deviation,
              date: p.row.date,
              topPostId: p.row.topPostId ?? null,
            })),
            timestamp: new Date().toISOString(),
          }
        );
      } catch (err) {
        this.logger.warn('anomaly_detected webhook dispatch failed', {
          error: (err as Error)?.message,
        });
      }

      for (const p of notifiable) {
        try {
          await this._notificationService.notifyAnalyticsAnomaly({
            orgId,
            integrationName: p.integrationName,
            metric: METRIC_REGISTRY[p.row.metric]?.label || p.row.metric,
            metricKey: p.row.metric,
            direction: p.row.direction as 'spike' | 'drop',
            value: p.row.value,
            baseline: p.row.baseline,
            deviation: p.row.deviation,
            integrationId: p.row.integrationId,
            topPostTitle: p.topPostTitle,
          });
        } catch (err) {
          this.logger.warn('notifyAnalyticsAnomaly failed', {
            error: (err as Error)?.message,
            integrationId: p.row.integrationId,
            metric: p.row.metric,
          });
        }
      }
    } catch (err) {
      this.logger.error('detectAnomalies error:', {
        error: (err as Error)?.message,
      });
    }
  }

  // 7.3: evaluate a single alert rule against one (integration, metric) series
  // (ascending by date). Returns the anomaly-row fields on a fire, else null.
  //   - gte/lte: compare the LATEST value against threshold.
  //   - change_pct: trailing-7-day SUM vs prior-7-day SUM; fires when the signed
  //     percentage change crosses threshold in the rule's direction. A zero
  //     prior window yields an undefined percent → no fire.
  private evaluateAlertRule(
    rule: { comparator: string; threshold: number; direction: string },
    series: { date: Date; value: number }[],
  ): {
    date: Date;
    value: number;
    baseline: number;
    deviation: number;
    direction: string;
  } | null {
    if (series.length === 0) return null;
    const latest = series[series.length - 1];
    const t = rule.threshold;

    if (rule.comparator === 'gte' || rule.comparator === 'lte') {
      const fires =
        rule.comparator === 'gte' ? latest.value >= t : latest.value <= t;
      if (!fires) return null;
      return {
        date: latest.date,
        value: latest.value,
        baseline: t,
        deviation: t !== 0 ? (latest.value - t) / t : 0,
        direction: rule.comparator === 'gte' ? 'spike' : 'drop',
      };
    }

    // change_pct: trailing-7-day sum vs the prior-7-day sum.
    const trailingFrom = dayjs(latest.date).subtract(6, 'day').startOf('day');
    const priorFrom = dayjs(latest.date).subtract(13, 'day').startOf('day');
    const priorTo = dayjs(latest.date).subtract(7, 'day').endOf('day');

    let trailing = 0;
    let prior = 0;
    for (const p of series) {
      const d = dayjs(p.date);
      if (!d.isBefore(trailingFrom)) {
        trailing += p.value;
      } else if (!d.isBefore(priorFrom) && !d.isAfter(priorTo)) {
        prior += p.value;
      }
    }

    if (prior <= 0) return null; // no meaningful percent off a zero baseline
    const changePct = ((trailing - prior) / prior) * 100;
    const fires =
      rule.direction === 'down' ? changePct <= -t : changePct >= t;
    if (!fires) return null;

    return {
      date: latest.date,
      value: trailing,
      baseline: prior,
      deviation: changePct / 100,
      direction: rule.direction === 'down' ? 'drop' : 'spike',
    };
  }

  // ── Weekly "your week in numbers" summary (6.9) ──
  // Composes this-week-vs-last-week FLOW-metric totals from two non-overlapping
  // 7-day windows of channel snapshots (grouped/summed here — never through
  // AnalyticsService), plus a top post, the best channel, and a one-line anomaly
  // recap, then fires the weekly `analytics`-category digest notification. Only
  // reads existing repo methods. Non-fatal: never throws, so it can ride the
  // daily sweep as a swallowed step.
  async buildWeeklySummary(
    orgId: string
  ): Promise<WeeklyAnalyticsSummary | null> {
    try {
      const integrations =
        await this._analyticsRepository.getBestTimeIntegrations(orgId);
      if (integrations.length === 0) return null;
      const integrationIds = integrations.map((i) => i.id);
      const nameById = new Map(
        integrations.map((i) => [i.id, i.name || 'a channel'])
      );

      // Two non-overlapping 7-day windows: the trailing week vs the week before.
      const thisFrom = dayjs().subtract(6, 'day').startOf('day').toDate();
      const thisTo = dayjs().endOf('day').toDate();
      const lastFrom = dayjs().subtract(13, 'day').startOf('day').toDate();
      const lastTo = dayjs().subtract(7, 'day').endOf('day').toDate();

      const [thisWeekRows, lastWeekRows] = await Promise.all([
        this._analyticsRepository.getSnapshots(
          orgId,
          integrationIds,
          thisFrom,
          thisTo
        ),
        this._analyticsRepository.getSnapshots(
          orgId,
          integrationIds,
          lastFrom,
          lastTo
        ),
      ]);

      // Sum FLOW metrics only — stock metrics (followers) aren't meaningfully
      // summed across a window.
      const isFlow = (metric: string) =>
        (METRIC_REGISTRY[metric]?.kind ?? 'flow') !== 'stock';

      const sumByMetric = (
        rows: { metric: string; value: number }[]
      ): Map<string, number> => {
        const m = new Map<string, number>();
        for (const r of rows) {
          if (!isFlow(r.metric)) continue;
          m.set(r.metric, (m.get(r.metric) || 0) + r.value);
        }
        return m;
      };

      const thisByMetric = sumByMetric(thisWeekRows);
      const lastByMetric = sumByMetric(lastWeekRows);

      const metrics = Array.from(thisByMetric.entries())
        .map(([metric, thisWeek]) => {
          const lastWeek = lastByMetric.get(metric) || 0;
          const changePct =
            lastWeek > 0
              ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
              : null;
          return {
            metric,
            label: METRIC_REGISTRY[metric]?.label || metric,
            thisWeek,
            lastWeek,
            changePct,
          };
        })
        .sort((a, b) => b.thisWeek - a.thisWeek);

      // Best channel: largest summed flow value this week.
      const byIntegration = new Map<string, number>();
      for (const r of thisWeekRows) {
        if (!isFlow(r.metric)) continue;
        byIntegration.set(
          r.integrationId,
          (byIntegration.get(r.integrationId) || 0) + r.value
        );
      }
      let bestChannel: WeeklyAnalyticsSummary['bestChannel'] = null;
      for (const [integrationId, total] of byIntegration.entries()) {
        if (!bestChannel || total > bestChannel.total) {
          bestChannel = {
            integrationId,
            name: nameById.get(integrationId) || 'a channel',
            total,
          };
        }
      }

      // Top post on the headline metric (largest this-week total).
      let topPost: WeeklyAnalyticsSummary['topPost'] = null;
      const headline = metrics[0]?.metric;
      if (headline) {
        try {
          const topPosts =
            await this._analyticsRepository.getMetricDetailTopPosts(
              orgId,
              integrationIds,
              headline,
              thisFrom,
              thisTo
            );
          const top = topPosts[0];
          if (top) {
            const content = (top as any).post?.content as string | undefined;
            const title = content
              ? content.replace(/<[^>]*>/g, '').slice(0, 80).trim()
              : '';
            topPost = { postId: top.postId, title, metric: headline, value: top.value };
          }
        } catch {
          // top post is best-effort — never block the summary on it
        }
      }

      // One-line anomaly recap (best-effort; skip gracefully on any read failure).
      let anomalyRecap: string | null = null;
      try {
        const anomalies = await this._analyticsRepository.listAnomalies(orgId, {
          limit: 5,
        });
        const weekAnoms = anomalies.filter((a: any) =>
          dayjs(a.createdAt).isAfter(dayjs(thisFrom))
        );
        if (weekAnoms.length > 0) {
          anomalyRecap = `${weekAnoms.length} analytics alert${
            weekAnoms.length === 1 ? '' : 's'
          } flagged this week`;
        }
      } catch {
        // anomaly recap is optional — a missing/failing read just drops the line
      }

      const summary: WeeklyAnalyticsSummary = {
        orgId,
        weekStart: thisFrom,
        weekEnd: thisTo,
        metrics,
        topPost,
        bestChannel,
        anomalyRecap,
        hasData: metrics.length > 0,
      };

      if (summary.hasData) {
        try {
          await this._notificationService.notifyWeeklyAnalyticsSummary({
            orgId,
            metrics: metrics.slice(0, 3).map((m) => ({
              label: m.label,
              thisWeek: m.thisWeek,
              changePct: m.changePct,
            })),
            topPostTitle: topPost?.title || undefined,
            bestChannelName: bestChannel?.name,
            anomalyRecap: anomalyRecap || undefined,
          });
        } catch (err) {
          this.logger.warn('notifyWeeklyAnalyticsSummary failed', {
            error: (err as Error)?.message,
          });
        }
      }

      return summary;
    } catch (err) {
      this.logger.error('buildWeeklySummary error:', {
        error: (err as Error)?.message,
      });
      return null;
    }
  }

  async backfillIntegration(payload: {
    integrationId: string;
    organizationId: string;
  }): Promise<void> {
    const { integrationId, organizationId } = payload;

    const integration = decryptIntegrationTokens(
      await this._analyticsRepository.findIntegrationByIdRaw(
        integrationId,
        organizationId
      )
    );
    if (!integration || integration.type !== 'social') return;

    await this._orgProviderConfigManager.ensureFresh(integration.organizationId);

    const provider = this._integrationManager.getSocialIntegrationUnchecked(
      integration.providerIdentifier,
      integration.providerVersion ?? undefined
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

    const backfillRows: {
      organizationId: string;
      integrationId: string;
      metric: string;
      value: number;
      date: Date;
    }[] = [];

    try {
      const clientInformation = await this._integrationManager.requireClientInformation(
        integration.providerIdentifier,
        integration.organizationId,
        integration.providerConfigId
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

          backfillRows.push({
            organizationId: integration.organizationId,
            integrationId: integration.id,
            metric: canonical,
            value: val,
            date: dayjs(point.date).startOf('day').toDate(),
          });
        }
      }

      if (backfillRows.length > 0) {
        await this._analyticsRepository.upsertChannelSnapshots(backfillRows);
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

    let adapter;
    try {
      adapter = this._resolution.resolveShortLink(active.identifier, {
        version: active.version ?? 'v1',
        credentials: active.credentials || {},
        orgId,
      });
    } catch {
      return;
    }
    if (!adapter) return;
    if (!adapter.capabilities.statistics) return;
    if (!adapter.linkStatistics) return;

    const links = await this._shortLinkSettingsService.getLinksForOrg(orgId);
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
          await this._shortLinkSettingsService.upsertSnapshotsBatch(rows);
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
    const retentionDays = getRetentionDays('ANALYTICS_POST_RETENTION_DAYS', 90);

    const before = dayjs().subtract(retentionDays, 'day').startOf('day').toDate();
    await this._shortLinkSettingsService.pruneSnapshots(orgId, before);
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

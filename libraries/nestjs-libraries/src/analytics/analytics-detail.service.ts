// Metric / day / channel drill-down reads extracted from analytics.service.ts
// (5.3). Behaviour-neutral: identical logic, injected with the repo +
// live-fallback it needs, using the pure aggregation helpers (no DI cycle).
// The facade delegates getMetricDetail/getDayDetail/getChannelMetric here.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics.repository';
import { isKnownMetric } from '@gitroom/nestjs-libraries/integrations/social/analytics.metrics';
import { Organization } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  AnalyticsMetricDetailResponse,
  MetricSeries,
  SnapshotLike,
} from './analytics.types';
import {
  aggregateSnapshots,
  buildFilledDayMap,
  computePercentageChange,
  getMetricDef,
} from './analytics-aggregation';
import { AnalyticsLiveFallbackService } from './analytics-live-fallback';

dayjs.extend(utc);

@Injectable()
export class AnalyticsDetailService {
  private readonly _logger = new Logger(AnalyticsDetailService.name);

  constructor(
    private analyticsRepository: AnalyticsRepository,
    private liveFallback: AnalyticsLiveFallbackService,
  ) {}

  private async getSnapshots(
    orgId: string,
    integrationIds: string[],
    from: Date,
    to: Date
  ) {
    return this.analyticsRepository.getSnapshots(orgId, integrationIds, from, to);
  }

  private async getIntegrations(orgId: string, integrationIds: string[]) {
    return this.analyticsRepository.getIntegrations(orgId, integrationIds);
  }

  async getMetricDetail(
    org: Organization,
    metric: string,
    from: string,
    to: string,
    integrationIds: string[],
    compare: boolean,
    opts: { campaignIds?: string[] } = {}
  ): Promise<AnalyticsMetricDetailResponse> {
    if (!isKnownMetric(metric)) {
      throw new NotFoundException(`Unknown metric: ${metric}`);
    }

    const campaignIds = opts.campaignIds ?? [];
    const scoped = campaignIds.length > 0;
    const def = getMetricDef(metric);
    const fromDate = dayjs(from).startOf('day').toDate();
    const toDate = dayjs(to).endOf('day').toDate();
    let dbIntegrations = await this.getIntegrations(org.id, integrationIds);
    let ids = dbIntegrations.map((i) => i.id);

    let snapshots: SnapshotLike[];
    if (scoped) {
      // Campaign scope (1.3): post snapshots via Post.campaignId, no live
      // fallback. When no explicit channel filter is passed, derive the channel
      // set from the campaign's own snapshots.
      const filterIds = ids.length ? ids : undefined;
      snapshots = await this.analyticsRepository.getPostSnapshotsByCampaigns(
        org.id, campaignIds, fromDate, toDate, filterIds
      );
      if (!ids.length) {
        const derived = [...new Set(snapshots.map((s) => s.integrationId))];
        dbIntegrations = derived.length ? await this.getIntegrations(org.id, derived) : [];
        ids = dbIntegrations.map((i) => i.id);
      }
    } else {
      snapshots = await this.getSnapshots(org.id, ids, fromDate, toDate);
      snapshots = await this.liveFallback.applyLiveFallbackIfNeeded(
        org, ids, dbIntegrations, fromDate, toDate, snapshots
      );
    }

    const windowSize = dayjs(toDate).diff(dayjs(fromDate), 'day');
    let previousSnapshots: any[] = [];
    if (compare) {
      const prevToDate = dayjs(fromDate)
        .subtract(1, 'day')
        .endOf('day')
        .toDate();
      const prevFromDate = dayjs(prevToDate)
        .subtract(windowSize, 'day')
        .startOf('day')
        .toDate();

      if (scoped) {
        previousSnapshots = (
          await this.analyticsRepository.getPostSnapshotsByCampaigns(
            org.id, campaignIds, prevFromDate, prevToDate, ids.length ? ids : undefined
          )
        ).filter((s) => s.metric === metric);
      } else {
        previousSnapshots = (
          await this.getSnapshots(org.id, ids, prevFromDate, prevToDate)
        ).filter((s) => s.metric === metric);

        previousSnapshots = await this.liveFallback.applyLiveFallbackIfNeeded(
          org, ids, dbIntegrations, prevFromDate, prevToDate, previousSnapshots, metric
        );
      }
    }

    const metricSnapshots = snapshots.filter((s) => s.metric === metric);

    const total = aggregateSnapshots(snapshots, metric);
    const previousTotal = compare
      ? aggregateSnapshots(previousSnapshots, metric)
      : null;
    const percentageChange = computePercentageChange(
      total,
      previousTotal,
      def.format
    );

    const currentMap = buildFilledDayMap(
      snapshots,
      metric,
      fromDate,
      toDate,
      def.kind,
      0
    );

    let prevOffsetMap: Record<string, number> = {};
    if (compare) {
      const prevToDate = dayjs(fromDate)
        .subtract(1, 'day')
        .endOf('day')
        .toDate();
      const prevFromDate = dayjs(prevToDate)
        .subtract(windowSize, 'day')
        .startOf('day')
        .toDate();
      const dateOffset = windowSize + 1;
      prevOffsetMap = buildFilledDayMap(
        previousSnapshots,
        metric,
        prevFromDate,
        prevToDate,
        def.kind,
        dateOffset
      );
    }

    const series: MetricSeries[] = [];
    let cursor = dayjs(fromDate);
    const end = dayjs(toDate);
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const key = cursor.format('YYYY-MM-DD');
      series.push({
        date: key,
        value: currentMap[key] || 0,
        ...(compare ? { previousValue: prevOffsetMap[key] || 0 } : {}),
      });
      cursor = cursor.add(1, 'day');
    }

    const channelTotals: Record<string, number> = {};
    for (const int of dbIntegrations) {
      channelTotals[int.id] = aggregateSnapshots(
        metricSnapshots.filter((s) => s.integrationId === int.id),
        metric
      );
    }

    const totalValue =
      Object.values(channelTotals).reduce((a, b) => a + b, 0) || 1;

    const byChannel = dbIntegrations.map((int) => {
      const channelTotal = channelTotals[int.id] || 0;
      const channelPrevSnapshots = compare
        ? previousSnapshots.filter((s) => s.integrationId === int.id)
        : [];
      const channelPrevious = compare
        ? aggregateSnapshots(channelPrevSnapshots, metric)
        : null;
      return {
        integrationId: int.id,
        name: int.name,
        identifier: int.providerIdentifier,
        picture: int.picture,
        value: channelTotal,
        percentageChange: computePercentageChange(
          channelTotal,
          channelPrevious,
          def.format
        ),
        share: Math.round((channelTotal / totalValue) * 10000) / 100,
      };
    });

    let topPosts: any[] = [];
    try {
      // Secondary, best-effort list. Under campaign scope this is keyed by the
      // campaign's derived channels, so a channel shared across campaigns can
      // surface a sibling campaign's post here — the primary aggregates above
      // stay campaign-exact. (Phase-1 approximation; refined in a later phase.)
      const topPostsSnapshots =
        await this.analyticsRepository.getMetricDetailTopPosts(org.id, ids, metric, fromDate, toDate);
      topPosts = topPostsSnapshots.map((snap) => ({
        postId: snap.postId,
        content: (snap.post as any)?.content?.substring(0, 200) || '',
        publishedAt: (snap.post as any)?.publishDate?.toISOString() || '',
        value: snap.value,
        integrationId: snap.integrationId,
      }));
    } catch (err) {
      this._logger.error(`getMetricDetail top-posts fallback: ${(err as Error)?.message}`);
    }

    const movers: { up: any[]; down: any[] } = { up: [], down: [] };
    if (compare) {
      const changes = dbIntegrations.map((int) => {
        const currentVal = aggregateSnapshots(
          metricSnapshots.filter((s) => s.integrationId === int.id),
          metric
        );
        const prevVal = aggregateSnapshots(
          previousSnapshots.filter((s) => s.integrationId === int.id),
          metric
        );
        const pctChange = computePercentageChange(
          currentVal,
          prevVal,
          def.format
        );
        return {
          integrationId: int.id,
          name: int.name,
          identifier: int.providerIdentifier,
          picture: int.picture,
          value: currentVal,
          previousValue: prevVal,
          percentageChange: pctChange,
        };
      });

      changes.sort(
        (a, b) => (b.percentageChange || 0) - (a.percentageChange || 0)
      );
      movers.up = changes
        .filter((c) => (c.percentageChange || 0) > 0)
        .slice(0, 3);
      movers.down = changes
        .filter((c) => (c.percentageChange || 0) < 0)
        .reverse()
        .slice(0, 3);
    }

    return {
      metric,
      label: def.label,
      format: def.format,
      total,
      previousTotal,
      percentageChange,
      series,
      byChannel,
      topPosts,
      movers,
    };
  }

  async getDayDetail(
    org: Organization,
    date: string,
    metric: string,
    integrationIds: string[],
    opts: { campaignIds?: string[] } = {}
  ) {
    if (!isKnownMetric(metric)) {
      throw new NotFoundException(`Unknown metric: ${metric}`);
    }

    const campaignIds = opts.campaignIds ?? [];
    const scoped = campaignIds.length > 0;
    const dateStart = dayjs(date).startOf('day').toDate();
    const dateEnd = dayjs(date).endOf('day').toDate();
    let dbIntegrations = await this.getIntegrations(org.id, integrationIds);
    let ids = dbIntegrations.map((i) => i.id);

    // `valueRows` feeds day total + byChannel. Unscoped = channel
    // AnalyticsSnapshot; campaign scope = post snapshots via Post.campaignId
    // (channel metrics are not campaign-attributable, so they're excluded).
    let valueRows: { integrationId: string; value: number }[];
    let postSnapshots: Awaited<
      ReturnType<AnalyticsRepository['getDayPostSnapshots']>
    >;
    if (scoped) {
      const filterIds = ids.length ? ids : undefined;
      const campaignRows = (
        await this.analyticsRepository.getPostSnapshotsByCampaigns(
          org.id, campaignIds, dateStart, dateEnd, filterIds
        )
      ).filter((s) => s.metric === metric);
      if (!ids.length) {
        const derived = [...new Set(campaignRows.map((s) => s.integrationId))];
        dbIntegrations = derived.length ? await this.getIntegrations(org.id, derived) : [];
        ids = dbIntegrations.map((i) => i.id);
      }
      valueRows = campaignRows;
      // Secondary post list keeps content via the day post read on the
      // campaign's derived channels (best-effort — same shared-channel caveat
      // as the metric-detail top posts).
      postSnapshots = ids.length
        ? await this.analyticsRepository.getDayPostSnapshots(org.id, ids, metric, dateStart, dateEnd)
        : [];
    } else {
      const [snapshots, ps] = await Promise.all([
        this.analyticsRepository.getDayAnalyticsSnapshots(org.id, ids, metric, dateStart, dateEnd),
        this.analyticsRepository.getDayPostSnapshots(org.id, ids, metric, dateStart, dateEnd),
      ]);
      valueRows = snapshots;
      postSnapshots = ps;
    }

    const totalValue = valueRows.reduce((a, b) => a + b.value, 0);

    const channelTotals: Record<string, number> = {};
    for (const snap of valueRows) {
      channelTotals[snap.integrationId] =
        (channelTotals[snap.integrationId] || 0) + snap.value;
    }

    const byChannel = dbIntegrations.map((int) => ({
      integrationId: int.id,
      name: int.name,
      identifier: int.providerIdentifier,
      picture: int.picture,
      value: channelTotals[int.id] || 0,
    }));

    const posts = postSnapshots.map((snap) => {
      const int = dbIntegrations.find((i) => i.id === snap.integrationId);
      return {
        postId: snap.postId,
        content: (snap.post as any)?.content?.substring(0, 200) || '',
        integration: int
          ? {
              id: int.id,
              name: int.name,
              identifier: int.providerIdentifier,
              picture: int.picture,
            }
          : null,
        value: snap.value,
        publishedAt: (snap.post as any)?.publishDate?.toISOString() || '',
        metrics: { [metric]: snap.value },
      };
    });

    return {
      date,
      metric,
      value: totalValue,
      byChannel,
      posts,
    };
  }

  async getChannelMetric(
    org: Organization,
    integrationId: string,
    metric: string,
    from: string,
    to: string,
    compare: boolean
  ) {
    if (!isKnownMetric(metric)) {
      throw new NotFoundException(`Unknown metric: ${metric}`);
    }

    const def = getMetricDef(metric);
    const fromDate = dayjs(from).startOf('day').toDate();
    const toDate = dayjs(to).endOf('day').toDate();
    const dbIntegrations = await this.getIntegrations(org.id, [integrationId]);
    if (dbIntegrations.length === 0) {
      throw new NotFoundException('Integration not found');
    }

    let snapshots: SnapshotLike[] = await this.analyticsRepository.getChannelAnalyticsSnapshots(org.id, integrationId, metric, fromDate, toDate);

    snapshots = await this.liveFallback.applyLiveFallbackIfNeeded(
      org, [integrationId], dbIntegrations, fromDate, toDate, snapshots, metric
    );

    const windowSize = dayjs(toDate).diff(dayjs(fromDate), 'day');
    const dateOffset = windowSize + 1;
    let previousSnapshots: any[] = [];
    if (compare) {
      const prevToDate = dayjs(fromDate)
        .subtract(1, 'day')
        .endOf('day')
        .toDate();
      const prevFromDate = dayjs(prevToDate)
        .subtract(windowSize, 'day')
        .startOf('day')
        .toDate();

      previousSnapshots = await this.analyticsRepository.getChannelAnalyticsSnapshots(org.id, integrationId, metric, prevFromDate, prevToDate);

      previousSnapshots = await this.liveFallback.applyLiveFallbackIfNeeded(
        org, [integrationId], dbIntegrations, prevFromDate, prevToDate, previousSnapshots, metric
      );
    }

    const dailyMap = buildFilledDayMap(
      snapshots,
      metric,
      fromDate,
      toDate,
      def.kind,
      0
    );

    let prevDailyMap: Record<string, number> = {};
    if (compare) {
      const prevToDate = dayjs(fromDate)
        .subtract(1, 'day')
        .endOf('day')
        .toDate();
      const prevFromDate = dayjs(prevToDate)
        .subtract(windowSize, 'day')
        .startOf('day')
        .toDate();
      prevDailyMap = buildFilledDayMap(
        previousSnapshots,
        metric,
        prevFromDate,
        prevToDate,
        def.kind,
        dateOffset
      );
    }

    const series: MetricSeries[] = [];
    let cursor = dayjs(fromDate);
    const end = dayjs(toDate);
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const key = cursor.format('YYYY-MM-DD');
      series.push({
        date: key,
        value: dailyMap[key] || 0,
        ...(compare ? { previousValue: prevDailyMap[key] || 0 } : {}),
      });
      cursor = cursor.add(1, 'day');
    }

    const postSnapshots = await this.analyticsRepository.getChannelPostSnapshots(org.id, integrationId, metric, fromDate, toDate);

    const topPosts = postSnapshots.map((snap) => ({
      postId: snap.postId,
      content: (snap.post as any)?.content?.substring(0, 200) || '',
      publishedAt: (snap.post as any)?.publishDate?.toISOString() || '',
      value: snap.value,
    }));

    const dayTotals: Record<string, number> = {};
    for (const row of snapshots) {
      const key = dayjs(row.date).format('YYYY-MM-DD');
      dayTotals[key] = (dayTotals[key] || 0) + row.value;
    }
    const byDay = Object.entries(dayTotals).map(([date, value]) => ({
      date,
      value,
    }));

    return { series, topPosts, byDay };
  }
}

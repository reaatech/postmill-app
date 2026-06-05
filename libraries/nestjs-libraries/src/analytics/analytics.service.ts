import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  METRIC_REGISTRY,
  normalizeMetric,
  isKnownMetric,
} from '@gitroom/nestjs-libraries/integrations/social/analytics.metrics';
import { Organization } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

export interface KpiItem {
  metric: string;
  label: string;
  format: string;
  total: number;
  previousTotal: number | null;
  percentageChange: number | null;
  sparkline: { date: string; value: number }[];
}

export interface ByChannelItem {
  integrationId: string;
  name: string;
  identifier: string;
  picture: string | null;
  kpis: Omit<KpiItem, 'sparkline'>[];
}

export interface MetricSeries {
  date: string;
  value: number;
  previousValue?: number;
}

export interface AnalyticsOverviewResponse {
  range: { from: string; to: string };
  kpis: KpiItem[];
  series: Record<string, MetricSeries[]>;
  byChannel: ByChannelItem[];
  breakdown: { byPlatform: { identifier: string; value: number }[] };
}

export interface AnalyticsMetricDetailResponse {
  metric: string;
  label: string;
  format: string;
  total: number;
  previousTotal: number | null;
  percentageChange: number | null;
  series: MetricSeries[];
  byChannel: {
    integrationId: string;
    name: string;
    identifier: string;
    picture: string | null;
    value: number;
    percentageChange: number | null;
    share: number;
  }[];
  topPosts: any[];
  movers: { up: any[]; down: any[] };
}

const FALLBACK_THRESHOLD = 0.5;

@Injectable()
export class AnalyticsService {
  private readonly _logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private integrationManager: IntegrationManager,
    private integrationService: IntegrationService,
    private postsService: PostsService
  ) {}

  private getMetricDef(metric: string) {
    return (
      METRIC_REGISTRY[metric] || {
        label: metric,
        format: 'count',
        kind: 'flow',
      }
    );
  }

  private computePercentageChange(
    current: number,
    previous: number | null,
    format: string
  ): number | null {
    if (previous === null || previous === 0) {
      return current === 0 ? 0 : null;
    }
    if (format === 'percent') {
      return current - previous;
    }
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private escapeCSVField(value: string): string {
    const str = String(value);
    if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  private async getSnapshots(
    orgId: string,
    integrationIds: string[],
    from: Date,
    to: Date
  ) {
    return this.prisma.analyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
    });
  }

  private async getPostSnapshots(
    orgId: string,
    integrationIds: string[],
    from: Date,
    to: Date
  ) {
    return this.prisma.postAnalyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
    });
  }

  private async getIntegrations(orgId: string, integrationIds: string[]) {
    return this.prisma.integration.findMany({
      where: {
        organizationId: orgId,
        id: { in: integrationIds },
        deletedAt: null,
        disabled: false,
      },
    });
  }

  private async checkCoverage(
    orgId: string,
    integrationIds: string[],
    from: Date,
    to: Date
  ): Promise<number> {
    if (!from || !to) return 0;
    const totalDays = dayjs(to).diff(dayjs(from), 'day') + 1;
    if (totalDays <= 0 || integrationIds.length === 0) return 0;

    const distinctDates = await this.prisma.analyticsSnapshot.findMany({
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        date: { gte: from, lte: to },
      },
      select: { date: true },
      distinct: ['date'],
    });

    if (distinctDates.length === 0) return 0;

    return distinctDates.length / totalDays;
  }

  private async fetchLiveFallback(
    org: Organization,
    integrationIds: string[],
    from: Date,
    to: Date
  ) {
    const providerData: Record<string, any[]> = {};

    for (const integrationId of integrationIds) {
      try {
        const data = await this.integrationService.checkAnalytics(
          org,
          integrationId,
          dayjs(to).diff(dayjs(from), 'day').toString()
        );
        if (Array.isArray(data)) {
          providerData[integrationId] = data;
        }
      } catch {
        continue;
      }
    }

    return providerData;
  }

  private convertLiveToSnapshots(
    providerData: Record<string, any[]>,
    orgId: string,
    integrationMap: Record<string, string>,
    from: Date,
    to: Date
  ) {
    const rows: {
      organizationId: string;
      integrationId: string;
      metric: string;
      value: number;
      date: Date;
    }[] = [];

    for (const [integrationId, data] of Object.entries(providerData)) {
      if (!data) continue;
      const providerIdentifier = integrationMap[integrationId] || '';

      for (const item of data) {
        const normalized =
          normalizeMetric(providerIdentifier, item.label) ||
          item.label.toLowerCase().replace(/\s+/g, '_');

        for (const dp of item.data || []) {
          const dpDate = dayjs(dp.date).toDate();
          if (dpDate >= from && dpDate <= to) {
            rows.push({
              organizationId: orgId,
              integrationId,
              metric: normalized,
              value: Number(dp.total) || 0,
              date: dpDate,
            });
          }
        }
      }
    }

    return rows;
  }

  private aggregateSnapshots(
    snapshots: {
      integrationId: string;
      metric: string;
      value: number;
      date: Date;
    }[],
    metric: string
  ) {
    const def = this.getMetricDef(metric);
    const grouped: Record<string, number[]> = {};

    for (const row of snapshots) {
      if (row.metric !== metric) continue;
      if (!grouped[row.integrationId]) {
        grouped[row.integrationId] = [];
      }
      grouped[row.integrationId].push(row.value);
    }

    if (def.kind === 'stock') {
      const integrationLatest = Object.values(grouped).map(
        (vals) => vals[vals.length - 1]
      );
      if (def.format === 'percent') {
        if (integrationLatest.length === 0) return 0;
        return (
          integrationLatest.reduce((a, b) => a + b, 0) /
          integrationLatest.length
        );
      }
      return integrationLatest.reduce((a, b) => a + b, 0);
    }

    const allValues = Object.values(grouped).flat();
    if (def.format === 'percent') {
      if (allValues.length === 0) return 0;
      return allValues.reduce((a, b) => a + b, 0) / allValues.length;
    }
    return allValues.reduce((a, b) => a + b, 0);
  }

  private buildFilledDayMap(
    snapshots: {
      date: Date;
      metric: string;
      value: number;
      integrationId: string;
    }[],
    metric: string,
    from: Date,
    to: Date,
    kind: string,
    dateOffset: number
  ): Record<string, number> {
    if (kind === 'stock') {
      const perInt: Record<string, Record<string, number>> = {};
      for (const row of snapshots) {
        if (row.metric !== metric) continue;
        const key = dayjs(row.date).format('YYYY-MM-DD');
        if (!perInt[row.integrationId]) perInt[row.integrationId] = {};
        perInt[row.integrationId][key] = row.value;
      }

      const result: Record<string, number> = {};
      const lastSeen: Record<string, number> = {};
      let cursor = dayjs(from);
      const end = dayjs(to);
      while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
        const rawKey = cursor.format('YYYY-MM-DD');
        const outKey = dateOffset
          ? cursor.add(dateOffset, 'day').format('YYYY-MM-DD')
          : rawKey;
        let total = 0;
        for (const intId of Object.keys(perInt)) {
          if (perInt[intId][rawKey] !== undefined) {
            lastSeen[intId] = perInt[intId][rawKey];
          }
          total += lastSeen[intId] || 0;
        }
        result[outKey] = total;
        cursor = cursor.add(1, 'day');
      }
      return result;
    }

    const dayMap: Record<string, number> = {};
    for (const row of snapshots) {
      if (row.metric !== metric) continue;
      const key = dayjs(row.date).format('YYYY-MM-DD');
      dayMap[key] = (dayMap[key] || 0) + row.value;
    }

    const result: Record<string, number> = {};
    let cursor = dayjs(from);
    const end = dayjs(to);
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const rawKey = cursor.format('YYYY-MM-DD');
      const outKey = dateOffset
        ? cursor.add(dateOffset, 'day').format('YYYY-MM-DD')
        : rawKey;
      result[outKey] = dayMap[rawKey] || 0;
      cursor = cursor.add(1, 'day');
    }
    return result;
  }

  private buildSparkline(
    snapshots: {
      date: Date;
      metric: string;
      value: number;
      integrationId: string;
    }[],
    metric: string,
    from: Date,
    to: Date
  ) {
    const def = this.getMetricDef(metric);
    const dayMap = this.buildFilledDayMap(
      snapshots,
      metric,
      from,
      to,
      def.kind,
      0
    );
    return Object.entries(dayMap).map(([date, value]) => ({ date, value }));
  }

  private buildSeries(
    snapshots: {
      date: Date;
      metric: string;
      value: number;
      integrationId: string;
    }[],
    from: Date,
    to: Date
  ): Record<string, MetricSeries[]> {
    const metrics = [...new Set(snapshots.map((s) => s.metric))].filter(
      isKnownMetric
    );

    const result: Record<string, MetricSeries[]> = {};
    for (const metric of metrics) {
      const def = this.getMetricDef(metric);
      const dayMap = this.buildFilledDayMap(
        snapshots,
        metric,
        from,
        to,
        def.kind,
        0
      );
      result[metric] = Object.entries(dayMap).map(([date, value]) => ({
        date,
        value,
      }));
    }
    return result;
  }

  private buildPrevMap(
    snapshots: {
      date: Date;
      metric: string;
      value: number;
      integrationId: string;
    }[],
    prevFrom: Date,
    prevTo: Date,
    dateOffset: number
  ): Record<string, Record<string, number>> {
    const metrics = [...new Set(snapshots.map((s) => s.metric))].filter(
      isKnownMetric
    );

    const result: Record<string, Record<string, number>> = {};
    for (const metric of metrics) {
      const def = this.getMetricDef(metric);
      result[metric] = this.buildFilledDayMap(
        snapshots,
        metric,
        prevFrom,
        prevTo,
        def.kind,
        dateOffset
      );
    }
    return result;
  }

  async getOverview(
    org: Organization,
    from: string,
    to: string,
    integrations: string[],
    compare: boolean
  ): Promise<AnalyticsOverviewResponse> {
    const fromDate = dayjs(from).startOf('day').toDate();
    const toDate = dayjs(to).endOf('day').toDate();

    const dbIntegrations = await this.getIntegrations(org.id, integrations);

    if (dbIntegrations.length === 0) {
      return {
        range: { from, to },
        kpis: [],
        series: {},
        byChannel: [],
        breakdown: { byPlatform: [] },
      };
    }

    const integrationIds = dbIntegrations.map((i) => i.id);

    const coverage = await this.checkCoverage(
      org.id,
      integrationIds,
      fromDate,
      toDate
    );
    let snapshots = await this.getSnapshots(
      org.id,
      integrationIds,
      fromDate,
      toDate
    );

    if (coverage < FALLBACK_THRESHOLD) {
      try {
        const live = await this.fetchLiveFallback(
          org,
          integrationIds,
          fromDate,
          toDate
        );
        const integrationMap = Object.fromEntries(
          dbIntegrations.map((i) => [i.id, i.providerIdentifier])
        );
        const liveRows = this.convertLiveToSnapshots(
          live,
          org.id,
          integrationMap,
          fromDate,
          toDate
        );
        if (liveRows.length > 0) {
          snapshots = liveRows.map((r) => ({
            ...r,
            id: '',
            createdAt: new Date(),
            integration: {} as any,
          }));
        }
      } catch {
        // fallback silently
      }
    }

    const metrics = [...new Set(snapshots.map((s) => s.metric))].filter(
      isKnownMetric
    );

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

      const prevCoverage = await this.checkCoverage(
        org.id,
        integrationIds,
        prevFromDate,
        prevToDate
      );

      previousSnapshots = await this.getSnapshots(
        org.id,
        integrationIds,
        prevFromDate,
        prevToDate
      );

      if (prevCoverage < FALLBACK_THRESHOLD) {
        try {
          const live = await this.fetchLiveFallback(
            org,
            integrationIds,
            prevFromDate,
            prevToDate
          );
          const integrationMap = Object.fromEntries(
            dbIntegrations.map((i) => [i.id, i.providerIdentifier])
          );
          const liveRows = this.convertLiveToSnapshots(
            live,
            org.id,
            integrationMap,
            prevFromDate,
            prevToDate
          );
          if (liveRows.length > 0) {
            previousSnapshots = liveRows.map((r) => ({
              ...r,
              id: '',
              createdAt: new Date(),
              integration: {} as any,
            }));
          }
        } catch {
          // fallback silently
        }
      }
    }

    const kpis: KpiItem[] = metrics.map((metric) => {
      const def = this.getMetricDef(metric);
      const total = this.aggregateSnapshots(snapshots, metric);
      const previousTotal = compare
        ? this.aggregateSnapshots(previousSnapshots, metric)
        : null;
      const percentageChange = this.computePercentageChange(
        total,
        previousTotal,
        def.format
      );

      return {
        metric,
        label: def.label,
        format: def.format,
        total,
        previousTotal,
        percentageChange,
        sparkline: this.buildSparkline(snapshots, metric, fromDate, toDate),
      };
    });

    const byChannel: ByChannelItem[] = await Promise.all(
      dbIntegrations.map(async (int) => {
        const channelSnapshots = snapshots.filter(
          (s) => s.integrationId === int.id
        );
        const channelKpis = metrics.map((metric) => {
          const def = this.getMetricDef(metric);
          const total = this.aggregateSnapshots(channelSnapshots, metric);
          const previousTotal = compare
            ? this.aggregateSnapshots(
                previousSnapshots.filter((s) => s.integrationId === int.id),
                metric
              )
            : null;
          const percentageChange = this.computePercentageChange(
            total,
            previousTotal,
            def.format
          );
          return {
            metric,
            label: def.label,
            format: def.format,
            total,
            previousTotal,
            percentageChange,
          };
        });

        return {
          integrationId: int.id,
          name: int.name,
          identifier: int.providerIdentifier,
          picture: int.picture,
          kpis: channelKpis,
        };
      })
    );

    const primaryMetric = metrics[0] || 'impressions';
    const platformBreakup: Record<string, number> = {};
    for (const int of dbIntegrations) {
      const intSnapshots = snapshots.filter((s) => s.integrationId === int.id);
      const total = this.aggregateSnapshots(intSnapshots, primaryMetric);
      if (total > 0) {
        platformBreakup[int.providerIdentifier] =
          (platformBreakup[int.providerIdentifier] || 0) + total;
      }
    }

    return {
      range: { from, to },
      kpis,
      series: (() => {
        const s = this.buildSeries(snapshots, fromDate, toDate);
        if (compare && previousSnapshots.length > 0) {
          const prevToDate = dayjs(fromDate)
            .subtract(1, 'day')
            .endOf('day')
            .toDate();
          const prevFromDate = dayjs(prevToDate)
            .subtract(windowSize, 'day')
            .startOf('day')
            .toDate();
          const dateOffset = windowSize + 1;
          const prevMap = this.buildPrevMap(
            previousSnapshots,
            prevFromDate,
            prevToDate,
            dateOffset
          );
          for (const [metric, points] of Object.entries(s)) {
            const prevMetric = prevMap[metric];
            if (!prevMetric) continue;
            for (const point of points) {
              point.previousValue = prevMetric[point.date] || 0;
            }
          }
        }
        return s;
      })(),
      byChannel,
      breakdown: {
        byPlatform: Object.entries(platformBreakup).map(
          ([identifier, value]) => ({
            identifier,
            value,
          })
        ),
      },
    };
  }

  async getChannel(
    org: Organization,
    integrationId: string,
    from: string,
    to: string,
    compare: boolean
  ) {
    const overview = await this.getOverview(
      org,
      from,
      to,
      [integrationId],
      compare
    );
    const channelInfo = await this.getIntegrations(org.id, [integrationId]);
    const integration = channelInfo[0];

    return {
      ...overview,
      integrationId,
      name: integration?.name || '',
      identifier: integration?.providerIdentifier || '',
      picture: integration?.picture || null,
    };
  }

  async getPosts(
    org: Organization,
    from: string,
    to: string,
    integrationIds: string[],
    sort?: string,
    dir?: string,
    page?: number,
    limit?: number
  ) {
    const fromDate = dayjs(from).startOf('day').toDate();
    const toDate = dayjs(to).endOf('day').toDate();

    const dbIntegrations = await this.getIntegrations(org.id, integrationIds);
    const ids = dbIntegrations.map((i) => i.id);

    const postSnapshots = await this.getPostSnapshots(
      org.id,
      ids,
      fromDate,
      toDate
    );

    const postMetrics: Record<string, Record<string, number>> = {};
    for (const snap of postSnapshots) {
      if (!postMetrics[snap.postId]) postMetrics[snap.postId] = {};
      postMetrics[snap.postId][snap.metric] =
        (postMetrics[snap.postId][snap.metric] || 0) + snap.value;
    }

    const p = page || 1;
    const l = limit || 25;

    const hasValidSort = sort && isKnownMetric(sort);

    const posts = await this.prisma.post.findMany({
      where: {
        organizationId: org.id,
        integrationId: { in: ids },
        publishDate: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
      include: { integration: true },
      orderBy: { publishDate: 'desc' },
      ...(hasValidSort ? {} : { skip: (p - 1) * l, take: l }),
    });

    let enriched = posts.map((p) => {
      const metrics = postMetrics[p.id] || {};
      return {
        postId: p.id,
        content: p.content?.substring(0, 200) || '',
        integration: {
          id: p.integration.id,
          name: p.integration.name,
          identifier: p.integration.providerIdentifier,
          picture: p.integration.picture,
        },
        publishedAt: p.publishDate.toISOString(),
        metrics,
      };
    });

    if (hasValidSort) {
      enriched.sort((a, b) => {
        const aVal = (a.metrics as any)[sort!] || 0;
        const bVal = (b.metrics as any)[sort!] || 0;
        return dir === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    const total = await this.prisma.post.count({
      where: {
        organizationId: org.id,
        integrationId: { in: ids },
        publishDate: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
    });

    const paginated = hasValidSort
      ? enriched.slice((p - 1) * l, p * l)
      : enriched;

    return { posts: paginated, total };
  }

  async getPostDetail(org: Organization, postId: string, date?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId: org.id, deletedAt: null },
      include: { integration: true },
    });

    if (!post) throw new NotFoundException('Post not found');

    const daysBack = Math.max(1, Math.min(365, parseInt(date || '30', 10) || 30));
    const toDate = dayjs().endOf('day').toDate();
    const fromDate = dayjs().subtract(daysBack, 'day').startOf('day').toDate();

    let snapshots = await this.prisma.postAnalyticsSnapshot.findMany({
      where: {
        postId,
        organizationId: org.id,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: 'asc' },
    });

    if (snapshots.length === 0) {
      try {
        const postAnalytics = await this.postsService.checkPostAnalytics(
          org.id,
          postId,
          daysBack
        );
        if (
          postAnalytics &&
          !('missing' in postAnalytics) &&
          Array.isArray(postAnalytics) &&
          postAnalytics.length > 0
        ) {
          const providerData = { [post.integrationId]: postAnalytics };
          const integrationMap = {
            [post.integrationId]: post.integration.providerIdentifier,
          };
          const liveRows = this.convertLiveToSnapshots(
            providerData,
            org.id,
            integrationMap,
            fromDate,
            toDate,
          );
          if (liveRows.length > 0) {
            snapshots = liveRows.map((r) => ({
              ...r,
              id: '',
              postId,
              createdAt: new Date(),
              integration: {} as any,
            }));
          }
        }
      } catch (err) {
        this._logger.error(`getPostDetail live-fallback failed for post ${postId}: ${(err as Error)?.message}`);
      }
    }

    const metrics: Record<string, MetricSeries[]> = {};
    for (const snap of snapshots) {
      if (!metrics[snap.metric]) metrics[snap.metric] = [];
      metrics[snap.metric].push({
        date: dayjs(snap.date).format('YYYY-MM-DD'),
        value: snap.value,
      });
    }

    return {
      postId: post.id,
      content: post.content,
      integration: {
        id: post.integration.id,
        name: post.integration.name,
        identifier: post.integration.providerIdentifier,
        picture: post.integration.picture,
      },
      publishedAt: post.publishDate.toISOString(),
      metrics,
    };
  }

  async getMetricDetail(
    org: Organization,
    metric: string,
    from: string,
    to: string,
    integrationIds: string[],
    compare: boolean
  ): Promise<AnalyticsMetricDetailResponse> {
    if (!isKnownMetric(metric)) {
      throw new NotFoundException(`Unknown metric: ${metric}`);
    }

    const def = this.getMetricDef(metric);
    const fromDate = dayjs(from).startOf('day').toDate();
    const toDate = dayjs(to).endOf('day').toDate();
    const dbIntegrations = await this.getIntegrations(org.id, integrationIds);
    const ids = dbIntegrations.map((i) => i.id);

    const coverage = await this.checkCoverage(org.id, ids, fromDate, toDate);

    let snapshots = await this.getSnapshots(org.id, ids, fromDate, toDate);

    if (coverage < FALLBACK_THRESHOLD) {
      try {
        const live = await this.fetchLiveFallback(org, ids, fromDate, toDate);
        const integrationMap = Object.fromEntries(
          dbIntegrations.map((i) => [i.id, i.providerIdentifier])
        );
        const liveRows = this.convertLiveToSnapshots(
          live,
          org.id,
          integrationMap,
          fromDate,
          toDate
        );
        if (liveRows.length > 0) {
          snapshots = liveRows.map((r) => ({
            ...r,
            id: '',
            createdAt: new Date(),
            integration: {} as any,
          }));
        }
      } catch {
        // fallback silently
      }
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

      const prevCoverage = await this.checkCoverage(
        org.id,
        ids,
        prevFromDate,
        prevToDate
      );

      previousSnapshots = (
        await this.getSnapshots(org.id, ids, prevFromDate, prevToDate)
      ).filter((s) => s.metric === metric);

      if (prevCoverage < FALLBACK_THRESHOLD) {
        try {
          const live = await this.fetchLiveFallback(
            org,
            ids,
            prevFromDate,
            prevToDate
          );
          const integrationMap = Object.fromEntries(
            dbIntegrations.map((i) => [i.id, i.providerIdentifier])
          );
          const liveRows = this.convertLiveToSnapshots(
            live,
            org.id,
            integrationMap,
            prevFromDate,
            prevToDate
          );
          if (liveRows.length > 0) {
            previousSnapshots = liveRows
              .filter((r: any) => r.metric === metric)
              .map((r: any) => ({
                ...r,
                id: '',
                createdAt: new Date(),
                integration: {} as any,
              }));
          }
        } catch {
          // fallback silently
        }
      }
    }

    const metricSnapshots = snapshots.filter((s) => s.metric === metric);

    const total = this.aggregateSnapshots(snapshots, metric);
    const previousTotal = compare
      ? this.aggregateSnapshots(previousSnapshots, metric)
      : null;
    const percentageChange = this.computePercentageChange(
      total,
      previousTotal,
      def.format
    );

    const currentMap = this.buildFilledDayMap(
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
      prevOffsetMap = this.buildFilledDayMap(
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
      channelTotals[int.id] = this.aggregateSnapshots(
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
        ? this.aggregateSnapshots(channelPrevSnapshots, metric)
        : null;
      return {
        integrationId: int.id,
        name: int.name,
        identifier: int.providerIdentifier,
        picture: int.picture,
        value: channelTotal,
        percentageChange: this.computePercentageChange(
          channelTotal,
          channelPrevious,
          def.format
        ),
        share: Math.round((channelTotal / totalValue) * 10000) / 100,
      };
    });

    let topPosts: any[] = [];
    try {
      const topPostsSnapshots =
        await this.prisma.postAnalyticsSnapshot.findMany({
          where: {
            organizationId: org.id,
            integrationId: { in: ids },
            metric,
            date: { gte: fromDate, lte: toDate },
          },
          include: {
            post: { select: { content: true, publishDate: true } },
          },
          orderBy: { value: 'desc' },
          take: 10,
        });
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
        const currentVal = this.aggregateSnapshots(
          metricSnapshots.filter((s) => s.integrationId === int.id),
          metric
        );
        const prevVal = this.aggregateSnapshots(
          previousSnapshots.filter((s) => s.integrationId === int.id),
          metric
        );
        const pctChange = this.computePercentageChange(
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
    integrationIds: string[]
  ) {
    if (!isKnownMetric(metric)) {
      throw new NotFoundException(`Unknown metric: ${metric}`);
    }

    const dateStart = dayjs(date).startOf('day').toDate();
    const dateEnd = dayjs(date).endOf('day').toDate();
    const dbIntegrations = await this.getIntegrations(org.id, integrationIds);
    const ids = dbIntegrations.map((i) => i.id);

    const [snapshots, postSnapshots] = await Promise.all([
      this.prisma.analyticsSnapshot.findMany({
        where: {
          organizationId: org.id,
          integrationId: { in: ids },
          metric,
          date: { gte: dateStart, lte: dateEnd },
        },
      }),
      this.prisma.postAnalyticsSnapshot.findMany({
        where: {
          organizationId: org.id,
          integrationId: { in: ids },
          metric,
          date: { gte: dateStart, lte: dateEnd },
        },
        include: { post: { select: { content: true, publishDate: true } } },
      }),
    ]);

    const totalValue = snapshots.reduce((a, b) => a + b.value, 0);

    const channelTotals: Record<string, number> = {};
    for (const snap of snapshots) {
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

    const def = this.getMetricDef(metric);
    const fromDate = dayjs(from).startOf('day').toDate();
    const toDate = dayjs(to).endOf('day').toDate();
    const dbIntegrations = await this.getIntegrations(org.id, [integrationId]);
    if (dbIntegrations.length === 0) {
      throw new NotFoundException('Integration not found');
    }

    const coverage = await this.checkCoverage(
      org.id,
      [integrationId],
      fromDate,
      toDate
    );

    let snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: {
        organizationId: org.id,
        integrationId,
        metric,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: 'asc' },
    });

    if (coverage < FALLBACK_THRESHOLD) {
      try {
        const live = await this.fetchLiveFallback(
          org,
          [integrationId],
          fromDate,
          toDate
        );
        const integrationMap = Object.fromEntries(
          dbIntegrations.map((i) => [i.id, i.providerIdentifier])
        );
        const liveRows = this.convertLiveToSnapshots(
          live,
          org.id,
          integrationMap,
          fromDate,
          toDate
        );
        if (liveRows.length > 0) {
          snapshots = liveRows
            .filter((r: any) => r.metric === metric)
            .map((r: any) => ({
              ...r,
              id: '',
              createdAt: new Date(),
              integration: {} as any,
            }));
        }
      } catch {
        // fallback silently
      }
    }

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

      const prevCoverage = await this.checkCoverage(
        org.id,
        [integrationId],
        prevFromDate,
        prevToDate
      );

      previousSnapshots = await this.prisma.analyticsSnapshot.findMany({
        where: {
          organizationId: org.id,
          integrationId,
          metric,
          date: { gte: prevFromDate, lte: prevToDate },
        },
        orderBy: { date: 'asc' },
      });

      if (prevCoverage < FALLBACK_THRESHOLD) {
        try {
          const live = await this.fetchLiveFallback(
            org,
            [integrationId],
            prevFromDate,
            prevToDate
          );
          const integrationMap = Object.fromEntries(
            dbIntegrations.map((i) => [i.id, i.providerIdentifier])
          );
          const liveRows = this.convertLiveToSnapshots(
            live,
            org.id,
            integrationMap,
            prevFromDate,
            prevToDate
          );
          if (liveRows.length > 0) {
            previousSnapshots = liveRows
              .filter((r: any) => r.metric === metric)
              .map((r: any) => ({
                ...r,
                id: '',
                createdAt: new Date(),
                integration: {} as any,
              }));
          }
        } catch {
          // fallback silently
        }
      }
    }

    const dailyMap = this.buildFilledDayMap(
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
      prevDailyMap = this.buildFilledDayMap(
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

    const postSnapshots = await this.prisma.postAnalyticsSnapshot.findMany({
      where: {
        organizationId: org.id,
        integrationId,
        metric,
        date: { gte: fromDate, lte: toDate },
      },
      include: { post: { select: { content: true, publishDate: true } } },
      orderBy: { value: 'desc' },
      take: 10,
    });

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

  async exportData(
    org: Organization,
    from: string,
    to: string,
    integrationIds: string[],
    format: string,
    compare: boolean = false
  ) {
    const overview = await this.getOverview(
      org,
      from,
      to,
      integrationIds,
      compare
    );
    const rows = overview.kpis.flatMap((kpi) =>
      kpi.sparkline.map((point) => ({
        metric: kpi.metric,
        label: kpi.label,
        format: kpi.format,
        total: kpi.total,
        percentageChange: kpi.percentageChange,
        date: point.date,
        value: point.value,
      }))
    );

    if (format === 'csv') {
      const header = 'metric,label,format,total,percentage_change,date,value\n';
      const lines = rows.map((r) =>
        [
          r.metric,
          r.label,
          r.format,
          String(r.total),
          r.percentageChange ?? '',
          r.date,
          String(r.value),
        ]
          .map((field) => this.escapeCSVField(String(field)))
          .join(',')
      );
      return { data: header + lines.join('\n'), contentType: 'text/csv' };
    }

    return {
      data: JSON.stringify(rows, null, 2),
      contentType: 'application/json',
    };
  }
}

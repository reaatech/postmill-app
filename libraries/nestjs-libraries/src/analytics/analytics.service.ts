import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics.repository';
import { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import { Organization } from '@prisma/client';
import {
  AnalyticsMetricDetailResponse,
  AnalyticsOverviewResponse,
  SnapshotLike,
} from './analytics.types';
import {
  aggregateSnapshots,
  buildFilledDayMap,
  buildPrevMap,
  buildSeries,
  buildSparkline,
  computePercentageChange,
  getMetricDef,
} from './analytics-aggregation';
import { AnalyticsLiveFallbackService } from './analytics-live-fallback';
import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsDetailService } from './analytics-detail.service';
import { AnalyticsInsightsService } from './analytics-insights.service';
import { AnalyticsExportService } from './analytics-export.service';

// Re-export the shared shapes from their extracted home so existing callers
// (controllers, chat tools) that import them from this module keep working.
export {
  KpiItem,
  ByChannelItem,
  MetricSeries,
  AnalyticsOverviewResponse,
  AnalyticsMetricDetailResponse,
  SnapshotLike,
  BestTimeEntry,
} from './analytics.types';

// AnalyticsService is the injected FACADE for the v2 analytics engine. The
// compute is split across sibling services (5.3) — overview/channel/posts,
// metric/day/channel drill-downs, insights, export, and live-fallback — plus a
// pure aggregation module. This class stays the single injection point that
// controllers, campaigns.controller, and the chat analytics tools use; it only
// delegates. Behaviour and public method signatures are unchanged.
@Injectable()
export class AnalyticsService {
  constructor(
    private analyticsRepository: AnalyticsRepository,
    private _orgShortLinkSettingsService: OrgShortLinkSettingsService,
    private overviewService: AnalyticsOverviewService,
    private detailService: AnalyticsDetailService,
    private insightsService: AnalyticsInsightsService,
    private exportService: AnalyticsExportService,
    private liveFallbackService: AnalyticsLiveFallbackService,
  ) {}

  // ── Pure aggregation helpers (retained as thin private delegators so the
  //    spec's `(service as any).<helper>(...)` reaches remain valid) ──

  private getMetricDef(metric: string) {
    return getMetricDef(metric);
  }

  private computePercentageChange(
    current: number,
    previous: number | null,
    format: string
  ): number | null {
    return computePercentageChange(current, previous, format);
  }

  private aggregateSnapshots(
    snapshots: { integrationId: string; metric: string; value: number; date: Date }[],
    metric: string
  ) {
    return aggregateSnapshots(snapshots, metric);
  }

  private buildFilledDayMap(
    snapshots: { date: Date; metric: string; value: number; integrationId: string }[],
    metric: string,
    from: Date,
    to: Date,
    kind: string,
    dateOffset: number
  ): Record<string, number> {
    return buildFilledDayMap(snapshots, metric, from, to, kind, dateOffset);
  }

  private buildSparkline(
    snapshots: { date: Date; metric: string; value: number; integrationId: string }[],
    metric: string,
    from: Date,
    to: Date
  ) {
    return buildSparkline(snapshots, metric, from, to);
  }

  private buildSeries(
    snapshots: { date: Date; metric: string; value: number; integrationId: string }[],
    from: Date,
    to: Date
  ) {
    return buildSeries(snapshots, from, to);
  }

  private buildPrevMap(
    snapshots: { date: Date; metric: string; value: number; integrationId: string }[],
    prevFrom: Date,
    prevTo: Date,
    dateOffset: number
  ): Record<string, Record<string, number>> {
    return buildPrevMap(snapshots, prevFrom, prevTo, dateOffset);
  }

  private escapeCSVField(value: string): string {
    return this.exportService.escapeCSVField(value);
  }

  // ── Live-fallback delegators (retained for the spec's `(service as any)` reaches) ──

  private async checkCoverage(
    orgId: string,
    dbIntegrations: { id: string; providerIdentifier: string; providerVersion?: string | null }[],
    from: Date,
    to: Date
  ): Promise<number> {
    return this.liveFallbackService.checkCoverage(orgId, dbIntegrations, from, to);
  }

  private async fetchLiveFallback(
    org: Organization,
    integrationIds: string[],
    from: Date,
    to: Date
  ) {
    return this.liveFallbackService.fetchLiveFallback(org, integrationIds, from, to);
  }

  private convertLiveToSnapshots(
    providerData: Record<string, any[]>,
    orgId: string,
    integrationMap: Record<string, string>,
    from: Date,
    to: Date
  ) {
    return this.liveFallbackService.convertLiveToSnapshots(
      providerData,
      orgId,
      integrationMap,
      from,
      to
    );
  }

  // ── Overview / channel / posts / post-detail ──

  async getOverview(
    org: Organization,
    from: string,
    to: string,
    integrations: string[],
    compare: boolean,
    opts: { campaignIds?: string[] } = {}
  ): Promise<AnalyticsOverviewResponse> {
    return this.overviewService.getOverview(org, from, to, integrations, compare, opts);
  }

  async getChannel(
    org: Organization,
    integrationId: string,
    from: string,
    to: string,
    compare: boolean
  ) {
    return this.overviewService.getChannel(org, integrationId, from, to, compare);
  }

  async getPosts(
    org: Organization,
    from: string,
    to: string,
    integrationIds: string[],
    sort?: string,
    dir?: string,
    page?: number,
    limit?: number,
    opts: { campaignIds?: string[] } = {}
  ) {
    return this.overviewService.getPosts(
      org, from, to, integrationIds, sort, dir, page, limit, opts
    );
  }

  async getPostDetail(org: Organization, postId: string, date?: string) {
    return this.overviewService.getPostDetail(org, postId, date);
  }

  // ── Metric / day / channel drill-downs ──

  async getMetricDetail(
    org: Organization,
    metric: string,
    from: string,
    to: string,
    integrationIds: string[],
    compare: boolean,
    opts: { campaignIds?: string[] } = {}
  ): Promise<AnalyticsMetricDetailResponse> {
    return this.detailService.getMetricDetail(
      org, metric, from, to, integrationIds, compare, opts
    );
  }

  async getDayDetail(
    org: Organization,
    date: string,
    metric: string,
    integrationIds: string[],
    opts: { campaignIds?: string[] } = {}
  ) {
    return this.detailService.getDayDetail(org, date, metric, integrationIds, opts);
  }

  async getChannelMetric(
    org: Organization,
    integrationId: string,
    metric: string,
    from: string,
    to: string,
    compare: boolean
  ) {
    return this.detailService.getChannelMetric(
      org, integrationId, metric, from, to, compare
    );
  }

  // ── Export ──

  async exportData(
    org: Organization,
    from: string,
    to: string,
    integrationIds: string[],
    format: string,
    compare: boolean = false,
    opts: { campaignIds?: string[] } = {}
  ) {
    const overview = await this.overviewService.getOverview(
      org,
      from,
      to,
      integrationIds,
      compare,
      opts
    );
    return this.exportService.toExport(overview, format);
  }

  // ── Insights (best-time + recommendations) ──

  async getBestTimeAnalyticsContext(orgId: string) {
    return this.insightsService.getBestTimeAnalyticsContext(orgId);
  }

  async getRecommendations(org: Organization) {
    return this.insightsService.getRecommendations(org);
  }

  async getBestTimeData(orgId: string, integrationIds?: string[], tz?: string) {
    return this.insightsService.getBestTimeData(orgId, integrationIds, tz);
  }

  // ── 6.3: competitor overlay — own-channel follower series ──
  async getFollowerSeries(orgId: string, from: string, to: string) {
    return this.insightsService.getFollowerSeries(orgId, from, to);
  }

  // ── 6.6: data-health panel ──
  async getDataHealth(org: Organization) {
    return this.overviewService.getDataHealth(org);
  }

  // ── 6.7: on-demand channel refresh ──
  async refreshChannel(org: Organization, integrationId: string) {
    return this.overviewService.refreshChannel(org, integrationId);
  }

  // ── 7.4: content-attribute intelligence ──
  async getContentInsights(org: Organization) {
    return this.insightsService.getContentInsights(org);
  }

  // ── 7.5: LLM-narrated summary (no-provider rule enforced in the service) ──
  async narrate(org: Organization, from: string, to: string) {
    return this.insightsService.narrate(org, from, to);
  }

  // ── Short-link pass-throughs ──

  async getLinksForOrg(orgId: string) {
    return this._orgShortLinkSettingsService.getLinksForOrg(orgId);
  }

  async getAggregatedClicks(orgId: string, from: Date, to: Date) {
    return this._orgShortLinkSettingsService.getAggregatedClicks(orgId, from, to);
  }

  // ── Anomaly alerts (4.8) — thin pass-through to the ledger ──

  async listAnomalies(
    orgId: string,
    opts: { limit?: number; includeDismissed?: boolean } = {},
  ) {
    return this.analyticsRepository.listAnomalies(orgId, opts);
  }

  async dismissAnomaly(orgId: string, id: string): Promise<{ success: boolean }> {
    const res = await this.analyticsRepository.dismissAnomaly(orgId, id);
    // updateMany over (id, orgId) — 0 rows means the anomaly isn't this org's.
    if (res.count === 0) {
      throw new NotFoundException('Anomaly not found');
    }
    return { success: true };
  }

  // ── 7.3: user-defined alert rules — thin org-scoped pass-throughs ──

  listAlertRules(orgId: string) {
    return this.analyticsRepository.listAlertRules(orgId);
  }

  // Reject a provided integrationId that isn't one of the org's live channels
  // (a typo'd id would otherwise persist a rule that silently never fires).
  private async assertIntegrationInOrg(orgId: string, integrationId?: string) {
    if (!integrationId) return;
    const found = await this.analyticsRepository.getIntegrations(orgId, [
      integrationId,
    ]);
    if (!found.length) {
      throw new BadRequestException('integrationId is not a channel of this organization');
    }
  }

  async createAlertRule(
    orgId: string,
    data: {
      integrationId?: string;
      metric: string;
      comparator: string;
      threshold: number;
      direction?: string;
      enabled?: boolean;
    },
  ) {
    await this.assertIntegrationInOrg(orgId, data.integrationId);
    return this.analyticsRepository.createAlertRule({
      organizationId: orgId,
      integrationId: data.integrationId ?? null,
      metric: data.metric,
      comparator: data.comparator,
      threshold: data.threshold,
      direction: data.direction,
      enabled: data.enabled,
    });
  }

  async updateAlertRule(
    orgId: string,
    id: string,
    data: {
      integrationId?: string;
      metric?: string;
      comparator?: string;
      threshold?: number;
      direction?: string;
      enabled?: boolean;
    },
  ) {
    await this.assertIntegrationInOrg(orgId, data.integrationId);
    const res = await this.analyticsRepository.updateAlertRule(orgId, id, data);
    // updateMany over (id, orgId) — 0 rows means the rule isn't this org's.
    if (res.count === 0) {
      throw new NotFoundException('Alert rule not found');
    }
    return this.analyticsRepository.getAlertRule(orgId, id);
  }

  async deleteAlertRule(orgId: string, id: string): Promise<{ success: boolean }> {
    const res = await this.analyticsRepository.deleteAlertRule(orgId, id);
    return { success: res.count > 0 };
  }
}

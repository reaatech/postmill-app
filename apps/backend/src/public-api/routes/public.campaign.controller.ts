import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import dayjs from 'dayjs';
import {
  CampaignReportService,
  CampaignReportAnalytics,
} from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaign-report.service';
import { AnalyticsService } from '@gitroom/nestjs-libraries/analytics/analytics.service';
import type { Organization } from '@prisma/client';

@Controller('/public/campaign-report')
export class PublicCampaignController {
  constructor(
    private _reportService: CampaignReportService,
    private _analyticsService: AnalyticsService,
  ) {}

  @Get('/:token')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getSharedReport(@Param('token') token: string) {
    // Resolve the share token first so we can compute campaign analytics via
    // controller composition (AnalyticsService is not injected into the report
    // service). Unknown/disabled token → 404 before any analytics work.
    const resolved = await this._reportService.resolveShareToken(token);
    if (!resolved) {
      throw new NotFoundException();
    }

    let analytics: CampaignReportAnalytics | undefined;
    try {
      const to = dayjs().format('YYYY-MM-DD');
      const from = dayjs().subtract(90, 'day').format('YYYY-MM-DD');
      const overview = await this._analyticsService.getOverview(
        { id: resolved.organizationId } as Organization,
        from,
        to,
        [],
        false,
        { campaignIds: [resolved.id] },
      );
      analytics = { series: overview.series, byChannel: overview.byChannel, window: { from, to } };
    } catch {
      analytics = undefined;
    }

    try {
      return await this._reportService.toPublicJson(token, analytics);
    } catch {
      throw new NotFoundException();
    }
  }
}

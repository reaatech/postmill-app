import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from '@gitroom/nestjs-libraries/analytics/analytics.service';
import { Response } from 'express';
import dayjs from 'dayjs';

export function validateDateRange(from: string, to: string) {
  if (!from || !to) {
    throw new BadRequestException('from and to query parameters are required');
  }
  if (!dayjs(from).isValid() || !dayjs(to).isValid()) {
    throw new BadRequestException('from and to must be valid dates');
  }
}

export function parseIntegrations(integrations?: string): string[] {
  if (!integrations) return [];
  return integrations.split(',').filter(Boolean);
}

export function parsePage(page?: string): number {
  const parsed = parseInt(page || '1', 10);
  if (isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}

export function parseLimit(limit?: string): number {
  const parsed = parseInt(limit || '25', 10);
  if (isNaN(parsed) || parsed < 1) return 25;
  return parsed;
}

export function parseCompare(compare?: string): boolean {
  return compare?.toLowerCase() === 'true';
}

export function parseFormat(format?: string): 'csv' | 'json' {
  if (!format || format === 'json') return 'json';
  if (format === 'csv') return 'csv';
  throw new BadRequestException('format must be csv or json');
}

@ApiTags('Analytics V2')
@Controller('/analytics/v2')
export class AnalyticsV2Controller {
  constructor(private _analyticsService: AnalyticsService) {}

  @Get('/overview')
  async getOverview(
    @GetOrgFromRequest() org: Organization,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('integrations') integrations: string,
    @Query('compare') compare: string
  ) {
    validateDateRange(from, to);
    return this._analyticsService.getOverview(
      org,
      from,
      to,
      parseIntegrations(integrations),
      parseCompare(compare)
    );
  }

  @Get('/channel/:integrationId')
  async getChannel(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('compare') compare: string
  ) {
    validateDateRange(from, to);
    return this._analyticsService.getChannel(
      org,
      integrationId,
      from,
      to,
      parseCompare(compare)
    );
  }

  @Get('/posts')
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('integrations') integrations: string,
    @Query('sort') sort: string,
    @Query('dir') dir: string,
    @Query('page') page: string,
    @Query('limit') limit: string
  ) {
    validateDateRange(from, to);
    return this._analyticsService.getPosts(
      org,
      from,
      to,
      parseIntegrations(integrations),
      sort,
      dir || 'desc',
      parsePage(page),
      parseLimit(limit)
    );
  }

  @Get('/post/:postId')
  async getPostDetail(
    @GetOrgFromRequest() org: Organization,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query('date') date?: string
  ) {
    return this._analyticsService.getPostDetail(org, postId, date);
  }

  @Get('/metric/:metric')
  async getMetric(
    @GetOrgFromRequest() org: Organization,
    @Param('metric') metric: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('integrations') integrations: string,
    @Query('compare') compare: string
  ) {
    validateDateRange(from, to);
    return this._analyticsService.getMetricDetail(
      org,
      metric,
      from,
      to,
      parseIntegrations(integrations),
      parseCompare(compare)
    );
  }

  @Get('/day')
  async getDay(
    @GetOrgFromRequest() org: Organization,
    @Query('date') date: string,
    @Query('metric') metric: string,
    @Query('integrations') integrations: string
  ) {
    return this._analyticsService.getDayDetail(
      org,
      date,
      metric,
      parseIntegrations(integrations)
    );
  }

  @Get('/channel/:integrationId/metric/:metric')
  async getChannelMetric(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Param('metric') metric: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('compare') compare: string
  ) {
    validateDateRange(from, to);
    return this._analyticsService.getChannelMetric(
      org,
      integrationId,
      metric,
      from,
      to,
      parseCompare(compare)
    );
  }

  @Get('/export')
  async exportData(
    @GetOrgFromRequest() org: Organization,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('integrations') integrations: string,
    @Query('format') format: string,
    @Query('compare') compare: string,
    @Res({ passthrough: true }) res: Response
  ) {
    validateDateRange(from, to);
    const parsedFormat = parseFormat(format);

    const result = await this._analyticsService.exportData(
      org,
      from,
      to,
      parseIntegrations(integrations),
      parsedFormat,
      parseCompare(compare)
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="analytics-export.${
        parsedFormat === 'csv' ? 'csv' : 'json'
      }"`
    );
    return result.data;
  }
}

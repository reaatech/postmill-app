import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { AnalyticsService, BestTimeEntry } from '@gitroom/nestjs-libraries/analytics/analytics.service';
import {
  AnalyticsDateRangeDto,
  AnalyticsPostsQueryDto,
  AnalyticsExportQueryDto,
} from '@gitroom/nestjs-libraries/dtos/analytics/analytics.query.dto';
import { Response } from 'express';
import dayjs from 'dayjs';
import { WatchlistService } from '@gitroom/nestjs-libraries/database/prisma/watchlist/watchlist.service';
import { IsString, IsOptional, IsIn, MinLength, MaxLength } from 'class-validator';

export function validateDateRange(from: string, to: string) {
  if (!from || !to) {
    throw new BadRequestException('from and to query parameters are required');
  }
  if (!dayjs(from).isValid() || !dayjs(to).isValid()) {
    throw new BadRequestException('from and to must be valid dates');
  }
}

export function validateToGteFrom(from: string, to: string) {
  if (dayjs(to).isBefore(dayjs(from))) {
    throw new BadRequestException('to must be greater than or equal to from');
  }
}

export function parseIntegrations(integrations?: string): string[] {
  if (!integrations) return [];
  return integrations.split(',').filter(Boolean);
}

export function parsePage(page?: number): number {
  return (page || 1);
}

export function parseLimit(limit?: number): number {
  const l = (limit || 20);
  return Math.min(l, 100);
}

export function parseCompare(compare?: string): boolean {
  return compare?.toLowerCase() === 'true';
}

export interface BestTimeResponse {
  heatmap: BestTimeEntry[];
  bestSlots: { day: number; hour: number; avgEngagement: number }[];
}

class AddWatchlistDto {
  @IsIn(['twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'tiktok'])
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  handle!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

@ApiTags('Analytics V2')
@Controller('/analytics/v2')
export class AnalyticsV2Controller {
  constructor(
    private _analyticsService: AnalyticsService,
    private _watchlistService: WatchlistService,
  ) {}

  @Get('/overview')
  async getOverview(
    @GetOrgFromRequest() org: Organization,
    @Query() query: AnalyticsDateRangeDto
  ) {
    validateDateRange(query.from, query.to);
    validateToGteFrom(query.from, query.to);
    return this._analyticsService.getOverview(
      org,
      query.from,
      query.to,
      parseIntegrations(query.integrations),
      parseCompare(query.compare)
    );
  }

  @Get('/channel/:integrationId')
  async getChannel(
    @GetOrgFromRequest() org: Organization,
    @Param('integrationId') integrationId: string,
    @Query() query: AnalyticsDateRangeDto
  ) {
    validateDateRange(query.from, query.to);
    validateToGteFrom(query.from, query.to);
    return this._analyticsService.getChannel(
      org,
      integrationId,
      query.from,
      query.to,
      parseCompare(query.compare)
    );
  }

  @Get('/posts')
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @Query() query: AnalyticsPostsQueryDto
  ) {
    validateDateRange(query.from, query.to);
    validateToGteFrom(query.from, query.to);
    return this._analyticsService.getPosts(
      org,
      query.from,
      query.to,
      parseIntegrations(query.integrations),
      query.sort,
      query.dir || 'desc',
      parsePage(query.page),
      parseLimit(query.limit)
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
    @Query() query: AnalyticsDateRangeDto
  ) {
    validateDateRange(query.from, query.to);
    validateToGteFrom(query.from, query.to);
    return this._analyticsService.getMetricDetail(
      org,
      metric,
      query.from,
      query.to,
      parseIntegrations(query.integrations),
      parseCompare(query.compare)
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
    @Query() query: AnalyticsDateRangeDto
  ) {
    validateDateRange(query.from, query.to);
    validateToGteFrom(query.from, query.to);
    return this._analyticsService.getChannelMetric(
      org,
      integrationId,
      metric,
      query.from,
      query.to,
      parseCompare(query.compare)
    );
  }

  @Get('/best-time')
  async getBestTime(
    @GetOrgFromRequest() org: Organization,
    @Query('integrations') integrations: string,
  ) {
    return this._analyticsService.getBestTimeData(
      org.id,
      parseIntegrations(integrations),
    );
  }

  @Get('/recommendations')
  async getRecommendations(
    @GetOrgFromRequest() org: Organization,
  ) {
    return this._analyticsService.getRecommendations(org);
  }

  @Get('/export')
  async exportData(
    @GetOrgFromRequest() org: Organization,
    @Query() query: AnalyticsExportQueryDto,
    @Res({ passthrough: true }) res: Response
  ) {
    validateDateRange(query.from, query.to);
    validateToGteFrom(query.from, query.to);
    if (query.format && !['csv', 'json'].includes(query.format)) {
      throw new BadRequestException('format must be csv or json');
    }
    const parsedFormat = query.format === 'csv' ? 'csv' : 'json';

    const result = await this._analyticsService.exportData(
      org,
      query.from,
      query.to,
      parseIntegrations(query.integrations),
      parsedFormat,
      parseCompare(query.compare)
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

  // ── Watchlist CRUD ──

  @Get('/watchlist')
  async listWatchlist(@GetOrgFromRequest() org: Organization) {
    return this._watchlistService.list(org.id);
  }

  @Post('/watchlist')
  async addWatchlistEntry(
    @GetOrgFromRequest() org: Organization,
    @Body() body: AddWatchlistDto,
  ) {
    return this._watchlistService.add({
      organizationId: org.id,
      provider: body.provider,
      handle: body.handle,
      displayName: body.displayName,
    });
  }

  @Put('/watchlist/:id')
  async updateWatchlistEntry(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { displayName?: string; enabled?: boolean },
  ) {
    return this._watchlistService.update(id, org.id, body);
  }

  @Delete('/watchlist/:id')
  async deleteWatchlistEntry(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    await this._watchlistService.remove(id, org.id);
    return { success: true };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import { Response } from 'express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { ApiTags } from '@nestjs/swagger';
import { CampaignsService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.service';
import { CampaignTagService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaign-item.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { CampaignReportService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaign-report.service';
import { CampaignItemDto } from '@gitroom/nestjs-libraries/dtos/campaigns/campaign-item.dto';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { CopyCampaignDto } from '@gitroom/nestjs-libraries/dtos/campaigns/copy-campaign.dto';
import { PromoteDraftsDto } from '@gitroom/nestjs-libraries/dtos/campaigns/promote-drafts.dto';
import { CampaignGoalDto } from '@gitroom/nestjs-libraries/dtos/campaigns/campaign-goals.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { IsString, IsOptional, IsBoolean, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';

class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  utmEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignGoalDto)
  goals?: CampaignGoalDto[];
}

class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsBoolean()
  utmEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignGoalDto)
  goals?: CampaignGoalDto[];
}

// J2 — hard cap for the campaigns list (default page size == max).
const CAMPAIGNS_MAX_LIMIT = 100;

@ApiTags('Campaigns')
@Controller('/campaigns')
export class CampaignsController {
  constructor(
    private _campaignsService: CampaignsService,
    private _campaignTagService: CampaignTagService,
    private _postsService: PostsService,
    private _reportService: CampaignReportService,
  ) {}

  private _parseGoals(goals?: CampaignGoalDto[]): any {
    if (!goals) return undefined;
    return goals.map((g) => ({ metric: g.metric, target: Number(g.target) }));
  }

  // Reverse lookup for the per-entity Campaign selector. Declared before `/:id`
  // routes (different segment count, but keep it explicit).
  @Get('/for/:entityType/:entityId')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async campaignsForItem(
    @GetOrgFromRequest() org: Organization,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string
  ) {
    return this._campaignTagService.listCampaignsForItem(org.id, entityType, entityId);
  }

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async list(
    @GetOrgFromRequest() org: Organization,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    // J2 — bound the previously-unbounded campaigns list. Back-compat: the
    // response is still a plain array; absent paging params we cap at the hard
    // max rather than returning everything.
    const all = await this._campaignsService.list(org.id);
    const offset = Math.max(0, parseInt(cursor ?? '0', 10) || 0);
    const size = Math.min(
      CAMPAIGNS_MAX_LIMIT,
      Math.max(1, parseInt(limit ?? '', 10) || CAMPAIGNS_MAX_LIMIT),
    );
    return all.slice(offset, offset + size);
  }

  @Get('/:id')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async get(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._campaignsService.get(id, org.id);
  }

  @Post('/')
  @RequirePermission('posts', 'create')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async create(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateCampaignDto,
  ) {
    if (body.startDate && body.endDate && new Date(body.endDate) <= new Date(body.startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return this._campaignsService.create({
      organizationId: org.id,
      name: body.name,
      color: body.color,
      description: body.description,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      utmEnabled: body.utmEnabled,
      goals: this._parseGoals(body.goals),
      createdById: user?.id,
    });
  }

  @Put('/:id')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async update(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateCampaignDto,
  ) {
    if (body.startDate && body.endDate && new Date(body.endDate) <= new Date(body.startDate)) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return this._campaignsService.update(id, org.id, {
      name: body.name,
      color: body.color,
      description: body.description,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      archived: body.archived,
      utmEnabled: body.utmEnabled,
      goals: this._parseGoals(body.goals),
    });
  }

  @Get('/:id/engagement')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async getEngagement(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._campaignsService.getEngagement(id, org.id);
  }

  @Get('/:id/dashboard')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async getDashboard(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._campaignsService.getDashboard(id, org.id);
  }

  @Get('/:id/report')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async getReport(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Query('format') format: 'json' | 'csv' | 'pdf' = 'json',
    @Res({ passthrough: true }) res: Response,
  ) {
    if (format === 'csv') {
      const csv = await this._reportService.toCsv(id, org.id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.csv"`);
      return csv;
    }
    if (format === 'pdf') {
      const pdf = await this._reportService.toPdf(id, org.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.pdf"`);
      return pdf;
    }
    return this._reportService.toJson(id, org.id);
  }

  @Post('/:id/copy')
  @RequirePermission('posts', 'create')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async copy(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: CopyCampaignDto,
  ) {
    return this._campaignsService.copy(id, org.id, user?.id, body);
  }

  @Get('/:id/drafts')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async getDrafts(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._postsService.getCampaignDrafts(org.id, id);
  }

  @Post('/:id/drafts')
  @RequirePermission('posts', 'create')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createDraft(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: CreatePostDto,
  ) {
    return this._postsService.validateAndCreatePost(
      org.id,
      { ...body, type: 'draft', campaignId: id } as CreatePostDto,
      'WEB',
    );
  }

  @Post('/:id/drafts/:postId/approve')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async approveDraft(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('postId') postId: string,
  ) {
    return this._postsService.approveDraft(org.id, postId, user.id);
  }

  @Post('/:id/drafts/:postId/reject')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async rejectDraft(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('postId') postId: string,
  ) {
    return this._postsService.rejectDraft(org.id, postId, user.id);
  }

  @Post('/:id/promote')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async promoteDrafts(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: PromoteDraftsDto,
  ) {
    const result = await this._postsService.promoteDrafts(org.id, id, body.postIds, user.id);
    return result;
  }

  @Post('/:id/share')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async enableShare(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    return this._campaignsService.mintShareToken(id, org.id);
  }

  @Delete('/:id/share')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async disableShare(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    await this._campaignsService.disableShare(id, org.id);
    return { success: true };
  }

  @Delete('/:id')
  @RequirePermission('posts', 'delete')
  @CheckPolicies([AuthorizationActions.Delete, Sections.POSTS_PER_MONTH])
  async delete(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
  ) {
    await this._campaignsService.remove(id, org.id);
    return { success: true };
  }

  // ── Tagging: associate any of the 9 entity types with a campaign ──
  @Get('/:id/items')
  @CheckPolicies([AuthorizationActions.Read, Sections.POSTS_PER_MONTH])
  async listItems(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._campaignTagService.listItems(org.id, id);
  }

  @Post('/:id/items')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async tagItem(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: CampaignItemDto
  ) {
    return this._campaignTagService.tagItem(org.id, id, user?.id, body.entityType, body.entityId);
  }

  @Delete('/:id/items/:entityType/:entityId')
  @RequirePermission('posts', 'update')
  @CheckPolicies([AuthorizationActions.Update, Sections.POSTS_PER_MONTH])
  async untagItem(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string
  ) {
    return this._campaignTagService.untagItem(org.id, id, user?.id, entityType, entityId);
  }
}

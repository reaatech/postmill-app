import {
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import {
  DashboardService,
  DashboardSummaryResponse,
  AttentionKind,
  PlanUsageSnapshot,
} from '@gitroom/nestjs-libraries/dashboard/dashboard.service';
import { DashboardBriefService } from '@gitroom/nestjs-libraries/dashboard/dashboard-brief.service';
import { Organization, User } from '@prisma/client';
import { RequirePermission } from '@gitroom/backend/services/auth/rbac/require-permission.decorator';
import { PermissionsService } from '@gitroom/backend/services/auth/permissions/permissions.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { RolesService } from '@gitroom/nestjs-libraries/database/prisma/roles/roles.service';
import dayjs from 'dayjs';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';

const KIND_PERMISSION_MAP: Record<AttentionKind, string> = {
  'failed-posts': 'posts:read',
  'channel-health': 'posts:read',
  'pending-approvals': 'posts:update',
  'unread-comments': 'comments:read',
  'schedule-gaps': 'posts:read',
  budget: 'billing:read',
  'failed-media-jobs': 'media:read',
  anomalies: 'analytics:read',
};

@Controller('/dashboard')
export class DashboardController {
  constructor(
    private _dashboardService: DashboardService,
    private _permissionsService: PermissionsService,
    private _postsService: PostsService,
    private _integrationService: IntegrationService,
    private _organizationService: OrganizationService,
    private _rolesService: RolesService,
    private _briefService: DashboardBriefService,
  ) {}

  @Get('/summary')
  async getSummary(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ): Promise<DashboardSummaryResponse> {
    if (!org?.id) {
      throw new UnauthorizedException();
    }

    return this._dashboardService.getSummary(org, user);
  }

  @Get('/schedule')
  @RequirePermission('posts', 'read')
  async getSchedule(
    @GetOrgFromRequest() org: Organization,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
    @Query('timezone') timezone?: string,
  ) {
    if (!org?.id) {
      throw new UnauthorizedException();
    }

    return this._dashboardService.getSchedule(
      org.id,
      Math.min(Math.max(days, 1), 30),
      timezone || 'UTC',
    );
  }

  @Get('/campaigns')
  @RequirePermission('posts', 'read')
  async getCampaigns(
    @GetOrgFromRequest() org: Organization,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
  ) {
    if (!org?.id) {
      throw new UnauthorizedException();
    }

    return this._dashboardService.getCampaignSummaries(
      org.id,
      Math.min(Math.max(limit, 1), 50),
    );
  }

  @Get('/media-jobs')
  @RequirePermission('media', 'read')
  async getMediaJobs(@GetOrgFromRequest() org: Organization) {
    if (!org?.id) {
      throw new UnauthorizedException();
    }

    return this._dashboardService.getMediaJobs(org.id);
  }

  @Get('/usage')
  @RequirePermission('billing', 'read')
  async getUsage(@GetOrgFromRequest() org: Organization) {
    if (!org?.id) {
      throw new UnauthorizedException();
    }

    return this._buildUsage(org);
  }

  @Get('/attention')
  async getAttention(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    if (!org?.id || !user?.id) {
      throw new UnauthorizedException();
    }

    const effective = await this._rolesService.getEffectivePermissions(
      org.id,
      user.id,
    );
    const permissions = new Set(effective?.permissions ?? []);
    const permittedKinds = (Object.keys(KIND_PERMISSION_MAP) as AttentionKind[]).filter(
      (kind) => permissions.has(KIND_PERMISSION_MAP[kind]),
    );

    let planUsage: PlanUsageSnapshot | undefined;
    if (permissions.has('billing:read')) {
      planUsage = await this._buildPlanUsage(org);
    }

    const timezone = (user as any).profile?.timezone;

    return this._dashboardService.getAttention(
      org.id,
      user.id,
      permittedKinds,
      planUsage,
      timezone,
    );
  }

  @Get('/brief')
  @RequirePermission('analytics', 'read')
  @CheckPolicies([AuthorizationActions.Read, Sections.AI])
  async getBrief(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    if (!org?.id || !user?.id) {
      throw new UnauthorizedException();
    }
    return this._briefService.getCachedBrief(org, user);
  }

  @Post('/brief')
  @RequirePermission('analytics', 'read')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async generateBrief(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    if (!org?.id || !user?.id) {
      throw new UnauthorizedException();
    }

    const effective = await this._rolesService.getEffectivePermissions(
      org.id,
      user.id,
    );
    const permissions = new Set(effective?.permissions ?? []);
    const permittedKinds = (Object.keys(KIND_PERMISSION_MAP) as AttentionKind[]).filter(
      (kind) => permissions.has(KIND_PERMISSION_MAP[kind]),
    );

    let planUsage: PlanUsageSnapshot | undefined;
    if (permissions.has('billing:read')) {
      planUsage = await this._buildPlanUsage(org);
    }

    return this._briefService.generateBrief(org, user, permittedKinds, planUsage);
  }

  private async _buildUsage(org: Organization) {
    const billingEnabled = !!process.env.STRIPE_PUBLISHABLE_KEY;
    if (!billingEnabled) {
      return { billingEnabled: false };
    }

    const { subscription, options } =
      await this._permissionsService.getPackageOptions(org.id);

    const createdAt = subscription?.createdAt || org.createdAt;
    const totalMonthPast = Math.abs(dayjs(createdAt).diff(dayjs(), 'month'));
    const checkFrom = dayjs(createdAt).add(totalMonthPast, 'month');

    const [postsThisCycle, integrations, team] = await Promise.all([
      this._postsService.countPostsFromDay(org.id, checkFrom.toDate()),
      this._integrationService.getIntegrationsList(org.id),
      this._organizationService.getTeam(org.id),
    ]);

    return {
      billingEnabled: true,
      tier: subscription?.subscriptionTier || 'FREE',
      limits: {
        postsPerMonth: options.posts_per_month,
        channels: options.channel,
        teamMembers: options.team_members,
      },
      usage: {
        postsThisCycle,
        channels: integrations.filter((i) => !i.refreshNeeded).length,
        teamMembers: team?.users?.length ?? 0,
      },
    };
  }

  private async _buildPlanUsage(org: Organization): Promise<PlanUsageSnapshot> {
    const { subscription, options } =
      await this._permissionsService.getPackageOptions(org.id);

    const createdAt = subscription?.createdAt || org.createdAt;
    const totalMonthPast = Math.abs(dayjs(createdAt).diff(dayjs(), 'month'));
    const checkFrom = dayjs(createdAt).add(totalMonthPast, 'month');

    const [postsThisCycle, integrations, team] = await Promise.all([
      this._postsService.countPostsFromDay(org.id, checkFrom.toDate()),
      this._integrationService.getIntegrationsList(org.id),
      this._organizationService.getTeam(org.id),
    ]);

    return {
      postsThisCycle,
      postsLimit: options.posts_per_month,
      channels: integrations.filter((i) => !i.refreshNeeded).length,
      channelsLimit: options.channel,
      teamMembers: team?.users?.length ?? 0,
      teamLimit: options.team_members,
    };
  }
}

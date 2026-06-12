import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { SocialCommentsService } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { OrgAiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service';
import { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import { AiMediaService } from '@gitroom/nestjs-libraries/ai/governance/media.service';
import { StorageService } from '@gitroom/nestjs-libraries/database/prisma/storage/storage.service';
import { Organization, User } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

@Controller('/dashboard')
export class DashboardController {
  constructor(
    private _postsService: PostsService,
    private _integrationService: IntegrationService,
    private _socialCommentsService: SocialCommentsService,
    private _organizationService: OrganizationService,
    private _orgAiSettingsService: OrgAiSettingsService,
    private _orgShortLinkSettingsService: OrgShortLinkSettingsService,
    private _aiMediaService: AiMediaService,
    private _storageService: StorageService,
  ) {}

  @Get('/summary')
  async getSummary(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
  ) {
    if (!org?.id) {
      throw new UnauthorizedException();
    }

    const orgId = org.id;
    const sevenDaysAgo = dayjs.utc().subtract(7, 'days').toDate();

    const [
      integrations,
      team,
      aiConfig,
      shortlinkConfig,
      storageConfigs,
      totalPosts,
      scheduledPosts,
      publishedNext7,
      drafts,
      upcomingPosts,
    ] = await Promise.all([
      this._integrationService.getIntegrationsList(orgId),
      this._organizationService.getTeam(orgId),
      this._orgAiSettingsService.getActiveProvider(orgId),
      this._orgShortLinkSettingsService.getActiveProvider(orgId),
      this._storageService.getProviderConfigs(orgId),
      this._postsService.getTotalCount(orgId),
      this._postsService.getScheduledCount(orgId),
      this._postsService.getPublishedCountSince(orgId, sevenDaysAgo),
      this._postsService.getDraftCount(orgId),
      this._postsService.getUpcomingPosts(orgId, 5),
    ]);

    // LOCAL is seeded at org creation, so "storage connected" means a real
    // cloud provider (non-LOCAL) has been configured.
    const storageProviderActive = (storageConfigs || []).some(
      (c: { type?: string }) => c.type && c.type !== 'LOCAL',
    );

    const commentUnread = await this._socialCommentsService.getInboxUnreadCount(
      orgId,
      user?.id,
    );

    const mediaSummary = await this._aiMediaService.getMediaProviderSummary(orgId);
    const mediaProviderActive = mediaSummary.some((e) => e.available);

    return {
      totalPosts,
      scheduledPosts,
      publishedNext7,
      channelsConnected: integrations.length,
      drafts,
      upcomingPosts: upcomingPosts.map((p) => ({
        id: p.id,
        content: p.content?.substring(0, 100),
        publishDate: p.publishDate,
        channelName: p.integration?.name,
        providerIdentifier: p.integration?.providerIdentifier,
      })),
      commentUnreadCount: commentUnread?.unreadCount ?? 0,
      shortLinkClicks: 0,
      aiProviderActive: !!aiConfig,
      shortlinkProviderActive: !!shortlinkConfig,
      mediaProviderActive,
      storageProviderActive,
      teamMembers: team?.users?.length ?? 0,
    };
  }
}

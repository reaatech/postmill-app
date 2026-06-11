import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class {},
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: class {},
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service', () => ({
  SocialCommentsService: class {},
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({
  OrganizationService: class {},
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service', () => ({
  OrgAiSettingsService: class {},
}));
vi.mock('@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service', () => ({
  OrgShortLinkSettingsService: class {},
}));
vi.mock('@gitroom/nestjs-libraries/ai/governance/media.service', () => ({
  AiMediaService: class {},
}));

import { DashboardController } from './dashboard.controller';

const org = { id: 'org-1' } as any;
const user = { id: 'user-1' } as any;

describe('DashboardController', () => {
  let postsService: any;
  let integrationService: any;
  let socialCommentsService: any;
  let organizationService: any;
  let orgAiSettingsService: any;
  let orgShortLinkSettingsService: any;
  let aiMediaService: any;
  let controller: DashboardController;

  beforeEach(() => {
    postsService = {
      getTotalCount: vi.fn().mockResolvedValue(12),
      getScheduledCount: vi.fn().mockResolvedValue(3),
      getPublishedCountSince: vi.fn().mockResolvedValue(5),
      getDraftCount: vi.fn().mockResolvedValue(2),
      getUpcomingPosts: vi.fn().mockResolvedValue([
        {
          id: 'post-1',
          content: 'Hello world',
          publishDate: new Date('2026-06-11T10:00:00.000Z'),
          integration: { name: 'My X', providerIdentifier: 'x' },
        },
      ]),
    };
    integrationService = {
      getIntegrationsList: vi.fn().mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]),
    };
    socialCommentsService = {
      getInboxUnreadCount: vi.fn().mockResolvedValue({ unreadCount: 4 }),
    };
    organizationService = {
      getTeam: vi.fn().mockResolvedValue({ users: [{}, {}, {}] }),
    };
    orgAiSettingsService = {
      getActiveProvider: vi.fn().mockResolvedValue({ identifier: 'openai' }),
    };
    orgShortLinkSettingsService = {
      getActiveProvider: vi.fn().mockResolvedValue(null),
    };
    aiMediaService = {
      getMediaProviderSummary: vi
        .fn()
        .mockResolvedValue([{ available: false }, { available: true }]),
    };

    controller = new DashboardController(
      postsService,
      integrationService,
      socialCommentsService,
      organizationService,
      orgAiSettingsService,
      orgShortLinkSettingsService,
      aiMediaService,
    );
  });

  it('throws UnauthorizedException when there is no org', async () => {
    await expect(controller.getSummary(undefined as any, user)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(controller.getSummary({} as any, user)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(postsService.getTotalCount).not.toHaveBeenCalled();
  });

  it('returns the summary shape the dashboard frontend relies on', async () => {
    const result = await controller.getSummary(org, user);

    expect(result).toEqual({
      totalPosts: 12,
      scheduledPosts: 3,
      publishedNext7: 5,
      channelsConnected: 2,
      drafts: 2,
      upcomingPosts: [
        {
          id: 'post-1',
          content: 'Hello world',
          publishDate: new Date('2026-06-11T10:00:00.000Z'),
          channelName: 'My X',
          providerIdentifier: 'x',
        },
      ],
      commentUnreadCount: 4,
      shortLinkClicks: 0,
      aiProviderActive: true,
      shortlinkProviderActive: false,
      mediaProviderActive: true,
      teamMembers: 3,
    });
  });

  it('scopes every lookup to the requesting org', async () => {
    await controller.getSummary(org, user);

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith('org-1');
    expect(organizationService.getTeam).toHaveBeenCalledWith('org-1');
    expect(orgAiSettingsService.getActiveProvider).toHaveBeenCalledWith('org-1');
    expect(orgShortLinkSettingsService.getActiveProvider).toHaveBeenCalledWith('org-1');
    expect(postsService.getTotalCount).toHaveBeenCalledWith('org-1');
    expect(postsService.getScheduledCount).toHaveBeenCalledWith('org-1');
    expect(postsService.getDraftCount).toHaveBeenCalledWith('org-1');
    expect(postsService.getPublishedCountSince).toHaveBeenCalledWith(
      'org-1',
      expect.any(Date),
    );
    expect(postsService.getUpcomingPosts).toHaveBeenCalledWith('org-1', 5);
    expect(socialCommentsService.getInboxUnreadCount).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
  });

  it('truncates upcoming post content to 100 characters', async () => {
    postsService.getUpcomingPosts.mockResolvedValue([
      {
        id: 'post-long',
        content: 'x'.repeat(250),
        publishDate: new Date(),
        integration: { name: 'ch', providerIdentifier: 'x' },
      },
    ]);

    const result = await controller.getSummary(org, user);
    expect(result.upcomingPosts[0].content).toHaveLength(100);
  });

  it('reports provider flags as inactive when nothing is configured', async () => {
    orgAiSettingsService.getActiveProvider.mockResolvedValue(null);
    aiMediaService.getMediaProviderSummary.mockResolvedValue([
      { available: false },
    ]);

    const result = await controller.getSummary(org, user);
    expect(result.aiProviderActive).toBe(false);
    expect(result.shortlinkProviderActive).toBe(false);
    expect(result.mediaProviderActive).toBe(false);
  });

  it('defaults teamMembers and commentUnreadCount when lookups return nothing', async () => {
    organizationService.getTeam.mockResolvedValue(null);
    socialCommentsService.getInboxUnreadCount.mockResolvedValue(undefined);

    const result = await controller.getSummary(org, user);
    expect(result.teamMembers).toBe(0);
    expect(result.commentUnreadCount).toBe(0);
  });
});

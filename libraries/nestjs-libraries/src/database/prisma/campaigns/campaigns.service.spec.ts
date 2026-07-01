import { describe, it, expect, vi } from 'vitest';
import { CampaignsService } from './campaigns.service';

function makeService(overrides: any = {}) {
  const campaignsRepository = {
    create: vi.fn().mockResolvedValue({ id: 'c1' }),
    update: vi.fn().mockResolvedValue({ id: 'c1' }),
    findById: vi.fn().mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
      name: 'Launch',
      goals: null,
      createdById: 'u1',
    }),
    getEngagement: vi.fn().mockResolvedValue({ totalComments: 0 }),
    getPostStateCounts: vi.fn().mockResolvedValue({}),
    getUpcomingQueuePosts: vi.fn().mockResolvedValue([]),
    getCampaignClickTotal: vi.fn().mockResolvedValue(0),
    getCappedItemsByCampaign: vi
      .fn()
      .mockResolvedValue([{ entityId: 'i3', createdAt: new Date(0) }]),
    ...overrides.campaignsRepository,
  };
  const campaignItems = {
    countByCampaignGroupedByType: vi
      .fn()
      .mockResolvedValue([{ entityType: 'INTEGRATION' }]),
    ...overrides.campaignItems,
  };
  const campaignItemResolver = {
    resolveBatch: vi
      .fn()
      .mockResolvedValue(
        new Map([['i3', { id: 'i3', name: 'YouTube', icon: 'youtube', subtitle: 'youtube' }]])
      ),
  };
  const audit = { findByEntity: vi.fn().mockResolvedValue([]) };
  const postsService = {
    getCampaignPosts: vi.fn().mockResolvedValue([
      { integration: { id: 'i1', name: 'X', providerIdentifier: 'x', picture: 'p1' } },
      { integration: { id: 'i1', name: 'X', providerIdentifier: 'x', picture: 'p1' } },
      { integration: { id: 'i2', name: 'LI', providerIdentifier: 'linkedin', picture: null } },
    ]),
  };
  const usersService = {
    getNamesByIds: vi.fn().mockResolvedValue(new Map()),
    getPublicProfilesByIds: vi
      .fn()
      .mockResolvedValue(
        new Map([['u1', { id: 'u1', name: 'Maya Chen', email: 'm@a.test', avatarUrl: null }]])
      ),
  };
  const socialCommentsService = { countCampaignComments: vi.fn().mockResolvedValue(0) };
  const fileService = { getByIds: vi.fn().mockResolvedValue([]) };

  const service = new CampaignsService(
    campaignsRepository as any,
    campaignItems as any,
    campaignItemResolver as any,
    audit as any,
    postsService as any,
    usersService as any,
    socialCommentsService as any,
    fileService as any
  );
  return { service, campaignsRepository, usersService };
}

describe('CampaignsService', () => {
  it('passes client/project/tags through create', async () => {
    const { service, campaignsRepository } = makeService();
    await service.create({
      organizationId: 'org1',
      name: 'Launch',
      client: 'Acme',
      project: 'v4',
      tags: ['paid', 'launch'],
    });
    expect(campaignsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ client: 'Acme', project: 'v4', tags: ['paid', 'launch'] })
    );
  });

  it('builds the channel union (post-derived + tagged), deduped with postCount', async () => {
    const { service } = makeService();
    const dash = await service.getDashboard('c1', 'org1');
    // i1 appears in two posts, i2 in one, i3 is tagged-only (no posts).
    expect(dash.channels).toEqual([
      { id: 'i1', name: 'X', picture: 'p1', providerIdentifier: 'x', postCount: 2 },
      { id: 'i2', name: 'LI', picture: null, providerIdentifier: 'linkedin', postCount: 1 },
      { id: 'i3', name: 'YouTube', picture: null, providerIdentifier: 'youtube', postCount: 0 },
    ]);
  });

  it('resolves createdBy into a linkable profile object', async () => {
    const { service, usersService } = makeService();
    const dash = await service.getDashboard('c1', 'org1');
    expect(usersService.getPublicProfilesByIds).toHaveBeenCalledWith(['u1']);
    expect(dash.campaign.createdBy).toEqual({
      id: 'u1',
      name: 'Maya Chen',
      email: 'm@a.test',
      avatarUrl: null,
    });
  });
});

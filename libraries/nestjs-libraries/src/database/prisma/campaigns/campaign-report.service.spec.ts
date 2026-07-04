import { describe, it, expect, vi } from 'vitest';
import { CampaignReportService } from './campaign-report.service';

const campaignRow = {
  id: 'c1',
  organizationId: 'org1',
  name: 'Launch',
  color: '#2B5CD3',
  description: 'desc',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-02-01'),
  shareEnabled: true,
  goals: null,
  // Internal-only fields that must NOT leak on the public report.
  client: 'Acme Corp',
  project: 'Top secret',
  tags: ['internal', 'q1'],
  createdById: 'user-1',
};

function makeService() {
  const campaigns = {
    findByShareToken: vi.fn().mockResolvedValue(campaignRow),
    findById: vi.fn().mockResolvedValue(campaignRow),
    getEngagement: vi.fn().mockResolvedValue({
      totalViews: 10, totalLikes: 2, totalComments: 1, avgViews: 5, avgLikes: 1, avgComments: 0,
    }),
    getPostStateCounts: vi.fn().mockResolvedValue({ DRAFT: 0, QUEUE: 0, PUBLISHED: 1 }),
    getCampaignClickTotal: vi.fn().mockResolvedValue(3),
  };
  const items = {
    countByCampaignGroupedByType: vi.fn().mockResolvedValue([]),
    listByCampaign: vi.fn().mockResolvedValue([]),
  };
  const resolver = { resolveBatch: vi.fn().mockResolvedValue(new Map()) };
  const posts = { getCampaignPosts: vi.fn().mockResolvedValue([]) };
  const comments = { countCampaignComments: vi.fn().mockResolvedValue(1) };

  const service = new CampaignReportService(
    campaigns as any,
    items as any,
    resolver as any,
    posts as any,
    comments as any
  );
  return { service };
}

const analytics = {
  series: { views: [{ date: '2024-01-01', value: 5 }] },
  byChannel: [{ integrationId: 'i1', name: 'X', identifier: '@x', picture: '', kpis: [] }],
  window: { from: '2024-01-01', to: '2024-01-07' },
};

describe('CampaignReportService.toPublicJson (3.4 whitelist)', () => {
  it('excludes internal campaign fields and includes the analytics block', async () => {
    const { service } = makeService();
    const out: any = await service.toPublicJson('tok', analytics);

    // Whitelisted campaign fields only.
    expect(Object.keys(out.campaign).sort()).toEqual(
      ['color', 'description', 'endDate', 'id', 'name', 'startDate']
    );
    // Internal fields absent.
    expect(out.campaign.client).toBeUndefined();
    expect(out.campaign.project).toBeUndefined();
    expect(out.campaign.tags).toBeUndefined();
    expect(out.campaign.createdById).toBeUndefined();
    expect(out.createdBy).toBeUndefined();

    // Analytics present, whitelisted to series/byChannel/window.
    expect(out.analytics).toBeDefined();
    expect(Object.keys(out.analytics).sort()).toEqual(['byChannel', 'series', 'window']);
    expect(out.analytics.series.views[0].value).toBe(5);
  });

  it('omits the analytics block when none is passed', async () => {
    const { service } = makeService();
    const out: any = await service.toPublicJson('tok');
    expect(out.analytics).toBeUndefined();
  });

  it('resolveShareToken returns identity for an enabled share, null otherwise', async () => {
    const { service } = makeService();
    await expect(service.resolveShareToken('tok')).resolves.toEqual({
      id: 'c1',
      organizationId: 'org1',
    });
  });
});

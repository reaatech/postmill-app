import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionsService } from './permissions.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  AuthorizationActions,
  Sections,
} from './permission.exception.class';
import { StorageProviderType } from '@prisma/client';

const orgId = 'org-1';

function subscriptionFixture(
  tier: 'STARTER' | 'PRO' | 'TEAM' | 'AGENCY',
  extra: Record<string, unknown> = {}
) {
  return {
    subscriptionTier: tier,
    totalChannels: pricing[tier].channel,
    createdAt: new Date(),
    ...extra,
  };
}

function buildService(overrides: Record<string, unknown> = {}) {
  const subscriptionService = {
    getSubscriptionByOrganizationId: vi.fn().mockResolvedValue(null),
    getCreditsFrom: vi.fn().mockResolvedValue(0),
    ...((overrides.subscriptionService as any) || {}),
  };
  const postsService = {
    countPostsFromDay: vi.fn().mockResolvedValue(0),
    ...((overrides.postsService as any) || {}),
  };
  const integrationService = {
    getIntegrationsList: vi.fn().mockResolvedValue([]),
    getIntegrationById: vi.fn().mockResolvedValue(null),
    disableIntegrations: vi.fn().mockResolvedValue(undefined),
    ...((overrides.integrationService as any) || {}),
  };
  const webhooksService = {
    getTotal: vi.fn().mockResolvedValue(0),
    ...((overrides.webhooksService as any) || {}),
  };
  const organizationService = {
    getTeam: vi.fn().mockResolvedValue({ users: [] }),
    getOrgById: vi.fn().mockResolvedValue({ id: orgId }),
    disableExcessNonOwnerUsers: vi.fn().mockResolvedValue(undefined),
    ...((overrides.organizationService as any) || {}),
  };
  const brandsRepository = {
    countBrands: vi.fn().mockResolvedValue(0),
    ...((overrides.brandsRepository as any) || {}),
  };
  const watchlistRepository = {
    countByOrg: vi.fn().mockResolvedValue(0),
    ...((overrides.watchlistRepository as any) || {}),
  };
  const fileRepository = {
    getStorageBytes: vi.fn().mockResolvedValue(0),
    ...((overrides.fileRepository as any) || {}),
  };
  const storageService = {
    getMountedConfigs: vi.fn().mockResolvedValue([]),
    ...((overrides.storageService as any) || {}),
  };

  const service = new PermissionsService(
    subscriptionService as any,
    postsService as any,
    integrationService as any,
    webhooksService as any,
    organizationService as any,
    brandsRepository as any,
    watchlistRepository as any,
    fileRepository as any,
    storageService as any
  );

  return {
    service,
    subscriptionService,
    postsService,
    integrationService,
    webhooksService,
    organizationService,
    brandsRepository,
    watchlistRepository,
    fileRepository,
    storageService,
  };
}

function abilityCan(
  ability: any,
  action: AuthorizationActions,
  section: Sections
) {
  return ability.can(action, section);
}

async function can(
  service: PermissionsService,
  section: Sections,
  action: AuthorizationActions = AuthorizationActions.Create,
  createdAt = new Date()
) {
  const ability = await service.check(orgId, createdAt, 'ADMIN', [
    [action, section],
  ]);
  return abilityCan(ability, action, section);
}

async function canWithRefresh(
  service: PermissionsService,
  section: Sections,
  refreshChannelId: string,
  action: AuthorizationActions = AuthorizationActions.Create
) {
  const ability = await service.check(
    orgId,
    new Date(),
    'ADMIN',
    [[action, section]],
    refreshChannelId
  );
  return abilityCan(ability, action, section);
}

describe('PermissionsService — subscription matrix', () => {
  beforeEach(() => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    vi.clearAllMocks();
  });

  describe('self-host (no Stripe)', () => {
    it('unlocks every section regardless of usage', async () => {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
      const { service, subscriptionService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('STARTER')
      );

      const sections: Sections[] = Object.values(Sections).filter(
        (s): s is Sections => typeof s === 'string'
      );

      for (const section of sections) {
        expect(
          await can(service, section),
          `${section} should be allowed in self-host`
        ).toBe(true);
      }
    });
  });

  describe('Stripe-enabled: no subscription defaults to STARTER', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it('uses STARTER limits when there is no subscription', async () => {
      const { service, subscriptionService, integrationService } =
        buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        null
      );
      integrationService.getIntegrationsList.mockResolvedValue([
        { refreshNeeded: false },
        { refreshNeeded: false },
      ]);

      expect(await can(service, Sections.CHANNEL)).toBe(true);

      integrationService.getIntegrationsList.mockResolvedValue([
        { refreshNeeded: false },
        { refreshNeeded: false },
        { refreshNeeded: false },
      ]);
      expect(await can(service, Sections.CHANNEL)).toBe(false);
    });
  });

  describe('CHANNEL', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', channel: 3 },
      { tier: 'PRO', channel: 10 },
      { tier: 'TEAM', channel: 30 },
      { tier: 'AGENCY', channel: 100 },
    ] as const)('$tier allows up to $channel channels', async ({ tier, channel }) => {
      const { service, subscriptionService, integrationService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier)
      );

      integrationService.getIntegrationsList.mockResolvedValue(
        Array.from({ length: channel }, () => ({ refreshNeeded: false }))
      );
      expect(await can(service, Sections.CHANNEL)).toBe(false);

      integrationService.getIntegrationsList.mockResolvedValue(
        Array.from({ length: channel - 1 }, () => ({ refreshNeeded: false }))
      );
      expect(await can(service, Sections.CHANNEL)).toBe(true);
    });

    it('refreshing an existing channel is allowed even at the cap', async () => {
      const { service, subscriptionService, integrationService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('STARTER')
      );
      integrationService.getIntegrationsList.mockResolvedValue(
        Array.from({ length: 3 }, () => ({ refreshNeeded: false }))
      );
      integrationService.getIntegrationById.mockResolvedValue({ id: 'ch-1' });

      expect(await can(service, Sections.CHANNEL)).toBe(false);
      expect(await canWithRefresh(service, Sections.CHANNEL, 'ch-1')).toBe(true);
    });
  });

  describe('POSTS_PER_MONTH', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', limit: 100 },
      { tier: 'PRO', limit: 1000000 },
      { tier: 'TEAM', limit: 1000000 },
      { tier: 'AGENCY', limit: 1000000 },
    ] as const)('$tier allows up to $limit posts this cycle', async ({ tier, limit }) => {
      const { service, subscriptionService, postsService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier)
      );

      postsService.countPostsFromDay.mockResolvedValue(limit - 1);
      expect(await can(service, Sections.POSTS_PER_MONTH)).toBe(true);

      postsService.countPostsFromDay.mockResolvedValue(limit);
      expect(await can(service, Sections.POSTS_PER_MONTH)).toBe(false);
    });
  });

  describe('TEAM_MEMBERS', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', limit: 1 },
      { tier: 'PRO', limit: 3 },
      { tier: 'TEAM', limit: 10 },
      { tier: 'AGENCY', limit: 25 },
    ] as const)('$tier allows up to $limit team members', async ({ tier, limit }) => {
      const { service, subscriptionService, organizationService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier)
      );

      organizationService.getTeam.mockResolvedValue({
        users: Array.from({ length: limit }, () => ({})),
      });
      expect(await can(service, Sections.TEAM_MEMBERS)).toBe(false);

      organizationService.getTeam.mockResolvedValue({
        users: Array.from({ length: limit - 1 }, () => ({})),
      });
      expect(await can(service, Sections.TEAM_MEMBERS)).toBe(true);
    });
  });

  describe('WEBHOOKS', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', limit: 1 },
      { tier: 'PRO', limit: 5 },
      { tier: 'TEAM', limit: 20 },
      { tier: 'AGENCY', limit: 1000000 },
    ] as const)('$tier allows up to $limit webhooks', async ({ tier, limit }) => {
      const { service, subscriptionService, webhooksService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier)
      );

      webhooksService.getTotal.mockResolvedValue(limit - 1);
      expect(await can(service, Sections.WEBHOOKS)).toBe(true);

      webhooksService.getTotal.mockResolvedValue(limit);
      expect(await can(service, Sections.WEBHOOKS)).toBe(false);
    });
  });

  describe('BRANDS', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', limit: 0 },
      { tier: 'PRO', limit: 2 },
      { tier: 'TEAM', limit: 10 },
      { tier: 'AGENCY', limit: 1000000 },
    ] as const)('$tier allows up to $limit brand kits', async ({ tier, limit }) => {
      const { service, subscriptionService, brandsRepository } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier)
      );

      brandsRepository.countBrands.mockResolvedValue(limit > 0 ? limit - 1 : 0);
      expect(await can(service, Sections.BRANDS)).toBe(limit > 0);

      brandsRepository.countBrands.mockResolvedValue(limit);
      expect(await can(service, Sections.BRANDS)).toBe(false);
    });
  });

  describe('CAMPAIGNS / API / MCP', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', campaigns: false, api: false, mcp: false },
      { tier: 'PRO', campaigns: true, api: true, mcp: true },
      { tier: 'TEAM', campaigns: true, api: true, mcp: true },
      { tier: 'AGENCY', campaigns: true, api: true, mcp: true },
    ] as const)('$tier boolean gates match plan', async ({ tier, campaigns, api, mcp }) => {
      const { service, subscriptionService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier)
      );

      expect(await can(service, Sections.CAMPAIGNS)).toBe(campaigns);
      expect(await can(service, Sections.API)).toBe(api);
      expect(await can(service, Sections.MCP)).toBe(mcp);
    });
  });

  describe('COMPETITORS', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', limit: 1 },
      { tier: 'PRO', limit: 5 },
      { tier: 'TEAM', limit: 20 },
      { tier: 'AGENCY', limit: 50 },
    ] as const)('$tier allows up to $limit competitors', async ({ tier, limit }) => {
      const { service, subscriptionService, watchlistRepository } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier)
      );

      watchlistRepository.countByOrg.mockResolvedValue(limit - 1);
      expect(await can(service, Sections.COMPETITORS)).toBe(true);

      watchlistRepository.countByOrg.mockResolvedValue(limit);
      expect(await can(service, Sections.COMPETITORS)).toBe(false);
    });
  });

  describe('VIDEO_EXPORTS', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', cap: 15 },
      { tier: 'PRO', cap: 60 },
      { tier: 'TEAM', cap: 200 },
      { tier: 'AGENCY', cap: 600 },
    ] as const)('$tier cap $cap blocks at the limit', async ({ tier, cap }) => {
      const { service, subscriptionService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier, { extraVideoExports: 0 })
      );
      subscriptionService.getCreditsFrom.mockResolvedValue(cap - 1);

      expect(await can(service, Sections.VIDEO_EXPORTS)).toBe(true);

      subscriptionService.getCreditsFrom.mockResolvedValue(cap);
      expect(await can(service, Sections.VIDEO_EXPORTS)).toBe(false);
    });

    it('adds extraVideoExports to the cap', async () => {
      const { service, subscriptionService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('STARTER', { extraVideoExports: 10 })
      );
      subscriptionService.getCreditsFrom.mockResolvedValue(24);

      expect(await can(service, Sections.VIDEO_EXPORTS)).toBe(true);

      subscriptionService.getCreditsFrom.mockResolvedValue(25);
      expect(await can(service, Sections.VIDEO_EXPORTS)).toBe(false);
    });
  });

  describe('getEffectiveLimits', () => {
    it('returns plan caps unchanged when there are no add-ons', async () => {
      const { service, subscriptionService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('STARTER')
      );

      const { options } = await service.getEffectiveLimits(orgId);

      expect(options.storage_gb).toBe(pricing.STARTER.storage_gb);
      expect(options.video_exports).toBe(pricing.STARTER.video_exports);
    });

    it('adds extraStorageGb / extraVideoExports to the plan caps', async () => {
      const { service, subscriptionService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('STARTER', {
          extraStorageGb: 50,
          extraVideoExports: 100,
        })
      );

      const { options } = await service.getEffectiveLimits(orgId);

      expect(options.storage_gb).toBe(pricing.STARTER.storage_gb + 50);
      expect(options.video_exports).toBe(pricing.STARTER.video_exports + 100);
    });

    it('sets byoStorageActive when a non-LOCAL provider is mounted', async () => {
      const { service, subscriptionService, storageService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('TEAM')
      );
      storageService.getMountedConfigs.mockResolvedValue([
        { type: StorageProviderType.S3 },
      ]);

      const { byoStorageActive } = await service.getEffectiveLimits(orgId);
      expect(byoStorageActive).toBe(true);
    });

    it('leaves byoStorageActive false for LOCAL-only or no mounted storage', async () => {
      // LOCAL only
      {
        const { service, subscriptionService, storageService } = buildService();
        subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
          subscriptionFixture('TEAM')
        );
        storageService.getMountedConfigs.mockResolvedValue([
          { type: StorageProviderType.LOCAL },
        ]);

        const { byoStorageActive } = await service.getEffectiveLimits(orgId);
        expect(byoStorageActive).toBe(false);
      }

      // none mounted
      {
        const { service, subscriptionService } = buildService();
        subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
          subscriptionFixture('TEAM')
        );

        const { byoStorageActive } = await service.getEffectiveLimits(orgId);
        expect(byoStorageActive).toBe(false);
      }
    });
  });

  describe('STORAGE', () => {
    beforeEach(() => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    });

    it.each([
      { tier: 'STARTER', cap: 1 },
      { tier: 'PRO', cap: 5 },
      { tier: 'TEAM', cap: 20 },
      { tier: 'AGENCY', cap: 100 },
    ] as const)('$tier cap ${cap}GB blocks over the limit', async ({ tier, cap }) => {
      const { service, subscriptionService, fileRepository } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture(tier, { extraStorageGb: 0 })
      );

      const gb = 1024 * 1024 * 1024;
      fileRepository.getStorageBytes.mockResolvedValue(cap * gb - 1);
      expect(await can(service, Sections.STORAGE)).toBe(true);

      fileRepository.getStorageBytes.mockResolvedValue(cap * gb);
      expect(await can(service, Sections.STORAGE)).toBe(false);
    });

    it('waives the cap when a non-LOCAL provider is mounted', async () => {
      const { service, subscriptionService, storageService } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('STARTER')
      );
      storageService.getMountedConfigs.mockResolvedValue([
        { type: StorageProviderType.S3 },
      ]);

      expect(await can(service, Sections.STORAGE)).toBe(true);
    });

    it('adds extraStorageGb to the cap', async () => {
      const { service, subscriptionService, fileRepository } = buildService();
      subscriptionService.getSubscriptionByOrganizationId.mockResolvedValue(
        subscriptionFixture('STARTER', { extraStorageGb: 5 })
      );

      const gb = 1024 * 1024 * 1024;
      fileRepository.getStorageBytes.mockResolvedValue(5 * gb + 1 * gb - 1);
      expect(await can(service, Sections.STORAGE)).toBe(true);

      fileRepository.getStorageBytes.mockResolvedValue(5 * gb + 1 * gb);
      expect(await can(service, Sections.STORAGE)).toBe(false);
    });
  });
});

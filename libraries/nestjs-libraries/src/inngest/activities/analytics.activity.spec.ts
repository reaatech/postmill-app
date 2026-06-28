import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';

vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: vi.fn(),
}));

vi.mock(
  '@gitroom/nestjs-libraries/integrations/provider-config.manager',
  () => ({
    ProviderConfigManager: vi.fn(),
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/prisma.service',
  () => ({
    PrismaService: vi.fn(),
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({
    OrganizationService: vi.fn(),
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({
    IntegrationService: vi.fn(),
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({
    RefreshIntegrationService: vi.fn(),
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/integrations/social/analytics.metrics',
  () => ({
    normalizeMetric: vi.fn(),
    METRIC_REGISTRY: {
      impressions: { label: 'Impressions', format: 'count', kind: 'flow' },
      followers: { label: 'Followers', format: 'count', kind: 'stock' },
    },
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/integrations/social/provider-capabilities',
  () => ({
    PROVIDER_CAPABILITIES: {
      mastodon: { watchlist: false },
      x: { watchlist: true },
    },
  })
);

vi.mock('@gitroom/helpers/utils/timer', () => ({
  timer: vi.fn().mockResolvedValue(undefined),
}));

import { AnalyticsActivity } from '@gitroom/nestjs-libraries/inngest/activities/analytics.activity';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { ProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/provider-config.manager';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { normalizeMetric } from '@gitroom/nestjs-libraries/integrations/social/analytics.metrics';
import { timer } from '@gitroom/helpers/utils/timer';
import type { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import type { OrgShortLinkSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.repository';
import type { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import type { EmailLogService } from '@gitroom/nestjs-libraries/database/prisma/emails/email-log.service';

type Mocked<T> = T & { [K in keyof T]: T[K] extends (...args: any[]) => any ? ReturnType<typeof vi.fn> : T[K] };

describe('AnalyticsActivity', () => {
  let activity: AnalyticsActivity;
  let analyticsRepository: any;
  let integrationManager: Mocked<IntegrationManager>;
  let providerConfigManager: Mocked<ProviderConfigManager>;
  let organizationService: Mocked<OrganizationService>;
  let integrationService: Mocked<IntegrationService>;
  let refreshIntegrationService: Mocked<RefreshIntegrationService>;
  let webhooksService: any;
  let watchlistService: any;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    analyticsRepository = {
      upsertChannelSnapshot: vi.fn().mockResolvedValue({}),
      findPostsForSnapshots: vi.fn().mockResolvedValue([]),
      upsertPostSnapshot: vi.fn().mockResolvedValue({}),
      getLatestPostSnapshotsForCounters: vi.fn().mockResolvedValue([]),
      updatePostCounters: vi.fn().mockResolvedValue({}),
      deletePostSnapshotsBefore: vi.fn().mockResolvedValue({ count: 0 }),
      findChannelSnapshotsBefore: vi.fn().mockResolvedValue([]),
      replaceRolledUpSnapshots: vi.fn().mockResolvedValue([]),
      findIntegrationByIdRaw: vi.fn().mockResolvedValue(null),
    };

    integrationManager = {
      getSocialIntegrationUnchecked: vi.fn(),
      requireClientInformation: vi.fn().mockResolvedValue({ client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' }),
    } as any;

    providerConfigManager = {
      ensureFresh: vi.fn().mockResolvedValue(undefined),
    } as any;

    organizationService = {
      getAllIds: vi.fn(),
    } as any;

    integrationService = {
      getIntegrationsList: vi.fn(),
    } as any;

    refreshIntegrationService = {
      refresh: vi.fn(),
    } as any;

    webhooksService = { dispatchEvent: vi.fn().mockResolvedValue(undefined) };
    watchlistService = {
      getEnabledAccounts: vi.fn().mockResolvedValue([]),
      probeAndRecord: vi.fn().mockResolvedValue(undefined),
      markProbeFailed: vi.fn().mockResolvedValue(undefined),
    };

    activity = new AnalyticsActivity(
      analyticsRepository as any,
      integrationManager as any,
      providerConfigManager as any,
      organizationService as any,
      integrationService as any,
      refreshIntegrationService as any,
      webhooksService as any,
      watchlistService,
      {
        getActiveProvider: vi.fn().mockResolvedValue(null),
      } as unknown as OrgShortLinkSettingsService,
      {
        getByOrg: vi.fn().mockResolvedValue([]),
      } as unknown as OrgShortLinkSettingsRepository,
      {
        resolveShortLink: vi.fn().mockReturnValue(null),
      } as unknown as ProviderResolutionService,
      {
        recordSent: vi.fn().mockResolvedValue(undefined),
      } as unknown as EmailLogService
    );
  });

  // ---------------------------------------------------------------------------
  // getAllOrganizationIds
  // ---------------------------------------------------------------------------
  describe('getAllOrganizationIds', () => {
    it('returns org IDs from OrganizationService', async () => {
      (organizationService.getAllIds as any).mockResolvedValue([
        { id: 'org-1' },
        { id: 'org-2' },
        { id: 'org-3' },
      ]);

      const result = await activity.getAllOrganizationIds();

      expect(organizationService.getAllIds).toHaveBeenCalledOnce();
      expect(result).toEqual(['org-1', 'org-2', 'org-3']);
    });

    it('returns empty array when no organizations exist', async () => {
      (organizationService.getAllIds as any).mockResolvedValue([]);

      const result = await activity.getAllOrganizationIds();

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // collectChannelSnapshots
  // ---------------------------------------------------------------------------
  describe('collectChannelSnapshots', () => {
    const orgId = 'org-1';
    const daysBack = 7;

    const buildIntegration = (overrides: Record<string, any> = {}): Record<string, any> => ({
      id: 'int-1',
      type: 'social' as const,
      disabled: false,
      deletedAt: null as Date | null,
      providerIdentifier: 'facebook',
      internalId: 'fb-page-1',
      token: 'access-token-1',
      tokenExpiration: null as Date | null,
      ...overrides,
    });

    const buildAnalyticsEntry = (label: string, data: { date: string; total: number }[]) => ({
      label,
      data,
    });

    const stubProvider = (overrides: Record<string, any> = {}) => ({
      identifier: 'facebook',
      analytics: vi.fn(),
      postAnalytics: vi.fn(),
      refreshWait: false,
      ...overrides,
    });

    it('calls ensureFresh on ProviderConfigManager', async () => {
      (integrationService.getIntegrationsList as any).mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(providerConfigManager.ensureFresh).toHaveBeenCalledOnce();
    });

    it('fetches integrations list for the organization', async () => {
      (integrationService.getIntegrationsList as any).mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(integrationService.getIntegrationsList).toHaveBeenCalledWith(orgId);
    });

    it('filters to social integrations that are not disabled and not deleted', async () => {
      const integrations = [
        buildIntegration({ id: 'int-1', type: 'social' }),
        buildIntegration({ id: 'int-2', type: 'article', disabled: false }),
        buildIntegration({ id: 'int-3', type: 'social', disabled: true }),
        buildIntegration({ id: 'int-4', type: 'social', deletedAt: new Date() }),
      ];
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(stubProvider());

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(integrationManager.getSocialIntegrationUnchecked).toHaveBeenCalledTimes(1);
      expect(integrationManager.getSocialIntegrationUnchecked).toHaveBeenCalledWith(
        'facebook'
      );
    });

    it('skips integration when getSocialIntegrationUnchecked returns null/undefined', async () => {
      const integrations = [buildIntegration()];
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(null);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('skips provider that has no analytics method', async () => {
      const integrations = [buildIntegration()];
      const noAnalytics = stubProvider({ analytics: undefined });
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(noAnalytics);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('calls provider.analytics with correct arguments', async () => {
      const integrations = [buildIntegration()];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(provider.analytics).toHaveBeenCalledWith('fb-page-1', 'access-token-1', 7, expect.anything());
    });

    it('uses custom daysBack argument', async () => {
      const integrations = [buildIntegration()];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, 30);

      expect(provider.analytics).toHaveBeenCalledWith('fb-page-1', 'access-token-1', 30, expect.anything());
    });

    it('refreshes token when tokenExpiration is in the past', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integrations = [
        buildIntegration({ tokenExpiration: pastExpiry }),
      ];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue({
        accessToken: 'refreshed-token',
      });
      provider.analytics.mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(refreshIntegrationService.refresh).toHaveBeenCalledWith(integrations[0]);
      expect(provider.analytics).toHaveBeenCalledWith('fb-page-1', 'refreshed-token', 7, expect.anything());
    });

    it('does not refresh token when tokenExpiration is null', async () => {
      const integrations = [buildIntegration({ tokenExpiration: null })];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(refreshIntegrationService.refresh).not.toHaveBeenCalled();
    });

    it('does not refresh token when tokenExpiration is in the future', async () => {
      const futureExpiry = dayjs().add(1, 'day').toDate();
      const integrations = [
        buildIntegration({ tokenExpiration: futureExpiry }),
      ];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(refreshIntegrationService.refresh).not.toHaveBeenCalled();
    });

    it('skips integration when token refresh returns falsy', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integrations = [
        buildIntegration({ tokenExpiration: pastExpiry }),
      ];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue(null);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(provider.analytics).not.toHaveBeenCalled();
    });

    it('skips integration when token refresh returns without accessToken', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integrations = [
        buildIntegration({ tokenExpiration: pastExpiry }),
      ];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue({
        accessToken: undefined,
      });

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(provider.analytics).not.toHaveBeenCalled();
    });

    it('waits 10s when provider.refreshWait is true after token refresh', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integrations = [
        buildIntegration({ tokenExpiration: pastExpiry }),
      ];
      const provider = stubProvider({ refreshWait: true });
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue({
        accessToken: 'refreshed-token',
      });
      provider.analytics.mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(timer).toHaveBeenCalledWith(10000);
    });

    it('does not wait when provider.refreshWait is false', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integrations = [
        buildIntegration({ tokenExpiration: pastExpiry }),
      ];
      const provider = stubProvider({ refreshWait: false });
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue({
        accessToken: 'refreshed-token',
      });
      provider.analytics.mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(timer).not.toHaveBeenCalled();
    });

    it('normalizes metrics and upserts into AnalyticsSnapshot', async () => {
      const integrations = [buildIntegration()];
      const provider = stubProvider();
      const date1 = dayjs().subtract(1, 'day').startOf('day').toDate();
      const date2 = dayjs().subtract(2, 'day').startOf('day').toDate();

      provider.analytics.mockResolvedValue([
        buildAnalyticsEntry('Page Impressions', [
          { date: dayjs(date1).toISOString(), total: 500 },
          { date: dayjs(date2).toISOString(), total: 300 },
        ]),
        buildAnalyticsEntry('Page followers', [
          { date: dayjs(date1).toISOString(), total: 1200 },
        ]),
      ]);

      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any)
        .mockReturnValueOnce('impressions')  // Page Impressions -> impressions
        .mockReturnValueOnce('followers');   // Page followers -> followers

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledTimes(3);

      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledWith({
        organizationId: orgId,
        integrationId: 'int-1',
        metric: 'impressions',
        value: 500,
        date: date1,
      });

      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledWith({
        organizationId: orgId,
        integrationId: 'int-1',
        metric: 'impressions',
        value: 300,
        date: date2,
      });

      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledWith({
        organizationId: orgId,
        integrationId: 'int-1',
        metric: 'followers',
        value: 1200,
        date: date1,
      });
    });

    it('skips entries where normalizeMetric returns undefined', async () => {
      const integrations = [buildIntegration()];
      const provider = stubProvider();
      provider.analytics.mockResolvedValue([
        buildAnalyticsEntry('Unknown Metric', [
          { date: dayjs().toISOString(), total: 100 },
        ]),
      ]);

      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any).mockReturnValue(undefined);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('skips NaN values in data points', async () => {
      const integrations = [buildIntegration()];
      const provider = stubProvider();
      const validDate = dayjs().subtract(1, 'day').startOf('day').toDate();
      const nanDate = dayjs().subtract(2, 'day').startOf('day').toDate();

      provider.analytics.mockResolvedValue([
        buildAnalyticsEntry('Page Impressions', [
          { date: dayjs(validDate).toISOString(), total: 500 },
          { date: dayjs(nanDate).toISOString(), total: NaN },
        ]),
      ]);

      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any).mockReturnValue('impressions');

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledTimes(1);
      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ value: 500 })
      );
    });

    it('handles RefreshToken errors gracefully by continuing to next integration', async () => {
      const integrations = [
        buildIntegration({ id: 'int-1', internalId: 'fb-1' }),
        buildIntegration({ id: 'int-2', internalId: 'fb-2' }),
      ];
      const provider1 = stubProvider();
      const provider2 = stubProvider();

      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any)
        .mockReturnValueOnce(provider1)
        .mockReturnValueOnce(provider2);

      provider1.analytics.mockRejectedValue(
        new RefreshToken('fb-1', '{}', 'body', 'Token expired')
      );
      provider2.analytics.mockResolvedValue([
        buildAnalyticsEntry('Likes', [
          { date: dayjs().toISOString(), total: 10 },
        ]),
      ]);
      (normalizeMetric as any).mockReturnValue('likes');

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(provider1.analytics).toHaveBeenCalled();
      expect(provider2.analytics).toHaveBeenCalled();
      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.error).not.toHaveBeenCalled();
    });

    it('handles generic errors by logging and continuing', async () => {
      const integrations = [buildIntegration()];
      const provider = stubProvider();

      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockRejectedValue(new Error('Network error'));

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('Error collecting analytics for int-1'),
        expect.objectContaining({ error: 'Network error' })
      );
    });

    it('handles error with no message property gracefully', async () => {
      const integrations = [buildIntegration()];
      const provider = stubProvider();

      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockRejectedValue('plain string error');

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('handles empty social integrations list', async () => {
      (integrationService.getIntegrationsList as any).mockResolvedValue([]);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('handles all integrations being non-social', async () => {
      const integrations = [
        buildIntegration({ id: 'a', type: 'article' }),
        buildIntegration({ id: 'b', type: 'rss' }),
      ];
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('handles all integrations being disabled', async () => {
      const integrations = [
        buildIntegration({ id: 'a', disabled: true }),
        buildIntegration({ id: 'b', disabled: true }),
      ];
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('handles token refresh returning false', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integrations = [
        buildIntegration({ tokenExpiration: pastExpiry }),
      ];
      const provider = stubProvider();
      (integrationService.getIntegrationsList as any).mockResolvedValue(integrations);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue(false);

      await activity.collectChannelSnapshots(orgId, daysBack);

      expect(provider.analytics).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // collectPostSnapshots
  // ---------------------------------------------------------------------------
  describe('collectPostSnapshots', () => {
    const orgId = 'org-1';
    const daysBack = 7;

    const buildPost = (overrides: Record<string, any> = {}): Record<string, any> => ({
      id: 'post-1',
      organizationId: orgId,
      releaseId: 'release-1',
      publishDate: dayjs().subtract(1, 'day').toDate(),
      integrationId: 'int-1',
      integration: {
        id: 'int-1',
        providerIdentifier: 'instagram',
        internalId: 'ig-1',
        token: 'ig-token',
        tokenExpiration: null as Date | null,
        organizationId: orgId,
      },
      ...overrides,
    });

    const buildAnalyticsEntry = (label: string, data: { date: string; total: number }[]) => ({
      label,
      data,
    });

    const stubProvider = (overrides: Record<string, any> = {}) => ({
      identifier: 'instagram',
      analytics: vi.fn(),
      postAnalytics: vi.fn(),
      refreshWait: false,
      ...overrides,
    });

    it('calls ensureFresh on ProviderConfigManager', async () => {
      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue([]);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(providerConfigManager.ensureFresh).toHaveBeenCalledOnce();
    });

    it('fetches posts with releaseId not null and publishDate within date range', async () => {
      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue([]);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(analyticsRepository.findPostsForSnapshots).toHaveBeenCalledWith(
        orgId,
        expect.any(Date)
      );
    });

    it('computes since date correctly based on daysBack', async () => {
      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue([]);

      await activity.collectPostSnapshots(orgId, 3);

      const callArgs = (analyticsRepository.findPostsForSnapshots as any).mock.calls[0];
      const sinceDate = callArgs[1];
      const expectedSince = dayjs().subtract(3, 'day').startOf('day');

      expect(sinceDate.getTime()).toBe(expectedSince.toDate().getTime());
    });

    it('skips posts with null releaseId', async () => {
      const posts = [
        buildPost({ id: 'p1', releaseId: null }),
        buildPost({ id: 'p2', releaseId: 'valid-release' }),
      ];
      const provider = stubProvider();
      provider.postAnalytics.mockResolvedValue([]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(provider.postAnalytics).toHaveBeenCalledTimes(1);
      expect(provider.postAnalytics).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'valid-release',
        2,
        expect.anything()
      );
    });

    it('skips posts with releaseId === "missing"', async () => {
      const posts = [
        buildPost({ id: 'p1', releaseId: 'missing' }),
        buildPost({ id: 'p2', releaseId: 'real-release' }),
      ];
      const provider = stubProvider();
      provider.postAnalytics.mockResolvedValue([]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(provider.postAnalytics).toHaveBeenCalledTimes(1);
    });

    it('skips posts without any releaseId', async () => {
      const posts = [
        buildPost({ id: 'p1', releaseId: undefined }),
        buildPost({ id: 'p2', releaseId: undefined }),
      ];
      const provider = stubProvider();

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(provider.postAnalytics).not.toHaveBeenCalled();
    });

    it('uses getSocialIntegrationUnchecked for each post integration', async () => {
      const posts = [
        buildPost({
          id: 'p1',
          releaseId: 'rel-1',
          integration: { providerIdentifier: 'instagram', tokenExpiration: null },
        }),
        buildPost({
          id: 'p2',
          releaseId: 'rel-2',
          integration: { providerIdentifier: 'tiktok', tokenExpiration: null },
        }),
      ];
      const provider = stubProvider();
      provider.postAnalytics.mockResolvedValue([]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(integrationManager.getSocialIntegrationUnchecked).toHaveBeenCalledTimes(2);
      expect(integrationManager.getSocialIntegrationUnchecked).toHaveBeenCalledWith('instagram');
      expect(integrationManager.getSocialIntegrationUnchecked).toHaveBeenCalledWith('tiktok');
    });

    it('skips providers without postAnalytics method', async () => {
      const posts = [buildPost()];
      const provider = stubProvider({ postAnalytics: undefined });

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertPostSnapshot).not.toHaveBeenCalled();
    });

    it('skips null provider from getSocialIntegrationUnchecked', async () => {
      const posts = [buildPost()];

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(null);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertPostSnapshot).not.toHaveBeenCalled();
    });

    it('calls provider.postAnalytics with correct arguments', async () => {
      const posts = [buildPost()];
      const provider = stubProvider();
      provider.postAnalytics.mockResolvedValue([]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(provider.postAnalytics).toHaveBeenCalledWith('ig-1', 'ig-token', 'release-1', 2, expect.anything());
    });

    it('refreshes expired token and uses new token', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const posts = [
        buildPost({
          integration: {
            tokenExpiration: pastExpiry,
            token: 'old-token',
            internalId: 'ig-1',
            providerIdentifier: 'instagram',
            id: 'int-1',
            organizationId: orgId,
          } as Record<string, any>,
        }),
      ];
      const provider = stubProvider();
      provider.postAnalytics.mockResolvedValue([]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue({
        accessToken: 'fresh-token',
      });

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(refreshIntegrationService.refresh).toHaveBeenCalledWith(
        posts[0].integration
      );
      expect(provider.postAnalytics).toHaveBeenCalledWith('ig-1', 'fresh-token', 'release-1', 2, expect.anything());
    });

    it('skips post when token refresh fails', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const posts = [
        buildPost({
          integration: {
            tokenExpiration: pastExpiry,
            token: 'old-token',
            internalId: 'ig-1',
            providerIdentifier: 'instagram',
            id: 'int-1',
            organizationId: orgId,
          } as Record<string, any>,
        }),
      ];
      const provider = stubProvider();

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue(null);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(provider.postAnalytics).not.toHaveBeenCalled();
    });

    it('normalizes metrics and upserts into PostAnalyticsSnapshot', async () => {
      const posts = [buildPost()];
      const provider = stubProvider();
      const date1 = dayjs().subtract(1, 'day').startOf('day').toDate();

      provider.postAnalytics.mockResolvedValue([
        buildAnalyticsEntry('Likes', [
          { date: dayjs(date1).toISOString(), total: 42 },
        ]),
        buildAnalyticsEntry('Comments', [
          { date: dayjs(date1).toISOString(), total: 7 },
        ]),
      ]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any)
        .mockReturnValueOnce('likes')
        .mockReturnValueOnce('comments');

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertPostSnapshot).toHaveBeenCalledTimes(2);

      expect(analyticsRepository.upsertPostSnapshot).toHaveBeenCalledWith({
        organizationId: orgId,
        postId: 'post-1',
        integrationId: 'int-1',
        metric: 'likes',
        value: 42,
        date: date1,
      });

      expect(analyticsRepository.upsertPostSnapshot).toHaveBeenCalledWith({
        organizationId: orgId,
        postId: 'post-1',
        integrationId: 'int-1',
        metric: 'comments',
        value: 7,
        date: date1,
      });
    });

    it('skips entries where normalizeMetric returns undefined for posts', async () => {
      const posts = [buildPost()];
      const provider = stubProvider();
      provider.postAnalytics.mockResolvedValue([
        buildAnalyticsEntry('Unknown Post Metric', [
          { date: dayjs().toISOString(), total: 100 },
        ]),
      ]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any).mockReturnValue(undefined);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertPostSnapshot).not.toHaveBeenCalled();
    });

    it('skips NaN values in post data points', async () => {
      const posts = [buildPost()];
      const provider = stubProvider();
      const validDate = dayjs().subtract(1, 'day').startOf('day').toDate();

      provider.postAnalytics.mockResolvedValue([
        buildAnalyticsEntry('Likes', [
          { date: dayjs(validDate).toISOString(), total: 42 },
          { date: dayjs().toISOString(), total: NaN },
        ]),
      ]);

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any).mockReturnValue('likes');

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertPostSnapshot).toHaveBeenCalledTimes(1);
      expect(analyticsRepository.upsertPostSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ value: 42 })
      );
    });

    it('handles RefreshToken errors gracefully for posts', async () => {
      const posts = [
        buildPost({ id: 'p1', releaseId: 'rel-1' }),
        buildPost({ id: 'p2', releaseId: 'rel-2' }),
      ];
      const provider = stubProvider();

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.postAnalytics
        .mockRejectedValueOnce(new RefreshToken('ig-1', '{}', 'body', 'Token expired'))
        .mockResolvedValueOnce([
          buildAnalyticsEntry('Likes', [{ date: dayjs().toISOString(), total: 5 }]),
        ]);
      (normalizeMetric as any).mockReturnValue('likes');

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(provider.postAnalytics).toHaveBeenCalledTimes(2);
      expect(analyticsRepository.upsertPostSnapshot).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.error).not.toHaveBeenCalled();
    });

    it('handles generic errors for posts by logging and continuing', async () => {
      const posts = [buildPost()];
      const provider = stubProvider();

      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue(posts);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.postAnalytics.mockRejectedValue(new Error('API down'));

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('Error collecting post analytics for post-1'),
        expect.objectContaining({ error: 'API down' })
      );
    });

    it('handles empty posts list', async () => {
      (analyticsRepository.findPostsForSnapshots as any).mockResolvedValue([]);

      await activity.collectPostSnapshots(orgId, daysBack);

      expect(analyticsRepository.upsertPostSnapshot).not.toHaveBeenCalled();
      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // backfillIntegration
  // ---------------------------------------------------------------------------
  describe('backfillIntegration', () => {
    const integrationId = 'int-1';

    const buildIntegration = (overrides: Record<string, any> = {}): Record<string, any> => ({
      id: integrationId,
      type: 'social' as const,
      providerIdentifier: 'facebook',
      internalId: 'fb-page-1',
      organizationId: 'org-1',
      token: 'fb-token',
      tokenExpiration: null as Date | null,
      ...overrides,
    });

    const buildAnalyticsEntry = (label: string, data: { date: string; total: number }[]) => ({
      label,
      data,
    });

    const stubProvider = (overrides: Record<string, any> = {}) => ({
      identifier: 'facebook',
      analytics: vi.fn(),
      postAnalytics: vi.fn(),
      refreshWait: false,
      ...overrides,
    });

    it('calls ensureFresh on ProviderConfigManager for the integration org', async () => {
      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(buildIntegration());

      await activity.backfillIntegration(integrationId);

      // Per-tenant refresh needs the org id, so it runs after the integration
      // is loaded — and is skipped entirely when the integration is absent.
      expect(providerConfigManager.ensureFresh).toHaveBeenCalledOnce();
      expect(providerConfigManager.ensureFresh).toHaveBeenCalledWith('org-1');
    });

    it('fetches integration by ID', async () => {
      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(null);

      await activity.backfillIntegration(integrationId);

      expect(analyticsRepository.findIntegrationByIdRaw).toHaveBeenCalledWith(
        integrationId
      );
    });

    it('returns early when integration is not found', async () => {
      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(null);

      await activity.backfillIntegration(integrationId);

      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('returns early when integration type is not social', async () => {
      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(buildIntegration({ type: 'article' }));

      await activity.backfillIntegration(integrationId);

      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
    });

    it('returns early when provider has no analytics method', async () => {
      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(buildIntegration());
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(
        stubProvider({ analytics: undefined })
      );

      await activity.backfillIntegration(integrationId);

      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('returns early when getSocialIntegrationUnchecked returns null', async () => {
      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(buildIntegration());
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(null);

      await activity.backfillIntegration(integrationId);

      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('calls provider.analytics with 90 days back', async () => {
      const integration = buildIntegration();
      const provider = stubProvider();
      provider.analytics.mockResolvedValue([]);

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);

      await activity.backfillIntegration(integrationId);

      expect(provider.analytics).toHaveBeenCalledWith('fb-page-1', 'fb-token', 90, expect.anything());
    });

    it('refreshes expired token before calling analytics', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integration = buildIntegration({ tokenExpiration: pastExpiry });
      const provider = stubProvider();
      provider.analytics.mockResolvedValue([]);

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue({
        accessToken: 'refreshed-backfill',
      });

      await activity.backfillIntegration(integrationId);

      expect(refreshIntegrationService.refresh).toHaveBeenCalledWith(integration);
      expect(provider.analytics).toHaveBeenCalledWith('fb-page-1', 'refreshed-backfill', 90, expect.anything());
    });

    it('returns early when token refresh fails', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integration = buildIntegration({ tokenExpiration: pastExpiry });
      const provider = stubProvider();

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue(null);

      await activity.backfillIntegration(integrationId);

      expect(provider.analytics).not.toHaveBeenCalled();
    });

    it('waits 10s when provider.refreshWait is true after refresh', async () => {
      const pastExpiry = dayjs().subtract(1, 'day').toDate();
      const integration = buildIntegration({ tokenExpiration: pastExpiry });
      const provider = stubProvider({ refreshWait: true });
      provider.analytics.mockResolvedValue([]);

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (refreshIntegrationService.refresh as any).mockResolvedValue({
        accessToken: 'refreshed-backfill',
      });

      await activity.backfillIntegration(integrationId);

      expect(timer).toHaveBeenCalledWith(10000);
    });

    it('normalizes metrics and upserts into AnalyticsSnapshot', async () => {
      const integration = buildIntegration();
      const provider = stubProvider();
      const date1 = dayjs().subtract(1, 'day').startOf('day').toDate();

      provider.analytics.mockResolvedValue([
        buildAnalyticsEntry('Page Impressions', [
          { date: dayjs(date1).toISOString(), total: 999 },
        ]),
      ]);

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any).mockReturnValue('impressions');

      await activity.backfillIntegration(integrationId);

      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledWith({
        organizationId: 'org-1',
        integrationId,
        metric: 'impressions',
        value: 999,
        date: date1,
      });
    });

    it('skips NaN values during backfill', async () => {
      const integration = buildIntegration();
      const provider = stubProvider();
      const validDate = dayjs().subtract(1, 'day').startOf('day').toDate();

      provider.analytics.mockResolvedValue([
        buildAnalyticsEntry('Page Impressions', [
          { date: dayjs(validDate).toISOString(), total: NaN },
          { date: dayjs(validDate).toISOString(), total: 100 },
        ]),
      ]);

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      (normalizeMetric as any).mockReturnValue('impressions');

      await activity.backfillIntegration(integrationId);

      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledTimes(1);
      expect(analyticsRepository.upsertChannelSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ value: 100 })
      );
    });

    it('handles RefreshToken errors by returning early', async () => {
      const integration = buildIntegration();
      const provider = stubProvider();

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockRejectedValue(
        new RefreshToken('fb-page-1', '{}', 'body', 'Token expired')
      );

      await activity.backfillIntegration(integrationId);

      expect(Logger.prototype.error).not.toHaveBeenCalled();
      expect(analyticsRepository.upsertChannelSnapshot).not.toHaveBeenCalled();
    });

    it('handles generic errors during backfill by logging', async () => {
      const integration = buildIntegration();
      const provider = stubProvider();

      (analyticsRepository.findIntegrationByIdRaw as any).mockResolvedValue(integration);
      (integrationManager.getSocialIntegrationUnchecked as any).mockReturnValue(provider);
      provider.analytics.mockRejectedValue(new Error('Backfill API error'));

      await activity.backfillIntegration(integrationId);

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('Error backfilling int-1'),
        expect.objectContaining({ error: 'Backfill API error' })
      );
    });

    it('imports RefreshToken from the real social.abstract module', () => {
      expect(RefreshToken).toBeDefined();
      const err = new RefreshToken('fb-page-1', '{}', 'body', 'Token expired');
      expect(err).toBeInstanceOf(RefreshToken);
      expect(err.message).toBe('Token expired');
    });
  });

  // ---------------------------------------------------------------------------
  // pruneAndRollupSnapshots
  // ---------------------------------------------------------------------------
  describe('pruneAndRollupSnapshots', () => {
    const old = (date: string, metric: string, value: number, intId = 'int-1') => ({
      integrationId: intId,
      metric,
      value,
      date: new Date(date),
    });

    it('prunes old post snapshots beyond the retention window', async () => {
      await activity.pruneAndRollupSnapshots('org-1');

      const call = (analyticsRepository.deletePostSnapshotsBefore as any).mock
        .calls[0];
      expect(call[0]).toBe('org-1');
      // ~90 days back
      const cutoff = dayjs(call[1]);
      expect(dayjs().diff(cutoff, 'day')).toBeGreaterThanOrEqual(89);
      expect(dayjs().diff(cutoff, 'day')).toBeLessThanOrEqual(91);
    });

    it('honors env overrides for the retention windows', async () => {
      const prevDaily = process.env.ANALYTICS_DAILY_RETENTION_DAYS;
      const prevPost = process.env.ANALYTICS_POST_RETENTION_DAYS;
      process.env.ANALYTICS_DAILY_RETENTION_DAYS = '30';
      process.env.ANALYTICS_POST_RETENTION_DAYS = '7';

      try {
        await activity.pruneAndRollupSnapshots('org-1');

        const postCutoff = dayjs(
          (analyticsRepository.deletePostSnapshotsBefore as any).mock.calls[0][1]
        );
        expect(dayjs().diff(postCutoff, 'day')).toBe(7);

        const dailyCutoff = dayjs(
          (analyticsRepository.findChannelSnapshotsBefore as any).mock.calls[0][1]
        );
        expect(dayjs().diff(dailyCutoff, 'day')).toBe(30);
      } finally {
        process.env.ANALYTICS_DAILY_RETENTION_DAYS = prevDaily;
        process.env.ANALYTICS_POST_RETENTION_DAYS = prevPost;
      }
    });

    it('falls back to defaults when an env override is invalid', async () => {
      const prev = process.env.ANALYTICS_DAILY_RETENTION_DAYS;
      process.env.ANALYTICS_DAILY_RETENTION_DAYS = 'not-a-number';

      try {
        await activity.pruneAndRollupSnapshots('org-1');

        const dailyCutoff = dayjs(
          (analyticsRepository.findChannelSnapshotsBefore as any).mock.calls[0][1]
        );
        // ~548 days default
        expect(dayjs().diff(dailyCutoff, 'day')).toBeGreaterThanOrEqual(547);
        expect(dayjs().diff(dailyCutoff, 'day')).toBeLessThanOrEqual(549);
      } finally {
        process.env.ANALYTICS_DAILY_RETENTION_DAYS = prev;
      }
    });

    it('no-ops the rollup when there are no rows beyond daily retention', async () => {
      (analyticsRepository.findChannelSnapshotsBefore as any).mockResolvedValue([]);

      await activity.pruneAndRollupSnapshots('org-1');

      expect(analyticsRepository.replaceRolledUpSnapshots).not.toHaveBeenCalled();
    });

    it('sums flow metrics per ISO week and replaces daily rows atomically', async () => {
      // Three days in the same ISO week (Mon 2023-01-02 .. Sun 2023-01-08).
      (analyticsRepository.findChannelSnapshotsBefore as any).mockResolvedValue([
        old('2023-01-03', 'impressions', 10),
        old('2023-01-04', 'impressions', 20),
        old('2023-01-06', 'impressions', 30),
      ]);

      await activity.pruneAndRollupSnapshots('org-1');

      // delete + create executed atomically inside the repository
      expect(analyticsRepository.replaceRolledUpSnapshots).toHaveBeenCalledOnce();
      const [orgArg, , weeklyRows] = (
        analyticsRepository.replaceRolledUpSnapshots as any
      ).mock.calls[0];
      expect(orgArg).toBe('org-1');
      expect(weeklyRows).toHaveLength(1);
      const weekly = weeklyRows[0];
      expect(weekly.metric).toBe('impressions');
      expect(weekly.value).toBe(60); // 10 + 20 + 30
      expect(dayjs(weekly.date).format('YYYY-MM-DD')).toBe('2023-01-02'); // Monday
      expect(weekly.organizationId).toBe('org-1');
    });

    it('keeps the latest in-week value for stock metrics instead of summing', async () => {
      (analyticsRepository.findChannelSnapshotsBefore as any).mockResolvedValue([
        old('2023-01-03', 'followers', 1000),
        old('2023-01-06', 'followers', 1050),
        old('2023-01-04', 'followers', 1020),
      ]);

      await activity.pruneAndRollupSnapshots('org-1');

      const weekly = (analyticsRepository.replaceRolledUpSnapshots as any).mock
        .calls[0][2][0];
      expect(weekly.metric).toBe('followers');
      expect(weekly.value).toBe(1050); // latest date (Jan 6), not the sum
    });

    it('separates weeks and integrations into distinct weekly rows', async () => {
      (analyticsRepository.findChannelSnapshotsBefore as any).mockResolvedValue([
        old('2023-01-03', 'impressions', 10, 'int-1'),
        old('2023-01-10', 'impressions', 40, 'int-1'), // next week
        old('2023-01-03', 'impressions', 5, 'int-2'),
      ]);

      await activity.pruneAndRollupSnapshots('org-1');

      const data = (analyticsRepository.replaceRolledUpSnapshots as any).mock
        .calls[0][2];
      expect(data).toHaveLength(3);
    });
  });

  describe('probeWatchedAccounts', () => {
    it('disables unsupported providers instead of recording placeholder metrics', async () => {
      watchlistService.getEnabledAccounts.mockResolvedValue([
        { id: 'wa-1', provider: 'mastodon', handle: '@competitor' },
      ]);

      await activity.probeWatchedAccounts('org-1');

      expect(watchlistService.probeAndRecord).not.toHaveBeenCalled();
      expect(watchlistService.markProbeFailed).toHaveBeenCalledWith(
        'wa-1',
        'org-1',
        'Watchlist probes are not supported for mastodon'
      );
    });

    it('isolates per-account probe failures and marks the account failed', async () => {
      watchlistService.getEnabledAccounts.mockResolvedValue([
        { id: 'wa-1', provider: 'x', handle: 'competitor' },
      ]);
      watchlistService.probeAndRecord.mockRejectedValueOnce(
        new Error('provider rejected probe')
      );

      await activity.probeWatchedAccounts('org-1');

      expect(watchlistService.probeAndRecord).toHaveBeenCalledWith({
        watchedAccountId: 'wa-1',
        organizationId: 'org-1',
        provider: 'x',
        handle: 'competitor',
        metric: 'followers',
      });
      expect(watchlistService.markProbeFailed).toHaveBeenCalledWith(
        'wa-1',
        'org-1',
        'provider rejected probe'
      );
    });
  });
});

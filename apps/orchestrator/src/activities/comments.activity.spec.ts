import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/integrations/provider-config.manager', () => ({
  ProviderConfigManager: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaService: vi.fn(),
}));

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service',
  () => ({ SocialCommentsService: vi.fn() })
);

vi.mock('@temporalio/activity', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  };
});

import { CommentsActivity } from './comments.activity';
import { log } from '@temporalio/activity';

const makePost = (overrides: any = {}) => ({
  id: 'post-1',
  releaseId: 'rel-1',
  integrationId: 'int-1',
  organizationId: 'org-1',
  integration: { id: 'int-1', providerIdentifier: 'mastodon' },
  ...overrides,
});

describe('CommentsActivity', () => {
  let activity: CommentsActivity;
  let prisma: any;
  let providerConfigManager: any;
  let socialCommentsService: any;

  beforeEach(() => {
    vi.resetAllMocks();

    prisma = {
      socialComment: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      post: { findMany: vi.fn().mockResolvedValue([]) },
      organization: {
        findMany: vi.fn().mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
      },
    };
    providerConfigManager = { ensureFresh: vi.fn().mockResolvedValue(undefined) };
    socialCommentsService = { syncComments: vi.fn().mockResolvedValue(undefined) };

    activity = new CommentsActivity(prisma, providerConfigManager, socialCommentsService);
  });

  afterEach(() => {
    delete process.env.COMMENTS_SWEEP_INTERVAL_MINUTES;
    delete process.env.SOCIAL_COMMENT_RETENTION_DAYS;
  });

  describe('getSweepIntervalMinutes', () => {
    it('defaults to 30', async () => {
      expect(await activity.getSweepIntervalMinutes()).toBe(30);
    });
    it('honors a valid env override', async () => {
      process.env.COMMENTS_SWEEP_INTERVAL_MINUTES = '45';
      expect(await activity.getSweepIntervalMinutes()).toBe(45);
    });
    it('falls back to 30 on invalid env', async () => {
      process.env.COMMENTS_SWEEP_INTERVAL_MINUTES = 'nonsense';
      expect(await activity.getSweepIntervalMinutes()).toBe(30);
    });
  });

  describe('getAllOrganizationIds', () => {
    it('maps org rows to ids', async () => {
      expect(await activity.getAllOrganizationIds()).toEqual(['org-1', 'org-2']);
    });
  });

  describe('pruneComments', () => {
    it('soft-deletes comments older than the retention window', async () => {
      prisma.socialComment.findMany.mockResolvedValueOnce([
        { id: 'c1' },
        { id: 'c2' },
      ]).mockResolvedValueOnce([]);

      await activity.pruneComments('org-1');
      expect(prisma.socialComment.findMany).toHaveBeenCalled();
      const updateCall = prisma.socialComment.updateMany.mock.calls[0][0];
      expect(updateCall.where.id.in).toEqual(['c1', 'c2']);
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
    });

    it('handles empty result without error', async () => {
      await activity.pruneComments('org-1');
      expect(prisma.socialComment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('syncPostComments', () => {
    it('ensures provider config is fresh', async () => {
      await activity.syncPostComments('org-1', 30);
      expect(providerConfigManager.ensureFresh).toHaveBeenCalled();
    });

    it('skips posts with missing releaseId and delegates the rest to the service', async () => {
      prisma.post.findMany.mockResolvedValue([
        makePost({ id: 'p1' }),
        makePost({ id: 'p2', releaseId: 'missing' }),
        makePost({ id: 'p3', releaseId: null }),
      ]);

      await activity.syncPostComments('org-1', 30);

      expect(socialCommentsService.syncComments).toHaveBeenCalledTimes(1);
      expect(socialCommentsService.syncComments).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ id: 'p1' })
      );
    });

    it('isolates per-post failures so one channel cannot abort the org sweep', async () => {
      prisma.post.findMany.mockResolvedValue([
        makePost({ id: 'p1' }),
        makePost({ id: 'p2' }),
      ]);
      socialCommentsService.syncComments
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);

      await activity.syncPostComments('org-1', 30);

      expect(socialCommentsService.syncComments).toHaveBeenCalledTimes(2);
      expect(log.error).toHaveBeenCalled();
    });
  });
});

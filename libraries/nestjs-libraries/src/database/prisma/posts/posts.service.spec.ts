import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.repository', () => ({
  PostsRepository: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/analytics/analytics.repository', () => ({
  AnalyticsRepository: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({
  MediaService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/storage/storage.service', () => ({
  StorageService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/integrations/refresh.integration.service', () => ({
  RefreshIntegrationService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: { send: vi.fn() },
  isInngestEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock('@gitroom/nestjs-libraries/ai/governance/rag.service', () => ({
  RagService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    jpeg: vi.fn().mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-jpeg-data')),
    }),
  }),
}));

vi.mock('@gitroom/helpers/utils/has.extension', () => ({
  hasExtension: vi.fn(),
}));

vi.mock('@gitroom/helpers/utils/read.or.fetch', () => ({
  readOrFetch: vi.fn(),
}));

import { PostsService } from './posts.service';
import { AnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics.repository';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { readOrFetch } from '@gitroom/helpers/utils/read.or.fetch';
import {
  inngest,
  isInngestEnabled,
} from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { State } from '@prisma/client';

describe('PostsService.enrichPostsWithLatestStats', () => {
  let service: PostsService;
  let analyticsRepository: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.mocked(isInngestEnabled).mockReturnValue(true);
    vi.clearAllMocks();

    analyticsRepository = {
      getLatestPostSnapshotsByPostIds: vi.fn().mockResolvedValue([]),
    };

    service = new PostsService(
      {} as any,
      analyticsRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const publishedPost = (overrides: Record<string, any> = {}) => ({
    id: 'post-1',
    state: 'PUBLISHED',
    releaseId: 'release-abc',
    lastViews: null,
    lastLikes: null,
    lastComments: null,
    integration: { providerIdentifier: 'youtube' },
    ...overrides,
  });

  it('backfills lastViews/lastLikes/lastComments from snapshots', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([
      { postId: 'post-1', metric: 'views', value: 150 },
      { postId: 'post-1', metric: 'likes', value: 25 },
      { postId: 'post-1', metric: 'comments', value: 7 },
    ]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(posts[0].lastViews).toBe(150);
    expect(posts[0].lastLikes).toBe(25);
    expect(posts[0].lastComments).toBe(7);
  });

  it('only takes the latest snapshot per metric (first seen = latest by desc date)', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([
      { postId: 'post-1', metric: 'views', value: 150 },
      { postId: 'post-1', metric: 'views', value: 100 },
    ]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(posts[0].lastViews).toBe(150);
  });

  it('does not change post when no snapshot exists', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(posts[0].lastViews).toBeNull();
    expect(posts[0].lastLikes).toBeNull();
    expect(posts[0].lastComments).toBeNull();
  });

  it('skips posts where lastViews/lastLikes/lastComments already have values', async () => {
    const posts = [publishedPost({ lastViews: 10, lastLikes: 2, lastComments: 1 })];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(analyticsRepository.getLatestPostSnapshotsByPostIds).not.toHaveBeenCalled();
  });

  it('skips non-PUBLISHED posts', async () => {
    const posts = [publishedPost({ state: 'DRAFT' })];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(analyticsRepository.getLatestPostSnapshotsByPostIds).not.toHaveBeenCalled();
  });

  it('skips posts with releaseId === "missing"', async () => {
    const posts = [publishedPost({ releaseId: 'missing' })];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(analyticsRepository.getLatestPostSnapshotsByPostIds).not.toHaveBeenCalled();
  });

  it('skips posts with null releaseId', async () => {
    const posts = [publishedPost({ releaseId: null })];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(analyticsRepository.getLatestPostSnapshotsByPostIds).not.toHaveBeenCalled();
  });

  it('never throws on snapshot query failure', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockRejectedValue(new Error('DB down'));

    const posts = [publishedPost()];
    await expect(
      service.enrichPostsWithLatestStats('org-1', posts)
    ).resolves.toBeUndefined();

    expect(posts[0].lastViews).toBeNull();
  });

  it('respects disableXAnalytics for X posts', async () => {
    const prev = process.env.DISABLE_X_ANALYTICS;
    process.env.DISABLE_X_ANALYTICS = 'true';

    const posts = [publishedPost({ integration: { providerIdentifier: 'x' } })];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(analyticsRepository.getLatestPostSnapshotsByPostIds).not.toHaveBeenCalled();

    process.env.DISABLE_X_ANALYTICS = prev;
  });

  it('enriches X posts when disableXAnalytics is not set', async () => {
    const prev = process.env.DISABLE_X_ANALYTICS;
    delete process.env.DISABLE_X_ANALYTICS;

    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([
      { postId: 'post-1', metric: 'likes', value: 50 },
    ]);

    const posts = [publishedPost({ integration: { providerIdentifier: 'x' } })];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(posts[0].lastLikes).toBe(50);

    process.env.DISABLE_X_ANALYTICS = prev;
  });

  it('does nothing for empty posts array', async () => {
    await service.enrichPostsWithLatestStats('org-1', []);
    expect(analyticsRepository.getLatestPostSnapshotsByPostIds).not.toHaveBeenCalled();
  });

  // ── M4: Live-fallback tier for posts missing metrics after snapshot pass ──

  it('calls checkPostAnalytics for posts with no snapshot metrics (live fallback)', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([]);
    // Real AnalyticsData shape ({ label, data: [{ total, date }] }); provider 'youtube'
    // maps labels Views/Likes -> canonical views/likes via PROVIDER_METRIC_MAP.
    const checkSpy = vi.spyOn(service as any, 'checkPostAnalytics').mockResolvedValue([
      { label: 'Views', data: [{ total: '200', date: '2026-06-09' }] },
      { label: 'Likes', data: [{ total: '30', date: '2026-06-09' }] },
    ]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(checkSpy).toHaveBeenCalledWith('org-1', 'post-1', expect.any(Number));
    expect(posts[0].lastViews).toBe(200);
    expect(posts[0].lastLikes).toBe(30);
    checkSpy.mockRestore();
  });

  it('picks the latest data point per metric in the live fallback', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([]);
    const checkSpy = vi.spyOn(service as any, 'checkPostAnalytics').mockResolvedValue([
      {
        label: 'Views',
        data: [
          { total: '100', date: '2026-06-07' },
          { total: '250', date: '2026-06-09' },
          { total: '180', date: '2026-06-08' },
        ],
      },
    ]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(posts[0].lastViews).toBe(250);
    checkSpy.mockRestore();
  });

  it('ignores unmappable labels and non-numeric totals in the live fallback', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([]);
    const checkSpy = vi.spyOn(service as any, 'checkPostAnalytics').mockResolvedValue([
      { label: 'Some Unknown Metric', data: [{ total: '999', date: '2026-06-09' }] },
      { label: 'Views', data: [{ total: 'not-a-number', date: '2026-06-09' }] },
    ]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(posts[0].lastViews).toBeNull();
    checkSpy.mockRestore();
  });

  it('does not call live fallback when snapshot metrics are present', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([
      { postId: 'post-1', metric: 'views', value: 150 },
      { postId: 'post-1', metric: 'likes', value: 25 },
    ]);
    const checkSpy = vi.spyOn(service as any, 'checkPostAnalytics').mockResolvedValue([]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(checkSpy).not.toHaveBeenCalled();
    checkSpy.mockRestore();
  });

  it('skips live fallback for posts that have any snapshot metric (not fully missing)', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([
      { postId: 'post-1', metric: 'views', value: 100 },
    ]);
    const checkSpy = vi.spyOn(service as any, 'checkPostAnalytics').mockResolvedValue([]);

    const posts = [publishedPost()];
    await service.enrichPostsWithLatestStats('org-1', posts);

    // views came from snapshot; post has a metric present so live fallback is skipped
    expect(posts[0].lastViews).toBe(100);
    expect(checkSpy).not.toHaveBeenCalled();
    checkSpy.mockRestore();
  });

  it('caps live fallback fan-out at 10 posts', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([]);
    const checkSpy = vi.spyOn(service as any, 'checkPostAnalytics').mockResolvedValue([]);

    const posts = Array.from({ length: 15 }, (_, i) => publishedPost({ id: `post-${i + 10}` }));
    await service.enrichPostsWithLatestStats('org-1', posts);

    expect(checkSpy).toHaveBeenCalledTimes(10);
    checkSpy.mockRestore();
  });

  it('does not reject batch when a single live fallback throws', async () => {
    analyticsRepository.getLatestPostSnapshotsByPostIds.mockResolvedValue([]);
    let callCount = 0;
    const checkSpy = vi.spyOn(service as any, 'checkPostAnalytics').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('API down');
      return [{ label: 'Views', data: [{ total: '50', date: '2026-06-09' }] }];
    });

    const posts = [
      publishedPost({ id: 'post-fail' }),
      publishedPost({ id: 'post-ok' }),
    ];
    await expect(service.enrichPostsWithLatestStats('org-1', posts)).resolves.toBeUndefined();
    // The second post should still get enriched
    expect(posts[1].lastViews).toBe(50);
    checkSpy.mockRestore();
  });
});

describe('PostsService.updateMedia', () => {
  let service: PostsService;
  let storageServiceMock: { getLocalAdapterForOrg: ReturnType<typeof vi.fn> };
  let postRepositoryMock: { updateImages: ReturnType<typeof vi.fn> };
  let mockAdapter: { uploadFile: ReturnType<typeof vi.fn> };

  const pngImageItem = (overrides: Record<string, any> = {}) => ({
    path: '/local/images/test.png',
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(isInngestEnabled).mockReturnValue(true);
    vi.clearAllMocks();

    mockAdapter = {
      uploadFile: vi.fn().mockResolvedValue({
        path: '/uploads/test.jpg',
        originalname: 'test.jpg',
      }),
    };

    storageServiceMock = {
      getLocalAdapterForOrg: vi.fn().mockResolvedValue(mockAdapter),
    };

    postRepositoryMock = {
      updateImages: vi.fn().mockResolvedValue(undefined),
    };

    process.env.UPLOAD_DIRECTORY = '/uploads';
    process.env.FRONTEND_URL = 'http://localhost:4200';
    process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY = 'static';

    vi.mocked(hasExtension).mockReturnValue(true);
    vi.mocked(readOrFetch).mockResolvedValue(Buffer.from('mock-png-data'));

    service = new PostsService(
      postRepositoryMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      storageServiceMock as any,
    );
  });

  afterEach(() => {
    delete process.env.UPLOAD_DIRECTORY;
    delete process.env.FRONTEND_URL;
    delete process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY;
  });

  it('calls getLocalAdapterForOrg when orgId is provided and convertToJPEG is true for a PNG image', async () => {
    const imagesList = [pngImageItem()];

    await service.updateMedia('post-123', imagesList, true, 'org-42');

    expect(storageServiceMock.getLocalAdapterForOrg).toHaveBeenCalledWith('org-42', true);
    expect(mockAdapter.uploadFile).toHaveBeenCalled();
    expect(postRepositoryMock.updateImages).toHaveBeenCalled();
  });

  it('does not call getLocalAdapterForOrg when convertToJPEG is false', async () => {
    const imagesList = [pngImageItem()];

    await service.updateMedia('post-123', imagesList, false, 'org-42');

    expect(storageServiceMock.getLocalAdapterForOrg).not.toHaveBeenCalled();
  });
});

describe('PostsService Inngest dispatch', () => {
  let service: PostsService;
  let postRepositoryMock: { deletePost: ReturnType<typeof vi.fn> };
  let integrationManagerMock: {
    getSocialIntegrationUnchecked: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.mocked(isInngestEnabled).mockReturnValue(true);
    vi.clearAllMocks();
    vi.mocked(inngest.send).mockResolvedValue(undefined);

    postRepositoryMock = {
      deletePost: vi.fn().mockResolvedValue({ id: 'post-123' }),
    };

    integrationManagerMock = {
      getSocialIntegrationUnchecked: vi.fn().mockReturnValue({
        maxConcurrentJob: 3,
      }),
    };

    service = new PostsService(
      postRepositoryMock as any,
      {} as any,
      integrationManagerMock as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('deletePost emits post/cancel with the deleted post id', async () => {
    await service.deletePost('org-1', 'group-1');

    expect(postRepositoryMock.deletePost).toHaveBeenCalledWith('org-1', 'group-1');
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'post/cancel',
      data: { postId: 'post-123' },
    });
  });

  it('deletePost swallows inngest.send errors and still returns error:true', async () => {
    vi.mocked(inngest.send).mockRejectedValue(new Error('Inngest down'));

    const result = await service.deletePost('org-1', 'group-1');

    expect(inngest.send).toHaveBeenCalled();
    expect(result).toEqual({ error: true });
  });

  it('startWorkflow emits post/publish with idempotency id and current payload fields', async () => {
    await service.startWorkflow('youtube', 'post-456', 'org-2', 'QUEUE' as State);

    expect(inngest.send).toHaveBeenCalledWith({
      name: 'post/publish',
      data: {
        postId: 'post-456',
        organizationId: 'org-2',
        taskQueue: 'youtube',
        maxConcurrentJob: 3,
      },
      id: 'post_post-456',
    });
  });

  it('startWorkflow emits post/cancel before post/publish', async () => {
    await service.startWorkflow('linkedin', 'post-789', 'org-3', 'QUEUE' as State);

    expect(inngest.send).toHaveBeenCalledTimes(2);
    expect(vi.mocked(inngest.send).mock.calls[0][0]).toMatchObject({
      name: 'post/cancel',
      data: { postId: 'post-789' },
    });
    expect(vi.mocked(inngest.send).mock.calls[1][0]).toMatchObject({
      name: 'post/publish',
      data: { postId: 'post-789', taskQueue: 'linkedin', maxConcurrentJob: 3 },
    });
  });

  it('startWorkflow returns early for DRAFT state after sending cancel', async () => {
    await service.startWorkflow('youtube', 'post-draft', 'org-4', 'DRAFT' as State);

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith({
      name: 'post/cancel',
      data: { postId: 'post-draft' },
    });
  });

  it('deletePost skips inngest.send when Inngest is disabled', async () => {
    vi.mocked(isInngestEnabled).mockReturnValue(false);

    await service.deletePost('org-1', 'group-1');

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('startWorkflow skips all events when Inngest is disabled', async () => {
    vi.mocked(isInngestEnabled).mockReturnValue(false);

    await service.startWorkflow('youtube', 'post-456', 'org-2', 'QUEUE' as State);

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('startWorkflow resolves taskQueue from providerIdentifier.split("-")[0]', async () => {
    integrationManagerMock.getSocialIntegrationUnchecked.mockReturnValue({
      maxConcurrentJob: 2,
    });

    await service.startWorkflow('linkedin-page', 'post-page', 'org-5', 'QUEUE' as State);

    expect(integrationManagerMock.getSocialIntegrationUnchecked).toHaveBeenCalledWith(
      'linkedin-page'
    );
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'post/publish',
        data: expect.objectContaining({
          taskQueue: 'linkedin',
          maxConcurrentJob: 2,
        }),
      })
    );
  });

  it('startWorkflow defaults maxConcurrentJob to 1 when provider is not found', async () => {
    integrationManagerMock.getSocialIntegrationUnchecked.mockReturnValue(undefined);

    await service.startWorkflow('unknown-provider', 'post-unknown', 'org-6', 'QUEUE' as State);

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'post/publish',
        data: expect.objectContaining({
          taskQueue: 'unknown',
          maxConcurrentJob: 1,
        }),
      })
    );
  });
});

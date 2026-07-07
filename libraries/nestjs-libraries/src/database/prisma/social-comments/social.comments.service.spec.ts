import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';

vi.mock('@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.repository', () => ({
  SocialCommentsRepository: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.repository', () => ({
  PostsRepository: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/integrations/refresh.integration.service', () => ({
  RefreshIntegrationService: vi.fn(),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: vi.fn(),
}));

vi.mock('@gitroom/helpers/utils/timer', () => ({
  timer: vi.fn().mockResolvedValue(undefined),
}));

import { SocialCommentsService } from './social.comments.service';
import { timer } from '@gitroom/helpers/utils/timer';

describe('SocialCommentsService', () => {
  let service: SocialCommentsService;
  let socialCommentsRepo: Record<string, ReturnType<typeof vi.fn>>;
  let postsRepo: Record<string, ReturnType<typeof vi.fn>>;
  let prismaService: Record<string, ReturnType<typeof vi.fn>>;
  let integrationManager: Record<string, ReturnType<typeof vi.fn>>;
  let refreshIntegrationService: Record<string, ReturnType<typeof vi.fn>>;
  let integrationService: Record<string, ReturnType<typeof vi.fn>>;
  let webhooksService: Record<string, ReturnType<typeof vi.fn>>;
  let orgProviderConfigManager: Record<string, ReturnType<typeof vi.fn>>;

  const orgId = 'org-1';
  const userId = 'user-1';
  const postId = 'post-1';

  const basePost = {
    id: 'post-1',
    releaseId: 'release-yt-1',
    integrationId: 'integration-1',
    organizationId: 'org-1',
    integration: {
      id: 'integration-1',
      providerIdentifier: 'youtube',
      token: 'valid-token',
      tokenExpiration: dayjs().add(30, 'day').toDate(),
      internalId: 'yt-channel-1',
      organizationId: 'org-1',
      refreshWait: false,
    },
  };

  const baseComment = {
    id: 'comment-1',
    postId: 'post-1',
    integrationId: 'integration-1',
    platformCommentId: 'yt-comment-abc',
    platformCreatedAt: new Date('2024-01-15T10:00:00Z'),
    authorId: 'yt-user-123',
    authorName: 'John Doe',
    authorUsername: '@johndoe',
    authorPicture: 'https://yt.com/avatar.jpg',
    content: 'Great post!',
    likeCount: 10,
    replyCount: 2,
    likedByMe: false,
    isOwn: false,
    organizationId: 'org-1',
  };

  const mockProvider = {
    replyToComment: vi.fn(),
    likeComment: vi.fn(),
    fetchComments: vi.fn(),
    refreshWait: false,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    socialCommentsRepo = {
      getComments: vi.fn(),
      getCommentById: vi.fn(),
      upsertComment: vi.fn(),
      countComments: vi.fn(),
      getUnreadCount: vi.fn(),
      upsertReadState: vi.fn(),
      getActiveCommentIds: vi.fn().mockResolvedValue([]),
      softDeleteCommentsByIds: vi.fn().mockResolvedValue({ count: 0 }),
      updateCommentStatus: vi.fn(),
      assignComment: vi.fn(),
      isOrganizationMember: vi.fn(),
    };

    postsRepo = {
      getPostById: vi.fn(),
      updateCommentCount: vi.fn().mockResolvedValue(undefined),
    };

    prismaService = {
      post: {
        update: vi.fn(),
      },
    };

    integrationManager = {
      getSocialIntegrationUnchecked: vi.fn(),
      requireClientInformation: vi.fn().mockResolvedValue({ client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' }),
    };

    refreshIntegrationService = {
      refresh: vi.fn(),
    };

    integrationService = {
      disconnectChannel: vi.fn(),
    };

    webhooksService = {
      dispatchEvent: vi.fn().mockResolvedValue(undefined),
    };

    orgProviderConfigManager = {
      ensureFresh: vi.fn().mockResolvedValue(undefined),
    };

    service = new SocialCommentsService(
      socialCommentsRepo as any,
      postsRepo as any,
      integrationManager as any,
      refreshIntegrationService as any,
      integrationService as any,
      webhooksService as any,
      orgProviderConfigManager as any,
    );
  });

  describe('getComments', () => {
    it('returns comments with pagination info', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      const comments = [
        { ...baseComment, id: 'c1', platformCreatedAt: new Date('2024-01-16T10:00:00Z') },
        { ...baseComment, id: 'c2', platformCreatedAt: new Date('2024-01-15T10:00:00Z') },
      ];
      socialCommentsRepo.getComments.mockResolvedValue(comments);
      socialCommentsRepo.getUnreadCount.mockResolvedValue(3);

      const result = await service.getComments(orgId, userId, postId);

      expect(postsRepo.getPostById).toHaveBeenCalledWith(postId, orgId);
      expect(socialCommentsRepo.getComments).toHaveBeenCalledWith(postId, undefined);
      expect(socialCommentsRepo.getUnreadCount).toHaveBeenCalledWith(userId, postId);
      expect(result).toEqual({ comments, nextCursor: undefined, unreadCount: 3 });
    });

    it('returns empty when post releaseId is null', async () => {
      postsRepo.getPostById.mockResolvedValue({ ...basePost, releaseId: null });

      const result = await service.getComments(orgId, userId, postId);

      expect(result).toEqual({ comments: [], nextCursor: undefined, unreadCount: 0 });
    });

    it('returns empty when post releaseId is "missing"', async () => {
      postsRepo.getPostById.mockResolvedValue({ ...basePost, releaseId: 'missing' });

      const result = await service.getComments(orgId, userId, postId);

      expect(result).toEqual({ comments: [], nextCursor: undefined, unreadCount: 0 });
    });

    it('handles cursor pagination beyond 50 items', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      const now = Date.UTC(2024, 0, 31, 23, 59, 0);
      const comments = Array.from({ length: 51 }, (_, i) => ({
        ...baseComment,
        id: `c${i}`,
        platformCreatedAt: new Date(now - i * 60000),
      }));
      socialCommentsRepo.getComments.mockResolvedValue(comments);
      socialCommentsRepo.getUnreadCount.mockResolvedValue(0);

      const result = await service.getComments(orgId, userId, postId, 'cursor-value');

      expect(socialCommentsRepo.getComments).toHaveBeenCalledWith(postId, 'cursor-value');
      expect(result.comments).toHaveLength(50);
      expect(result.nextCursor).toBe(comments[49].platformCreatedAt.toISOString());
      expect(result.unreadCount).toBe(0);
    });

    it('throws BadRequestException when post is not found', async () => {
      postsRepo.getPostById.mockResolvedValue(null);

      await expect(
        service.getComments(orgId, userId, postId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('replyToPost', () => {
    const message = 'Nice content!';

    it('calls provider and upserts the reply comment', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);

      const replyResult = {
        platformCommentId: 'yt-reply-1',
        author: { id: 'author-1', name: 'Me', username: '@me', picture: 'https://pic.com/me.jpg' },
        content: message,
        likeCount: 0,
        replyCount: 0,
        likedByMe: false,
        createdAt: new Date().toISOString(),
      };
      mockProvider.replyToComment.mockResolvedValue(replyResult);
      socialCommentsRepo.upsertComment.mockResolvedValue({ id: 'upserted-1' });

      const result = await service.replyToPost(orgId, userId, postId, message);

      expect(integrationManager.getSocialIntegrationUnchecked).toHaveBeenCalledWith('youtube');
      expect(mockProvider.replyToComment).toHaveBeenCalledWith(
        basePost.integration.internalId,
        basePost.integration.token,
        basePost.releaseId,
        basePost.releaseId,
        message,
        basePost.integration,
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          postId,
          platformCommentId: 'yt-reply-1',
          parentPlatformCommentId: undefined,
          isOwn: true,
        })
      );
      expect(result).toEqual(replyResult);
    });

    it('throws when post has no releaseId', async () => {
      postsRepo.getPostById.mockResolvedValue({ ...basePost, releaseId: null });

      await expect(
        service.replyToPost(orgId, userId, postId, message)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when post releaseId is "missing"', async () => {
      postsRepo.getPostById.mockResolvedValue({ ...basePost, releaseId: 'missing' });

      await expect(
        service.replyToPost(orgId, userId, postId, message)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when provider does not support replyToComment', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue({} as any);

      await expect(
        service.replyToPost(orgId, userId, postId, message)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws and does not persist when the provider returns an empty platformCommentId (swallowed failure)', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      mockProvider.replyToComment.mockResolvedValue({
        platformCommentId: '',
        author: { id: '', name: '', username: '' },
        content: message,
        createdAt: new Date().toISOString(),
      });

      await expect(
        service.replyToPost(orgId, userId, postId, message)
      ).rejects.toThrow(BadRequestException);
      expect(socialCommentsRepo.upsertComment).not.toHaveBeenCalled();
    });

    it('refreshes expired token and uses new token', async () => {
      const expiredPost = {
        ...basePost,
        integration: {
          ...basePost.integration,
          tokenExpiration: dayjs().subtract(1, 'day').toDate(),
        },
      };
      postsRepo.getPostById.mockResolvedValue(expiredPost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      refreshIntegrationService.refresh.mockResolvedValue({ accessToken: 'new-token' });

      mockProvider.replyToComment.mockResolvedValue({
        platformCommentId: 'r1',
        author: { id: 'a1', name: 'Me', username: '@me', picture: 'pic' },
        content: message,
        likeCount: 0,
        replyCount: 0,
        likedByMe: false,
        createdAt: new Date().toISOString(),
      });

      await service.replyToPost(orgId, userId, postId, message);

      expect(refreshIntegrationService.refresh).toHaveBeenCalledWith(expiredPost.integration);
      expect(mockProvider.replyToComment).toHaveBeenCalledWith(
        expect.anything(),
        'new-token',
        expect.anything(),
        expect.anything(),
        message,
        expect.anything(),
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
    });

    it('disconnects and throws when token refresh returns no accessToken', async () => {
      const expiredPost = {
        ...basePost,
        integration: {
          ...basePost.integration,
          tokenExpiration: dayjs().subtract(1, 'day').toDate(),
        },
      };
      postsRepo.getPostById.mockResolvedValue(expiredPost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      refreshIntegrationService.refresh.mockResolvedValue({ accessToken: null });

      await expect(
        service.replyToPost(orgId, userId, postId, message)
      ).rejects.toThrow(BadRequestException);

      expect(integrationService.disconnectChannel).toHaveBeenCalledWith(
        expiredPost.integration.organizationId,
        expiredPost.integration,
      );
    });

    it('waits 10s when provider.refreshWait is true after token refresh', async () => {
      const providerWithWait = { ...mockProvider, refreshWait: true } as any;
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(providerWithWait);
      postsRepo.getPostById.mockResolvedValue({
        ...basePost,
        integration: {
          ...basePost.integration,
          tokenExpiration: dayjs().subtract(1, 'day').toDate(),
        },
      });
      refreshIntegrationService.refresh.mockResolvedValue({ accessToken: 'refreshed' });
      providerWithWait.replyToComment.mockResolvedValue({
        platformCommentId: 'r1',
        author: { id: 'a1', name: 'Me', username: '@me', picture: 'p' },
        content: message,
        likeCount: 0,
        replyCount: 0,
        likedByMe: false,
      });

      await service.replyToPost(orgId, userId, postId, message);

      expect(timer).toHaveBeenCalledWith(10000);
    });

    it('retries when provider throws RefreshToken', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const refreshError = new RefreshToken('yt', '{}', '{}', 'refresh needed');
      const successResult = {
        platformCommentId: 'retry-reply',
        author: { id: 'a1', name: 'Me', username: '@me', picture: 'pic' },
        content: message,
        likeCount: 0,
        replyCount: 0,
        likedByMe: false,
        createdAt: new Date().toISOString(),
      };
      mockProvider.replyToComment
        .mockRejectedValueOnce(refreshError)
        .mockResolvedValueOnce(successResult);

      const result = await service.replyToPost(orgId, userId, postId, message);

      expect(mockProvider.replyToComment).toHaveBeenCalledTimes(2);
      expect(result).toEqual(successResult);
    });

    it('does not retry twice on consecutive RefreshToken errors', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const refreshError = new RefreshToken('yt', '{}', '{}', 'refresh needed');
      mockProvider.replyToComment.mockRejectedValue(refreshError);

      await expect(
        service.replyToPost(orgId, userId, postId, message, true)
      ).rejects.toThrow(RefreshToken);

      expect(mockProvider.replyToComment).toHaveBeenCalledTimes(1);
    });
  });

  describe('replyToComment', () => {
    const commentId = 'comment-1';
    const message = 'Great reply!';

    it('validates comment exists and calls provider replyToComment', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);

      const replyResult = {
        platformCommentId: 'yt-reply-to-comment',
        author: { id: 'a1', name: 'Me', username: '@me', picture: 'pic' },
        content: message,
        likeCount: 0,
        replyCount: 0,
        likedByMe: false,
        createdAt: new Date().toISOString(),
      };
      mockProvider.replyToComment.mockResolvedValue(replyResult);

      const result = await service.replyToComment(orgId, userId, postId, commentId, message);

      expect(socialCommentsRepo.getCommentById).toHaveBeenCalledWith(commentId, orgId);
      expect(mockProvider.replyToComment).toHaveBeenCalledWith(
        basePost.integration.internalId,
        basePost.integration.token,
        basePost.releaseId,
        baseComment.platformCommentId,
        message,
        basePost.integration,
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledWith(
        expect.objectContaining({
          parentPlatformCommentId: baseComment.platformCommentId,
          platformCommentId: 'yt-reply-to-comment',
          isOwn: true,
        })
      );
      expect(result).toEqual(replyResult);
    });

    it('throws when comment is not found', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(null);

      await expect(
        service.replyToComment(orgId, userId, postId, commentId, message)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when comment belongs to a different post', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue({
        ...baseComment,
        postId: 'other-post',
      });

      await expect(
        service.replyToComment(orgId, userId, postId, commentId, message)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when post has no releaseId', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      postsRepo.getPostById.mockResolvedValue({ ...basePost, releaseId: null });

      await expect(
        service.replyToComment(orgId, userId, postId, commentId, message)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws and does not persist when the provider returns an empty platformCommentId (swallowed failure)', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      mockProvider.replyToComment.mockResolvedValue({
        platformCommentId: '',
        author: { id: '', name: '', username: '' },
        content: message,
        createdAt: new Date().toISOString(),
      });

      await expect(
        service.replyToComment(orgId, userId, postId, commentId, message)
      ).rejects.toThrow(BadRequestException);
      expect(socialCommentsRepo.upsertComment).not.toHaveBeenCalled();
    });
  });

  describe('likeComment', () => {
    const commentId = 'comment-1';

    it('validates comment and calls provider likeComment', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);

      const likeResult = { likeCount: 11, liked: true };
      mockProvider.likeComment.mockResolvedValue(likeResult);
      socialCommentsRepo.upsertComment.mockResolvedValue({ id: 'updated' });

      const result = await service.likeComment(orgId, userId, postId, commentId, true);

      expect(mockProvider.likeComment).toHaveBeenCalledWith(
        basePost.integration.internalId,
        basePost.integration.token,
        basePost.releaseId,
        baseComment.platformCommentId,
        true,
        basePost.integration,
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledWith(
        expect.objectContaining({
          platformCommentId: baseComment.platformCommentId,
          likeCount: 11,
          likedByMe: true,
        })
      );
      expect(result).toEqual(likeResult);
    });

    it('throws when comment is not found', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(null);

      await expect(
        service.likeComment(orgId, userId, postId, commentId, true)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when comment belongs to a different post', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue({
        ...baseComment,
        postId: 'other-post',
      });

      await expect(
        service.likeComment(orgId, userId, postId, commentId, true)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when post has no releaseId', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      postsRepo.getPostById.mockResolvedValue({ ...basePost, releaseId: null });

      await expect(
        service.likeComment(orgId, userId, postId, commentId, true)
      ).rejects.toThrow(BadRequestException);
    });

    it('retries on RefreshToken error', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);

      const refreshError = new RefreshToken('yt', '{}', '{}', 'refresh');
      mockProvider.likeComment
        .mockRejectedValueOnce(refreshError)
        .mockResolvedValueOnce({ likeCount: 11, liked: true });

      await service.likeComment(orgId, userId, postId, commentId, true);

      expect(mockProvider.likeComment).toHaveBeenCalledTimes(2);
    });

    it('does not retry when already retried once', async () => {
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      postsRepo.getPostById.mockResolvedValue(basePost);
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);

      const refreshError = new RefreshToken('yt', '{}', '{}', 'refresh');
      mockProvider.likeComment.mockRejectedValue(refreshError);

      await expect(
        service.likeComment(orgId, userId, postId, commentId, true, true)
      ).rejects.toThrow(RefreshToken);

      expect(mockProvider.likeComment).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAsRead', () => {
    it('gets post and upserts read state', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      socialCommentsRepo.upsertReadState.mockResolvedValue({
        userId,
        postId,
        lastReadAt: expect.any(Date),
      });

      const result = await service.markAsRead(orgId, userId, postId);

      expect(postsRepo.getPostById).toHaveBeenCalledWith(postId, orgId);
      expect(socialCommentsRepo.upsertReadState).toHaveBeenCalledWith(
        userId,
        postId,
        expect.any(Date),
      );
      expect(result).toBeDefined();
    });

    it('throws when post is not found', async () => {
      postsRepo.getPostById.mockResolvedValue(null);

      await expect(
        service.markAsRead(orgId, userId, postId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread count for a post', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      socialCommentsRepo.getUnreadCount.mockResolvedValue(5);

      const result = await service.getUnreadCount(orgId, userId, postId);

      expect(postsRepo.getPostById).toHaveBeenCalledWith(postId, orgId);
      expect(socialCommentsRepo.getUnreadCount).toHaveBeenCalledWith(userId, postId);
      expect(result).toEqual({ unreadCount: 5 });
    });

    it('throws when post is not found', async () => {
      postsRepo.getPostById.mockResolvedValue(null);

      await expect(
        service.getUnreadCount(orgId, userId, postId)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateCommentStatus', () => {
    it('updates a valid status for a comment on the post', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      socialCommentsRepo.updateCommentStatus.mockResolvedValue({
        ...baseComment,
        status: 'handled',
      });

      const result = await service.updateCommentStatus(
        orgId,
        userId,
        postId,
        baseComment.id,
        'handled',
      );

      expect(socialCommentsRepo.updateCommentStatus).toHaveBeenCalledWith(
        baseComment.id,
        orgId,
        'handled',
      );
      expect(result.status).toBe('handled');
    });

    it('rejects invalid statuses before updating', async () => {
      await expect(
        service.updateCommentStatus(orgId, userId, postId, baseComment.id, 'closed')
      ).rejects.toThrow(BadRequestException);

      expect(socialCommentsRepo.updateCommentStatus).not.toHaveBeenCalled();
      expect(postsRepo.getPostById).not.toHaveBeenCalled();
    });
  });

  describe('assignComment', () => {
    it('assigns a comment to an organization member', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      socialCommentsRepo.isOrganizationMember.mockResolvedValue(true);
      socialCommentsRepo.assignComment.mockResolvedValue({
        ...baseComment,
        assigneeId: 'user-2',
      });

      const result = await service.assignComment(
        orgId,
        userId,
        postId,
        baseComment.id,
        'user-2',
      );

      expect(socialCommentsRepo.isOrganizationMember).toHaveBeenCalledWith(
        'user-2',
        orgId,
      );
      expect(socialCommentsRepo.assignComment).toHaveBeenCalledWith(
        baseComment.id,
        orgId,
        'user-2',
      );
      expect(result.assigneeId).toBe('user-2');
    });

    it('rejects assignment to a user outside the organization', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      socialCommentsRepo.isOrganizationMember.mockResolvedValue(false);

      await expect(
        service.assignComment(orgId, userId, postId, baseComment.id, 'external-user')
      ).rejects.toThrow(BadRequestException);

      expect(socialCommentsRepo.assignComment).not.toHaveBeenCalled();
    });

    it('allows clearing an assignment without a membership lookup', async () => {
      postsRepo.getPostById.mockResolvedValue(basePost);
      socialCommentsRepo.getCommentById.mockResolvedValue(baseComment);
      socialCommentsRepo.assignComment.mockResolvedValue({
        ...baseComment,
        assigneeId: null,
      });

      await service.assignComment(orgId, userId, postId, baseComment.id, null);

      expect(socialCommentsRepo.isOrganizationMember).not.toHaveBeenCalled();
      expect(socialCommentsRepo.assignComment).toHaveBeenCalledWith(
        baseComment.id,
        orgId,
        null,
      );
    });
  });

  describe('syncComments', () => {
    const post = {
      id: 'post-1',
      releaseId: 'release-yt-1',
      integrationId: 'integration-1',
      organizationId: 'org-1',
      integration: {
        id: 'integration-1',
        providerIdentifier: 'youtube',
        token: 'valid-token',
        tokenExpiration: dayjs().add(30, 'day').toDate(),
        internalId: 'yt-channel-1',
        refreshWait: false,
      },
    };

    it('skips when post has no releaseId', async () => {
      await service.syncComments(orgId, { ...post, releaseId: null } as any);

      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
    });

    it('skips when releaseId is "missing"', async () => {
      await service.syncComments(orgId, { ...post, releaseId: 'missing' } as any);

      expect(integrationManager.getSocialIntegrationUnchecked).not.toHaveBeenCalled();
    });

    it('skips when provider has no fetchComments method', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue({} as any);

      await service.syncComments(orgId, post as any);

      expect(integrationManager.getSocialIntegrationUnchecked).toHaveBeenCalledWith('youtube');
    });

    it('fetches a single page of comments and upserts them', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const fetched = [
        {
          platformCommentId: 'fc1',
          parentPlatformCommentId: undefined,
          author: { id: 'a1', name: 'Alice', username: '@alice', picture: 'https://pic.com/a.jpg' },
          content: 'First comment!',
          likeCount: 3,
          replyCount: 1,
          likedByMe: false,
          createdAt: '2024-01-15T10:00:00Z',
          raw: { source: 'web' },
        },
      ];
      mockProvider.fetchComments.mockResolvedValue({ comments: fetched, nextCursor: undefined });
      socialCommentsRepo.countComments.mockResolvedValue(1);

      await service.syncComments(orgId, post as any);

      expect(mockProvider.fetchComments).toHaveBeenCalledWith(
        post.integration.internalId,
        post.integration.token,
        post.releaseId,
        undefined,
        post.integration,
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledTimes(1);
      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          postId: post.id,
          integrationId: post.integrationId,
          platformCommentId: 'fc1',
          authorId: 'a1',
          authorName: 'Alice',
          content: 'First comment!',
        })
      );
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(post.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(post.id, 1);
    });

    it('paginates with cursor and stops when no nextCursor', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const page1 = [{
        platformCommentId: 'c1',
        author: { id: 'a1', name: 'A', username: '@a' },
        content: 'page1',
        createdAt: '2024-01-15T10:00:00Z',
      }];
      const page2 = [{
        platformCommentId: 'c2',
        author: { id: 'a2', name: 'B', username: '@b' },
        content: 'page2',
        createdAt: '2024-01-14T10:00:00Z',
      }];
      mockProvider.fetchComments
        .mockResolvedValueOnce({ comments: page1, nextCursor: 'cursor-1' })
        .mockResolvedValueOnce({ comments: page2, nextCursor: undefined });
      socialCommentsRepo.countComments.mockResolvedValue(2);

      await service.syncComments(orgId, post as any);

      expect(mockProvider.fetchComments).toHaveBeenCalledTimes(2);
      expect(mockProvider.fetchComments).toHaveBeenNthCalledWith(
        1, expect.anything(), expect.anything(), expect.anything(), undefined, expect.anything(),
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
      expect(mockProvider.fetchComments).toHaveBeenNthCalledWith(
        2, expect.anything(), expect.anything(), expect.anything(), 'cursor-1', expect.anything(),
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledTimes(2);
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(post.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(post.id, 2);
    });

    it('limits pagination to MAX_PAGES (5)', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const page = [{
        platformCommentId: 'c',
        author: { id: 'a', name: 'A', username: '@a' },
        content: 'still going',
        createdAt: '2024-01-15T10:00:00Z',
      }];
      mockProvider.fetchComments.mockResolvedValue({ comments: page, nextCursor: 'next' });
      socialCommentsRepo.countComments.mockResolvedValue(5);

      await service.syncComments(orgId, post as any);

      expect(mockProvider.fetchComments).toHaveBeenCalledTimes(5);
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(post.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(post.id, 5);
    });

    it('stops when an empty page is returned', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const page = [{
        platformCommentId: 'c',
        author: { id: 'a', name: 'A', username: '@a' },
        content: 'only page',
        createdAt: '2024-01-15T10:00:00Z',
      }];
      mockProvider.fetchComments
        .mockResolvedValueOnce({ comments: page, nextCursor: 'cursor-1' })
        .mockResolvedValueOnce({ comments: [], nextCursor: undefined });
      socialCommentsRepo.countComments.mockResolvedValue(1);

      await service.syncComments(orgId, post as any);

      expect(mockProvider.fetchComments).toHaveBeenCalledTimes(2);
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(post.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(post.id, 1);
    });

    it('refreshes expired token before fetching', async () => {
      const expiredPost = {
        ...post,
        integration: {
          ...post.integration,
          tokenExpiration: dayjs().subtract(1, 'day').toDate(),
        },
      };
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      refreshIntegrationService.refresh.mockResolvedValue({ accessToken: 'fresh-token' });
      mockProvider.fetchComments.mockResolvedValue({ comments: [], nextCursor: undefined });
      socialCommentsRepo.countComments.mockResolvedValue(0);

      await service.syncComments(orgId, expiredPost as any);

      expect(refreshIntegrationService.refresh).toHaveBeenCalledWith(expiredPost.integration);
      expect(mockProvider.fetchComments).toHaveBeenCalledWith(
        expiredPost.integration.internalId,
        'fresh-token',
        expiredPost.releaseId,
        undefined,
        expiredPost.integration,
        { client_id: 'mock-id', client_secret: 'mock-secret', instanceUrl: '' },
      );
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(expiredPost.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(expiredPost.id, 0);
    });

    it('skips fetch when token refresh returns falsy', async () => {
      const expiredPost = {
        ...post,
        integration: {
          ...post.integration,
          tokenExpiration: dayjs().subtract(1, 'day').toDate(),
        },
      };
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      refreshIntegrationService.refresh.mockResolvedValue(null);

      await service.syncComments(orgId, expiredPost as any);

      expect(mockProvider.fetchComments).not.toHaveBeenCalled();
    });

    it('stops paging immediately on a RefreshToken error without reconciling deletions', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const refreshError = new RefreshToken('yt', '{}', '{}', 'refresh');
      mockProvider.fetchComments.mockRejectedValue(refreshError);
      socialCommentsRepo.countComments.mockResolvedValue(0);

      await service.syncComments(orgId, post as any);

      // A dead token must not burn all MAX_PAGES attempts.
      expect(mockProvider.fetchComments).toHaveBeenCalledTimes(1);
      // Partial/failed sweep → no soft-delete reconciliation.
      expect(socialCommentsRepo.softDeleteCommentsByIds).not.toHaveBeenCalled();
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(post.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(post.id, 0);
    });

    it('stops paging on a generic error without reconciling deletions', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      mockProvider.fetchComments.mockRejectedValue(new Error('API error'));
      socialCommentsRepo.countComments.mockResolvedValue(0);

      await service.syncComments(orgId, post as any);

      expect(mockProvider.fetchComments).toHaveBeenCalledTimes(1);
      expect(socialCommentsRepo.softDeleteCommentsByIds).not.toHaveBeenCalled();
    });

    it('soft-deletes comments that vanished on a fully-synced pass', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      mockProvider.fetchComments.mockResolvedValue({
        comments: [{
          platformCommentId: 'c1',
          author: { id: 'a1', name: 'A', username: '@a' },
          content: 'kept',
          createdAt: '2024-01-15T10:00:00Z',
        }],
        nextCursor: undefined,
      });
      socialCommentsRepo.getActiveCommentIds.mockResolvedValue([
        { id: 'db-1', platformCommentId: 'c1' },
        { id: 'db-2', platformCommentId: 'gone' },
      ]);
      socialCommentsRepo.countComments.mockResolvedValue(1);

      await service.syncComments(orgId, post as any);

      expect(socialCommentsRepo.softDeleteCommentsByIds).toHaveBeenCalledWith(['db-2']);
    });

    it('does NOT reconcile deletions when pagination is truncated at MAX_PAGES', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      mockProvider.fetchComments.mockResolvedValue({
        comments: [{
          platformCommentId: 'c',
          author: { id: 'a', name: 'A', username: '@a' },
          content: 'more',
          createdAt: '2024-01-15T10:00:00Z',
        }],
        nextCursor: 'next',
      });
      socialCommentsRepo.getActiveCommentIds.mockResolvedValue([
        { id: 'db-2', platformCommentId: 'gone' },
      ]);
      socialCommentsRepo.countComments.mockResolvedValue(5);

      await service.syncComments(orgId, post as any);

      expect(mockProvider.fetchComments).toHaveBeenCalledTimes(5);
      expect(socialCommentsRepo.softDeleteCommentsByIds).not.toHaveBeenCalled();
    });

    it('serializes raw field when present', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      const rawData = { source: 'mobile', version: '2.1' };
      mockProvider.fetchComments.mockResolvedValue({
        comments: [{
          platformCommentId: 'fc1',
          author: { id: 'a1', name: 'A', username: '@a' },
          content: 'with raw',
          createdAt: '2024-01-15T10:00:00Z',
          raw: rawData,
        }],
        nextCursor: undefined,
      });
      socialCommentsRepo.countComments.mockResolvedValue(1);

      await service.syncComments(orgId, post as any);

      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledWith(
        expect.objectContaining({
          raw: JSON.stringify(rawData),
        })
      );
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(post.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(post.id, 1);
    });

    it('passes defaults for missing comment fields', async () => {
      integrationManager.getSocialIntegrationUnchecked.mockReturnValue(mockProvider);
      mockProvider.fetchComments.mockResolvedValue({
        comments: [{
          platformCommentId: 'fc1',
          author: { id: 'a1', name: 'A', username: '@a', picture: 'pic' },
          content: 'minimal',
        }],
        nextCursor: undefined,
      });
      socialCommentsRepo.countComments.mockResolvedValue(1);

      await service.syncComments(orgId, post as any);

      expect(socialCommentsRepo.upsertComment).toHaveBeenCalledWith(
        expect.objectContaining({
          likeCount: undefined,
          replyCount: undefined,
          likedByMe: undefined,
          parentPlatformCommentId: undefined,
          platformCreatedAt: expect.any(Date),
          raw: undefined,
        })
      );
      expect(socialCommentsRepo.countComments).toHaveBeenCalledWith(post.id);
      expect(postsRepo.updateCommentCount).toHaveBeenCalledWith(post.id, 1);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';

vi.mock('@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service', () => ({
  SocialCommentsService: class MockSocialCommentsService {
    getComments = vi.fn();
    replyToPost = vi.fn();
    replyToComment = vi.fn();
    likeComment = vi.fn();
    markAsRead = vi.fn();
    getUnreadCount = vi.fn();
  },
}));

// Mock the Redis client so idempotency SET NX / DEL are controllable and no real
// connection opens during the unit test.
const { mockRedisSet, mockRedisDel } = vi.hoisted(() => ({
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
}));
vi.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { set: mockRedisSet, del: mockRedisDel },
}));

import { SocialCommentsController } from './social-comments.controller';
import { SocialCommentsService } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { GuardrailViolation } from '@gitroom/nestjs-libraries/ai/governance/errors';

const mockOrg = { id: 'org-1', name: 'Test Org' } as any;
const mockUser = { id: 'user-1', name: 'Test User' } as any;

describe('SocialCommentsController', () => {
  let controller: SocialCommentsController;
  let service: SocialCommentsService;
  let guardrails: { checkOutput: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    // No idempotency key claimed by default → SET returns OK (proceed).
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
    service = new (SocialCommentsService as any)();
    // Output guardrail is now ALWAYS applied server-side (pass-through here).
    guardrails = {
      checkOutput: vi.fn().mockImplementation((c: string) => Promise.resolve(c)),
    };
    controller = new SocialCommentsController(
      service as unknown as SocialCommentsService,
      guardrails as any
    );
  });

  describe('GET /:id/social-comments', () => {
    it('returns comments for a post with cursor query param', async () => {
      const mockResult: {
        comments: { id: string }[];
        nextCursor: string | undefined;
        unreadCount: number;
      } = { comments: [{ id: 'c1' }], nextCursor: undefined, unreadCount: 0 };
      (service.getComments as any).mockResolvedValue(mockResult);

      const result = await controller.getComments('post-1', 'cursor-value', mockOrg, mockUser);

      expect(service.getComments).toHaveBeenCalledWith('org-1', 'user-1', 'post-1', 'cursor-value');
      expect(result).toEqual(mockResult);
    });

    it('passes undefined when cursor query is not provided', async () => {
      (service.getComments as any).mockResolvedValue({ comments: [], nextCursor: undefined, unreadCount: 0 });

      await controller.getComments('post-1', undefined, mockOrg, mockUser);

      expect(service.getComments).toHaveBeenCalledWith('org-1', 'user-1', 'post-1', undefined);
    });

    it('delegates to the service with correct org and user', async () => {
      const differentOrg = { id: 'org-2', name: 'Other Org' } as any;
      const differentUser = { id: 'user-2', name: 'Other User' } as any;
      (service.getComments as any).mockResolvedValue({ comments: [], nextCursor: undefined, unreadCount: 0 });

      await controller.getComments('post-1', undefined, differentOrg, differentUser);

      expect(service.getComments).toHaveBeenCalledWith('org-2', 'user-2', 'post-1', undefined);
    });
  });

  describe('POST /:id/social-comments', () => {
    it('adds a top-level comment via replyToPost', async () => {
      (service.replyToPost as any).mockResolvedValue({ platformCommentId: 'new-comment-1' });

      const result = await controller.addComment('post-1', { message: 'Hello world!' }, undefined, mockOrg, mockUser);

      expect(service.replyToPost).toHaveBeenCalledWith('org-1', 'user-1', 'post-1', 'Hello world!');
      expect(result).toEqual({ platformCommentId: 'new-comment-1' });
    });

    it('passes the message from the request body', async () => {
      (service.replyToPost as any).mockResolvedValue({});

      await controller.addComment('post-1', { message: 'Another comment' }, undefined, mockOrg, mockUser);

      expect(service.replyToPost).toHaveBeenCalledWith('org-1', 'user-1', 'post-1', 'Another comment');
    });

    // 3.1 — the output guardrail is server-decided: it runs even when the body omits
    // the (deprecated) guardrail flag.
    it('always runs the output guardrail even without the guardrail flag', async () => {
      (service.replyToPost as any).mockResolvedValue({});

      await controller.addComment('post-1', { message: 'guard me' }, undefined, mockOrg, mockUser);

      expect(guardrails.checkOutput).toHaveBeenCalledWith('guard me', {
        orgId: 'org-1',
        userId: 'user-1',
      });
    });

    // 3.1 — a blocking chain surfaces as 422, not a raw 500.
    it('maps a GuardrailViolation to 422 UnprocessableEntity', async () => {
      guardrails.checkOutput.mockRejectedValueOnce(
        new GuardrailViolation('Blocked by PII policy', 'pii', 'block')
      );

      await expect(
        controller.addComment('post-1', { message: 'ssn 123' }, 'key-guard', mockOrg, mockUser)
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(service.replyToPost).not.toHaveBeenCalled();
      // Guard runs BEFORE the idempotency claim, so a blocked message never burns a
      // slot (a same-key retry re-guards and re-422s instead of a false success).
      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });

  describe('POST /:id/social-comments/:commentId/reply', () => {
    it('replies to a specific comment via replyToComment', async () => {
      (service.replyToComment as any).mockResolvedValue({ platformCommentId: 'reply-1' });

      const result = await controller.replyToComment('post-1', 'comment-1', { message: 'This is a reply' }, undefined, mockOrg, mockUser);

      expect(service.replyToComment).toHaveBeenCalledWith('org-1', 'user-1', 'post-1', 'comment-1', 'This is a reply');
      expect(result).toEqual({ platformCommentId: 'reply-1' });
    });
  });

  // 3.2 — idempotency: a repeated X-Idempotency-Key cannot double-dispatch.
  describe('idempotency (X-Idempotency-Key)', () => {
    it('dispatches once, then short-circuits a duplicate key', async () => {
      (service.replyToPost as any).mockResolvedValue({ platformCommentId: 'c1' });
      // First claim succeeds (OK), the retry with the same key fails NX (null).
      mockRedisSet.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

      const first = await controller.addComment('post-1', { message: 'hi' }, 'key-abc', mockOrg, mockUser);
      const second = await controller.addComment('post-1', { message: 'hi' }, 'key-abc', mockOrg, mockUser);

      expect(service.replyToPost).toHaveBeenCalledTimes(1);
      expect(second).toEqual({ duplicate: true });
      expect(first).toEqual({ platformCommentId: 'c1' });
      // Key is namespaced by org.
      expect(mockRedisSet).toHaveBeenCalledWith('idem:org-1:key-abc', '1', 'EX', 86400, 'NX');
    });

    it('different keys each dispatch', async () => {
      (service.replyToPost as any).mockResolvedValue({});
      mockRedisSet.mockResolvedValue('OK');

      await controller.addComment('post-1', { message: 'a' }, 'key-1', mockOrg, mockUser);
      await controller.addComment('post-1', { message: 'b' }, 'key-2', mockOrg, mockUser);

      expect(service.replyToPost).toHaveBeenCalledTimes(2);
    });

    it('no header → unchanged (Redis not touched, always dispatches)', async () => {
      (service.replyToPost as any).mockResolvedValue({});

      await controller.addComment('post-1', { message: 'a' }, undefined, mockOrg, mockUser);

      expect(mockRedisSet).not.toHaveBeenCalled();
      expect(service.replyToPost).toHaveBeenCalledTimes(1);
    });

    // A definite dispatch failure must RELEASE the claimed key so a legitimate
    // same-key retry can re-attempt (not get a false "duplicate" success).
    it('releases the key when the dispatch throws, so a retry re-attempts', async () => {
      mockRedisSet.mockResolvedValue('OK');
      (service.replyToPost as any)
        .mockRejectedValueOnce(new Error('provider down'))
        .mockResolvedValueOnce({ platformCommentId: 'c2' });

      await expect(
        controller.addComment('post-1', { message: 'hi' }, 'key-retry', mockOrg, mockUser)
      ).rejects.toThrow('provider down');
      // key released on failure
      expect(mockRedisDel).toHaveBeenCalledWith('idem:org-1:key-retry');

      // Retry with the same key re-claims (released) and dispatches.
      const retry = await controller.addComment(
        'post-1', { message: 'hi' }, 'key-retry', mockOrg, mockUser
      );
      expect(retry).toEqual({ platformCommentId: 'c2' });
      expect(service.replyToPost).toHaveBeenCalledTimes(2);
    });

    // A Redis outage must NOT fail the reply — fail open (proceed, no dedup).
    it('fails open when Redis is unavailable', async () => {
      mockRedisSet.mockRejectedValue(new Error('ECONNREFUSED'));
      (service.replyToPost as any).mockResolvedValue({ platformCommentId: 'c3' });

      const result = await controller.addComment(
        'post-1', { message: 'hi' }, 'key-x', mockOrg, mockUser
      );

      expect(result).toEqual({ platformCommentId: 'c3' });
      expect(service.replyToPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /:id/social-comments/:commentId/like', () => {
    it('likes a comment via likeComment with like=true', async () => {
      (service.likeComment as any).mockResolvedValue({ liked: true, likeCount: 11 });

      const result = await controller.likeComment('post-1', 'comment-1', { like: true }, mockOrg, mockUser);

      expect(service.likeComment).toHaveBeenCalledWith('org-1', 'user-1', 'post-1', 'comment-1', true);
      expect(result).toEqual({ liked: true, likeCount: 11 });
    });

    it('unlikes a comment via likeComment with like=false', async () => {
      (service.likeComment as any).mockResolvedValue({ liked: false, likeCount: 10 });

      await controller.likeComment('post-1', 'comment-1', { like: false }, mockOrg, mockUser);

      expect(service.likeComment).toHaveBeenCalledWith('org-1', 'user-1', 'post-1', 'comment-1', false);
    });
  });

  describe('POST /:id/social-comments/read', () => {
    it('marks post comments as read via markAsRead', async () => {
      const readState = { userId: 'user-1', postId: 'post-1', lastReadAt: new Date(), lastReadCount: 10 };
      (service.markAsRead as any).mockResolvedValue(readState);

      const result = await controller.markAsRead('post-1', mockOrg, mockUser);

      expect(service.markAsRead).toHaveBeenCalledWith('org-1', 'user-1', 'post-1');
      expect(result).toEqual(readState);
    });
  });

  describe('GET /:id/social-comments/unread-count', () => {
    it('returns unread count for a post', async () => {
      (service.getUnreadCount as any).mockResolvedValue({ unreadCount: 5 });

      const result = await controller.getUnreadCount('post-1', mockOrg, mockUser);

      expect(service.getUnreadCount).toHaveBeenCalledWith('org-1', 'user-1', 'post-1');
      expect(result).toEqual({ unreadCount: 5 });
    });
  });
});

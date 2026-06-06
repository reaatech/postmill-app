import { BadRequestException, Injectable } from '@nestjs/common';
import { SocialCommentsRepository } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.repository';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import dayjs from 'dayjs';
import { timer } from '@gitroom/helpers/utils/timer';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Post, Integration } from '@prisma/client';

@Injectable()
export class SocialCommentsService {
  constructor(
    private _socialCommentsRepository: SocialCommentsRepository,
    private _postsRepository: PostsRepository,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _integrationService: IntegrationService,
  ) {}

  private async refreshTokenIfExpired(
    integration: { token: string; tokenExpiration?: Date | null; organizationId: string } & Integration,
    provider: any
  ): Promise<{ token: string; integration: any }> {
    let token = integration.token;
    if (integration.tokenExpiration && dayjs(integration.tokenExpiration).isBefore(dayjs())) {
      const refreshed = await this._refreshIntegrationService.refresh(integration);
      if (!refreshed || !refreshed.accessToken) {
        await this._integrationService.disconnectChannel(integration.organizationId, integration);
        throw new BadRequestException('Token expired — please reconnect this channel');
      }
      token = refreshed.accessToken;
      if (provider.refreshWait) {
        await timer(10000);
      }
    }
    return { token, integration };
  }

  async getComments(orgId: string, userId: string, postId: string, cursor?: string) {
    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post) throw new BadRequestException('Post not found');
    if (!post.releaseId || post.releaseId === 'missing') {
      return { comments: [], nextCursor: undefined, unreadCount: 0 };
    }

    const comments = await this._socialCommentsRepository.getComments(postId, cursor);
    const hasMore = comments.length > 50;
    const items = hasMore ? comments.slice(0, 50) : comments;
    const nextCursor = hasMore && items.length
      ? items[items.length - 1].platformCreatedAt.toISOString()
      : undefined;
    const unreadCount = await this._socialCommentsRepository.getUnreadCount(userId, postId);

    return { comments: items, nextCursor, unreadCount };
  }

  async replyToComment(orgId: string, userId: string, postId: string, commentId: string, message: string, retried = false): Promise<any> {
    const comment = await this._socialCommentsRepository.getCommentById(commentId);
    if (!comment || comment.postId !== postId) {
      throw new BadRequestException('Comment not found');
    }

    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post || !post.releaseId || post.releaseId === 'missing') {
      throw new BadRequestException('Post not found or missing release ID');
    }

    const provider = this._integrationManager.getSocialIntegrationUnchecked(
      post.integration.providerIdentifier
    );
    if (!provider?.replyToComment) {
      throw new BadRequestException('Comments not supported for this channel');
    }

    const { token } = await this.refreshTokenIfExpired(post.integration, provider);

    try {
      const result = await provider.replyToComment(
        post.integration.internalId,
        token,
        post.releaseId,
        comment.platformCommentId,
        message,
        post.integration,
      );

      // Providers swallow API errors and return a fabricated DTO with an empty
      // platformCommentId. Don't persist that (it collides on the unique
      // (integrationId, platformCommentId) key) or report it as success.
      if (!result?.platformCommentId) {
        throw new BadRequestException('Failed to post reply — please try again');
      }

      await this._socialCommentsRepository.upsertComment({
        organizationId: orgId,
        postId,
        integrationId: comment.integrationId,
        platformCommentId: result.platformCommentId,
        parentPlatformCommentId: comment.platformCommentId,
        authorId: result.author.id,
        authorName: result.author.name,
        authorUsername: result.author.username,
        authorPicture: result.author.picture,
        content: result.content,
        likeCount: result.likeCount,
        replyCount: result.replyCount,
        likedByMe: result.likedByMe,
        isOwn: true,
        platformCreatedAt: result.createdAt ? new Date(result.createdAt) : new Date(),
        raw: result.raw ? JSON.stringify(result.raw) : undefined,
      });

      return result;
    } catch (err: any) {
      if (err instanceof RefreshToken && !retried) {
        return this.replyToComment(orgId, userId, postId, commentId, message, true);
      }
      throw err;
    }
  }

  async likeComment(orgId: string, userId: string, postId: string, commentId: string, like: boolean, retried = false): Promise<any> {
    const comment = await this._socialCommentsRepository.getCommentById(commentId);
    if (!comment || comment.postId !== postId) {
      throw new BadRequestException('Comment not found');
    }

    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post || !post.releaseId || post.releaseId === 'missing') {
      throw new BadRequestException('Post not found or missing release ID');
    }

    const provider = this._integrationManager.getSocialIntegrationUnchecked(
      post.integration.providerIdentifier
    );
    if (!provider?.likeComment) {
      throw new BadRequestException('Comments not supported for this channel');
    }

    const { token } = await this.refreshTokenIfExpired(post.integration, provider);

    try {
      const result = await provider.likeComment(
        post.integration.internalId,
        token,
        post.releaseId,
        comment.platformCommentId,
        like,
        post.integration,
      );

      await this._socialCommentsRepository.upsertComment({
        organizationId: orgId,
        postId,
        integrationId: comment.integrationId,
        platformCommentId: comment.platformCommentId,
        authorId: comment.authorId,
        authorName: comment.authorName,
        authorUsername: comment.authorUsername ?? undefined,
        authorPicture: comment.authorPicture ?? undefined,
        content: comment.content,
        likeCount: result.likeCount ?? comment.likeCount,
        likedByMe: result.liked,
        platformCreatedAt: comment.platformCreatedAt,
      });

      return result;
    } catch (err: any) {
      if (err instanceof RefreshToken && !retried) {
        return this.likeComment(orgId, userId, postId, commentId, like, true);
      }
      throw err;
    }
  }

  async markAsRead(orgId: string, userId: string, postId: string) {
    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post) {
      throw new BadRequestException('Post not found');
    }

    return this._socialCommentsRepository.upsertReadState(userId, postId, new Date());
  }

  async getUnreadCount(orgId: string, userId: string, postId: string) {
    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post) {
      throw new BadRequestException('Post not found');
    }

    return {
      unreadCount: await this._socialCommentsRepository.getUnreadCount(userId, postId),
    };
  }

  async updateCommentStatus(
    orgId: string,
    userId: string,
    postId: string,
    commentId: string,
    status: string,
  ) {
    if (!['needs_reply', 'handled', 'ignored'].includes(status)) {
      throw new BadRequestException('Invalid comment status');
    }

    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post) throw new BadRequestException('Post not found');

    const comment = await this._socialCommentsRepository.getCommentById(commentId);
    if (!comment || comment.postId !== postId) {
      throw new BadRequestException('Comment not found');
    }

    return this._socialCommentsRepository.updateCommentStatus(commentId, status);
  }

  async assignComment(
    orgId: string,
    userId: string,
    postId: string,
    commentId: string,
    assigneeId: string | null,
  ) {
    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post) throw new BadRequestException('Post not found');

    const comment = await this._socialCommentsRepository.getCommentById(commentId);
    if (!comment || comment.postId !== postId) {
      throw new BadRequestException('Comment not found');
    }

    if (assigneeId) {
      const isMember = await this._socialCommentsRepository.isOrganizationMember(
        assigneeId,
        orgId,
      );
      if (!isMember) {
        throw new BadRequestException('Assignee must be a member of this organization');
      }
    }

    return this._socialCommentsRepository.assignComment(commentId, assigneeId);
  }

  async syncComments(orgId: string, post: Post & { integration: Integration }) {
    if (!post.releaseId || post.releaseId === 'missing') return;

    const provider = this._integrationManager.getSocialIntegrationUnchecked(
      post.integration.providerIdentifier
    );
    if (!provider?.fetchComments) return;

    let token = post.integration.token;
    if (
      post.integration.tokenExpiration &&
      dayjs(post.integration.tokenExpiration).isBefore(dayjs())
    ) {
      try {
        const refreshed = await this._refreshIntegrationService.refresh(post.integration);
        if (!refreshed || !refreshed.accessToken) {
          await this._integrationService.disconnectChannel(orgId, post.integration);
          return;
        }
        token = refreshed.accessToken;
        if (provider.refreshWait) {
          await timer(10000);
        }
      } catch {
        return;
      }
    }

    let cursor: string | undefined;
    let hasMore = true;
    let attempts = 0;
    const MAX_PAGES = 5;
    const syncedIds = new Set<string>();
    // Whether we fetched the post's full comment set. A truncated (MAX_PAGES) or
    // errored sweep leaves syncedIds partial and must NOT drive deletions.
    let fullySynced = true;

    while (hasMore && attempts < MAX_PAGES) {
      attempts++;
      try {
        const result = await provider.fetchComments(
          post.integration.internalId,
          token,
          post.releaseId,
          cursor,
          post.integration,
        );

        if (!result.comments?.length) {
          hasMore = false;
          continue;
        }

        for (const comment of result.comments) {
          syncedIds.add(comment.platformCommentId);
          await this._socialCommentsRepository.upsertComment({
            organizationId: orgId,
            postId: post.id,
            integrationId: post.integrationId,
            platformCommentId: comment.platformCommentId,
            parentPlatformCommentId: comment.parentPlatformCommentId,
            authorId: comment.author.id,
            authorName: comment.author.name,
            authorUsername: comment.author.username,
            authorPicture: comment.author.picture,
            content: comment.content,
            likeCount: comment.likeCount,
            replyCount: comment.replyCount,
            likedByMe: comment.likedByMe,
            platformCreatedAt: comment.createdAt ? new Date(comment.createdAt) : new Date(),
            raw: comment.raw ? JSON.stringify(comment.raw) : undefined,
          });
        }

        cursor = result.nextCursor;
        if (!cursor) hasMore = false;
      } catch (err: any) {
        fullySynced = false;
        if (err instanceof RefreshToken) {
          break;
        }
        hasMore = false;
      }
    }

    // Exited with pages remaining → truncated, partial set.
    if (hasMore) fullySynced = false;

    // Reconcile on-platform deletions only when we have the authoritative full
    // set; otherwise we'd soft-delete comments we simply didn't page to.
    if (fullySynced) {
      const existing = await this._socialCommentsRepository.getActiveCommentIds(post.id);
      const toDelete = existing
        .filter((c) => !syncedIds.has(c.platformCommentId))
        .map((c) => c.id);
      await this._socialCommentsRepository.softDeleteCommentsByIds(toDelete);
    }

    const count = await this._socialCommentsRepository.countComments(post.id);
    await this._postsRepository.updateCommentCount(post.id, count);
  }

  async replyToPost(orgId: string, userId: string, postId: string, message: string, retried = false): Promise<any> {
    const post = await this._postsRepository.getPostById(postId, orgId);
    if (!post || !post.releaseId || post.releaseId === 'missing') {
      throw new BadRequestException('Post not found or missing release ID');
    }

    const provider = this._integrationManager.getSocialIntegrationUnchecked(
      post.integration.providerIdentifier
    );
    if (!provider?.replyToComment) {
      throw new BadRequestException('Comments not supported for this channel');
    }

    const { token } = await this.refreshTokenIfExpired(post.integration, provider);

    try {
      const result = await provider.replyToComment(
        post.integration.internalId,
        token,
        post.releaseId,
        post.releaseId,
        message,
        post.integration,
      );

      // See replyToComment: a fabricated empty-id DTO means the provider call
      // failed; surface it rather than persisting a bogus comment.
      if (!result?.platformCommentId) {
        throw new BadRequestException('Failed to post reply — please try again');
      }

      await this._socialCommentsRepository.upsertComment({
        organizationId: orgId,
        postId,
        integrationId: post.integrationId,
        platformCommentId: result.platformCommentId,
        parentPlatformCommentId: undefined,
        authorId: result.author.id,
        authorName: result.author.name,
        authorUsername: result.author.username,
        authorPicture: result.author.picture,
        content: result.content,
        likeCount: result.likeCount,
        replyCount: result.replyCount,
        likedByMe: result.likedByMe,
        isOwn: true,
        platformCreatedAt: result.createdAt ? new Date(result.createdAt) : new Date(),
        raw: result.raw ? JSON.stringify(result.raw) : undefined,
      });

      return result;
    } catch (err: any) {
      if (err instanceof RefreshToken && !retried) {
        return this.replyToPost(orgId, userId, postId, message, true);
      }
      throw err;
    }
  }
}

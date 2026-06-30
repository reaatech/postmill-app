import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable, BadRequestException } from '@nestjs/common';
import dayjs from 'dayjs';
// type-only: the service value-imports this repository, so a runtime import here would
// close a circular require. InboxFilterOptions is only a type, so import it as such.
import type { InboxFilterOptions } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';

@Injectable()
export class SocialCommentsRepository {
  constructor(
    private _socialComment: PrismaRepository<'socialComment'>,
    private _postCommentRead: PrismaRepository<'postCommentRead'>,
    private _userOrganization: PrismaRepository<'userOrganization'>,
    private _post: PrismaRepository<'post'>,
  ) {}

  async getInbox(orgId: string, userId: string, filters: InboxFilterOptions) {
    const where: any = {
      organizationId: orgId,
      deletedAt: null,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.assigneeId) {
      where.assigneeId = filters.assigneeId;
    }

    if (filters.integrationId) {
      where.integrationId = filters.integrationId;
    }

    if (filters.campaignId) {
      where.post = { campaignId: filters.campaignId, deletedAt: null };
    }

    if (filters.unreadOnly) {
      where.isOwn = false;
      if (where.status) {
        where.AND = [{ status: where.status }, { status: { not: 'handled' } }];
        delete where.status;
      } else {
        where.status = { not: 'handled' };
      }
    }

    if (filters.cursor) {
      if (!dayjs(filters.cursor).isValid()) throw new BadRequestException('Invalid cursor format');
      where.platformCreatedAt = { lt: new Date(filters.cursor) };
    }

    const comments = await this._socialComment.model.socialComment.findMany({
      where,
      orderBy: [{ platformCreatedAt: 'desc' }, { id: 'desc' }],
      take: 51,
      include: {
        post: {
          select: {
            id: true,
            content: true,
            publishDate: true,
            integration: { select: { name: true, providerIdentifier: true, picture: true } },
          },
        },
      },
    });

    const hasMore = comments.length > 50;
    const items = hasMore ? comments.slice(0, 50) : comments;
    const nextCursor = hasMore && items.length
      ? items[items.length - 1].platformCreatedAt.toISOString()
      : undefined;

    return { comments: items, nextCursor };
  }

  async bulkMarkRead(commentIds: string[], organizationId: string) {
    if (!commentIds.length) return { count: 0 };
    return this._socialComment.model.socialComment.updateMany({
      where: { id: { in: commentIds }, organizationId },
      data: { status: 'handled' },
    });
  }

  async getInboxUnreadCount(orgId: string, userId: string): Promise<number> {
    return this._socialComment.model.socialComment.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        isOwn: false,
        status: { not: 'handled' },
      },
    });
  }

  getComments(postId: string, cursor?: string, limit: number = 50) {
    return this._socialComment.model.socialComment.findMany({
      where: {
        postId,
        deletedAt: null,
        ...(cursor ? { platformCreatedAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: [{ platformCreatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  getCommentById(id: string) {
    return this._socialComment.model.socialComment.findUnique({
      where: { id },
    });
  }

  upsertComment(data: {
    organizationId: string;
    postId: string;
    integrationId: string;
    platformCommentId: string;
    parentPlatformCommentId?: string;
    authorId: string;
    authorName: string;
    authorUsername?: string;
    authorPicture?: string;
    content: string;
    likeCount?: number;
    replyCount?: number;
    likedByMe?: boolean;
    isOwn?: boolean;
    platformCreatedAt: Date;
    raw?: string;
  }) {
    return this._socialComment.model.socialComment.upsert({
      where: {
        integrationId_platformCommentId: {
          integrationId: data.integrationId,
          platformCommentId: data.platformCommentId,
        },
      },
      create: {
        ...data,
        likeCount: data.likeCount ?? 0,
        replyCount: data.replyCount ?? 0,
        likedByMe: data.likedByMe ?? false,
        isOwn: data.isOwn ?? false,
      },
      // Only overwrite fields the caller actually provided. A partial update
      // (e.g. a like toggle that passes only likeCount/likedByMe) must not reset
      // replyCount/isOwn/etc. to their defaults and clobber synced data.
      update: {
        authorName: data.authorName,
        authorUsername: data.authorUsername,
        authorPicture: data.authorPicture,
        content: data.content,
        ...(data.likeCount !== undefined ? { likeCount: data.likeCount } : {}),
        ...(data.replyCount !== undefined ? { replyCount: data.replyCount } : {}),
        ...(data.likedByMe !== undefined ? { likedByMe: data.likedByMe } : {}),
        ...(data.isOwn !== undefined ? { isOwn: data.isOwn } : {}),
        ...(data.raw !== undefined ? { raw: data.raw } : {}),
        deletedAt: null,
      },
    });
  }

  getActiveCommentIds(postId: string) {
    return this._socialComment.model.socialComment.findMany({
      where: { postId, deletedAt: null },
      select: { id: true, platformCommentId: true },
    });
  }

  softDeleteCommentsByIds(ids: string[]) {
    if (!ids.length) {
      return Promise.resolve({ count: 0 });
    }
    return this._socialComment.model.socialComment.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
  }

  getPublishedPostsForSync(orgId: string, since: Date, cursor?: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        releaseId: { not: null },
        publishDate: { gte: since },
      },
      include: { integration: true },
      take: 50,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
  }

  getReadState(userId: string, postId: string) {
    return this._postCommentRead.model.postCommentRead.findUnique({
      where: { userId_postId: { userId, postId } },
    });
  }

  upsertReadState(userId: string, postId: string, lastReadAt: Date, lastReadCount?: number) {
    return this._postCommentRead.model.postCommentRead.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId, lastReadAt, lastReadCount: lastReadCount ?? 0 },
      update: { lastReadAt, ...(lastReadCount !== undefined ? { lastReadCount } : {}) },
    });
  }

  updateCommentStatus(commentId: string, status: string) {
    return this._socialComment.model.socialComment.update({
      where: { id: commentId },
      data: { status },
    });
  }

  assignComment(commentId: string, assigneeId: string | null) {
    return this._socialComment.model.socialComment.update({
      where: { id: commentId },
      data: { assigneeId },
    });
  }

  async isOrganizationMember(userId: string, orgId: string): Promise<boolean> {
    const member = await this._userOrganization.model.userOrganization.findFirst({
      where: { userId, organizationId: orgId },
      select: { userId: true },
    });
    return !!member;
  }

  async countComments(postId: string): Promise<number> {
    return this._socialComment.model.socialComment.count({
      where: { postId, deletedAt: null },
    });
  }

  async countByCampaign(orgId: string, campaignId: string): Promise<number> {
    return this._socialComment.model.socialComment.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        post: { campaignId, deletedAt: null },
      },
    });
  }

  async getUnreadCount(userId: string, postId: string) {
    const readState = await this.getReadState(userId, postId);
    const where: any = {
      postId,
      deletedAt: null,
      isOwn: false,
    };
    if (readState) {
      where.platformCreatedAt = { gt: readState.lastReadAt };
    }
    return this._socialComment.model.socialComment.count({ where });
  }

  // ── CommentsActivity extraction (D1): comment-sweep data access ──

  // Posts that received fresh, non-own comments since `since` (id-only probe).
  getPostsWithRecentComments(orgId: string, since: Date, take = 50) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        socialComments: {
          some: { createdAt: { gte: since }, isOwn: false, deletedAt: null },
        },
      },
      select: { id: true },
      take,
    });
  }

  // A page of live comments older than `cutoff` (id-only), for the prune loop.
  findCommentsToPrune(orgId: string, cutoff: Date, take = 1000) {
    return this._socialComment.model.socialComment.findMany({
      where: {
        organizationId: orgId,
        platformCreatedAt: { lt: cutoff },
        deletedAt: null,
      },
      take,
      select: { id: true },
    });
  }

  // Posts with their newest non-own comments since `cutoff`, for the digest notification.
  getPostsForCommentDigest(orgId: string, cutoff: Date, take = 10) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        socialComments: {
          some: { createdAt: { gte: cutoff }, isOwn: false, deletedAt: null },
        },
      },
      include: {
        socialComments: {
          where: { createdAt: { gte: cutoff }, isOwn: false, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        integration: true,
      },
      take,
    });
  }
}

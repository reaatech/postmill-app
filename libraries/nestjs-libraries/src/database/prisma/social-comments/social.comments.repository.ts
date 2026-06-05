import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SocialCommentsRepository {
  constructor(
    private _socialComment: PrismaRepository<'socialComment'>,
    private _postCommentRead: PrismaRepository<'postCommentRead'>,
    private _userOrganization: PrismaRepository<'userOrganization'>,
  ) {}

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
}

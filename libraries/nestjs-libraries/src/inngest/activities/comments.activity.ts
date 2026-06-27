import { Injectable, Logger } from '@nestjs/common';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { SocialCommentsService } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';

@Injectable()
export class CommentsActivity {
  private readonly logger = new Logger(CommentsActivity.name);

  constructor(
    private _prisma: PrismaService,
    private _orgProviderConfigManager: OrgProviderConfigManager,
    private _socialCommentsService: SocialCommentsService,
    private _webhooksService: WebhooksService,
    private _notificationService: NotificationService,
  ) {}

  async syncPostComments(orgId: string, daysBack: number): Promise<void> {
    await this._orgProviderConfigManager.ensureFresh(orgId);
    const since = dayjs().subtract(daysBack, 'day').startOf('day').toDate();

    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const posts = await this._prisma.post.findMany({
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

      for (const post of posts) {
        if (!post.releaseId || post.releaseId === 'missing') continue;

        try {
          await this._socialCommentsService.syncComments(orgId, post);
        } catch (err: any) {
          this.logger.error(
            `CommentsActivity: Error syncing comments for post ${post.id}:`,
            { error: err?.message }
          );
        }
      }

      hasMore = posts.length === 50;
      if (hasMore) {
        cursor = posts[posts.length - 1].id;
      }
    }
  }

  async getSweepIntervalMinutes(): Promise<number> {
    const minutes = parseInt(process.env.COMMENTS_SWEEP_INTERVAL_MINUTES || '30', 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  }

  async dispatchWebhookForComments(orgId: string, daysBack: number): Promise<void> {
    const since = dayjs().subtract(daysBack, 'day').startOf('day').toDate();

    const posts = await this._prisma.post.findMany({
      where: {
        organizationId: orgId,
        socialComments: {
          some: {
            createdAt: { gte: since },
            isOwn: false,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
      take: 50,
    });

    if (posts.length === 0) return;

    try {
      await this._webhooksService.dispatchEvent(orgId, 'comment.new', {
        batchSize: posts.length,
        timeframe: 'last_sync',
      });
    } catch (err) {
      this.logger.error('dispatchWebhookForComments error:', { error: (err as Error)?.message });
    }
  }

  async getDaysBack(): Promise<number> {
    const days = parseInt(process.env.POST_DAYS_BACK || '30', 10);
    return Number.isFinite(days) && days > 0 ? days : 30;
  }

  async getAllOrganizationIds(): Promise<string[]> {
    const orgs = await this._prisma.organization.findMany({ select: { id: true } });
    return orgs.map(o => o.id);
  }

  async pruneComments(orgId: string): Promise<void> {
    const days = parseInt(process.env.SOCIAL_COMMENT_RETENTION_DAYS || '90', 10);
    const validatedDays = Number.isFinite(days) && days > 0 ? days : 90;
    const cutoff = dayjs().subtract(validatedDays, 'day').toDate();

    let batch = await this._prisma.socialComment.findMany({
      where: { organizationId: orgId, platformCreatedAt: { lt: cutoff }, deletedAt: null },
      take: 1000,
      select: { id: true },
    });

    while (batch.length > 0) {
      await this._prisma.socialComment.updateMany({
        where: { id: { in: batch.map(r => r.id) } },
        data: { deletedAt: new Date() },
      });

      batch = await this._prisma.socialComment.findMany({
        where: { organizationId: orgId, platformCreatedAt: { lt: cutoff }, deletedAt: null },
        take: 1000,
        select: { id: true },
      });
    }
  }

  async notifyNewComments(orgId: string): Promise<void> {
    const cutoff = dayjs().subtract(6, 'hour').toDate();

    const posts = await this._prisma.post.findMany({
      where: {
        organizationId: orgId,
        socialComments: {
          some: {
            createdAt: { gte: cutoff },
            isOwn: false,
            deletedAt: null,
          },
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
      take: 10,
    });

    if (!posts.length) return;

    const totalNewComments = posts.reduce(
      (sum, p) => sum + p.socialComments.length,
      0
    );

    await this._notificationService.notifyCommentDigest(
      orgId,
      totalNewComments,
      posts
    );
  }
}

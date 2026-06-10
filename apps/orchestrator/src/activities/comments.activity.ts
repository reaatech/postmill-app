import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { SocialCommentsService } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { log } from '@temporalio/activity';

@Injectable()
@Activity()
export class CommentsActivity {
  constructor(
    private _prisma: PrismaService,
    private _orgProviderConfigManager: OrgProviderConfigManager,
    private _socialCommentsService: SocialCommentsService,
    private _emailService: EmailService,
    private _webhooksService: WebhooksService,
    private _notificationService: NotificationService,
  ) {}

  @ActivityMethod()
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
          log.error(
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

  @ActivityMethod()
  async getSweepIntervalMinutes(): Promise<number> {
    const minutes = parseInt(process.env.COMMENTS_SWEEP_INTERVAL_MINUTES || '30', 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  }

  @ActivityMethod()
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
      log.error('dispatchWebhookForComments error:', { error: (err as Error)?.message });
    }
  }

  @ActivityMethod()
  async getDaysBack(): Promise<number> {
    const days = parseInt(process.env.POST_DAYS_BACK || '30', 10);
    return Number.isFinite(days) && days > 0 ? days : 30;
  }

  @ActivityMethod()
  async getAllOrganizationIds(): Promise<string[]> {
    const orgs = await this._prisma.organization.findMany({ select: { id: true } });
    return orgs.map(o => o.id);
  }

  @ActivityMethod()
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

  @ActivityMethod()
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

    const memberships = await this._prisma.userOrganization.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });
    const members = memberships.map((m) => m.user);

    if (!members.length) return;

    const totalNewComments = posts.reduce(
      (sum, p) => sum + p.socialComments.length,
      0
    );
    await this._notificationService.notifyInboxBacklog(
      orgId,
      totalNewComments
    );

    const htmlParts: string[] = [];
    for (const post of posts) {
      const platform = post.integration?.name ?? 'Unknown';
      const postTitle = post.content
        ? post.content.substring(0, 120)
        : `Post #${post.id}`;
      htmlParts.push(
        `<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">
          <strong style="color:#1f2937;">${platform}</strong>
          <p style="margin:4px 0;color:#374151;">${postTitle}</p>
          <span style="font-size:13px;color:#6b7280;">${post.socialComments.length} new comment${post.socialComments.length === 1 ? '' : 's'}</span>
        </div>`
      );
    }

    const html = `
      <p style="color:#374151;margin-bottom:16px;">
        You have <strong>${totalNewComments}</strong> new comment${totalNewComments === 1 ? '' : 's'} across <strong>${posts.length}</strong> post${posts.length === 1 ? '' : 's'} in the last 6 hours.
      </p>
      ${htmlParts.join('')}
      <p style="margin-top:16px;font-size:13px;color:#6b7280;">
        <a href="${process.env.FRONTEND_URL || ''}/schedule" style="color:#6366f1;">View all posts</a>
      </p>`;

    for (const member of members) {
      try {
        await this._emailService.sendEmailSync(
          member.email,
          `[Postmill] ${totalNewComments} new comment${totalNewComments === 1 ? '' : 's'} on your posts`,
          html
        );
      } catch (err: any) {
        log.error(
          `notifyNewComments: Failed to send email to ${member.email}`,
          { error: err?.message }
        );
      }
    }
  }
}

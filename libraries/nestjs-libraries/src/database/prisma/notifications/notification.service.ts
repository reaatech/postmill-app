import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationPreferenceService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-preference.service';
import { PushNotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/push-notification.service';
import { NotificationDigestService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-digest.service';
import {
  ChannelToggles,
  DigestFrequency,
  NotificationCategory,
} from '@gitroom/nestjs-libraries/dtos/notifications/notification-preference.dto';

export interface NotifyOptions {
  orgId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, any>;
  channels?: Partial<ChannelToggles>;
  digest?: boolean;
  override?: boolean;
  targetUserIds?: string[];
  html?: string;
}

@Injectable()
export class NotificationService {
  constructor(
    private _notificationRepository: NotificationsRepository,
    private _emailService: EmailService,
    private _organizationRepository: OrganizationRepository,
    private _preferenceService: NotificationPreferenceService,
    private _pushService: PushNotificationService,
    private _digestService: NotificationDigestService
  ) {}

  getMainPageCount(organizationId: string, userId: string) {
    return this._notificationRepository.getUnreadCount(organizationId, userId);
  }

  getNotificationsPaginated(organizationId: string, userId: string, page: number) {
    return this._notificationRepository.getNotificationsPaginated(
      organizationId,
      userId,
      page
    );
  }

  getNotificationsPaginatedForOrg(organizationId: string, page: number) {
    return this._notificationRepository.getNotificationsPaginated(
      organizationId,
      '',
      page
    );
  }

  getNotifications(organizationId: string, userId: string) {
    return this._notificationRepository.getNotifications(organizationId, userId);
  }

  async markAsRead(notificationId: string, userId: string) {
    return this._notificationRepository.markAsRead(notificationId, userId);
  }

  async markAllAsRead(organizationId: string, userId: string) {
    return this._notificationRepository.markAllAsRead(organizationId, userId);
  }

  async deleteNotification(id: string) {
    return this._notificationRepository.deleteNotification(id);
  }

  private _defaultChannels(): ChannelToggles {
    return { email: true, push: true, inApp: true };
  }

  private _channelEnabled(
    prefs: { masters: ChannelToggles; categories: Record<NotificationCategory, ChannelToggles> },
    category: NotificationCategory,
    channel: keyof ChannelToggles,
    override: boolean
  ): boolean {
    if (override) return true;
    return prefs.masters[channel] && prefs.categories[category][channel];
  }

  async notify(options: NotifyOptions): Promise<void> {
    const {
      orgId,
      category,
      title,
      message,
      link,
      metadata,
      channels: requestedChannels,
      digest = false,
      override = false,
      targetUserIds,
      html,
    } = options;

    const allowedUserIds = targetUserIds ? new Set(targetUserIds) : null;

    const channels = { ...this._defaultChannels(), ...requestedChannels };

    const team = await this._organizationRepository.getTeam(orgId);
    const members = team?.users ?? [];

    // Create the shared org notification row.
    const notification = await this._notificationRepository.createNotification({
      organizationId: orgId,
      type: category,
      title,
      content: message,
      link,
      metadata,
    });

    const emailRecipients: { userId: string; email: string }[] = [];
    const pushUserIds: string[] = [];

    for (const member of members) {
      const user = member.user;
      if (allowedUserIds && !allowedUserIds.has(user.id)) continue;
      const prefs = await this._preferenceService.ensureDefaults(user.id);

      if (channels.email && this._channelEnabled(prefs, category, 'email', override)) {
        emailRecipients.push({ userId: user.id, email: user.email });
      }

      if (channels.push && this._channelEnabled(prefs, category, 'push', override)) {
        pushUserIds.push(user.id);
      }
    }

    // Email channel: respect per-user digest frequency for digest-eligible items.
    if (emailRecipients.length > 0) {
      if (digest) {
        await this._routeDigestEmails(orgId, category, title, message, emailRecipients, html);
      } else {
        for (const recipient of emailRecipients) {
          await this.sendEmail(recipient.email, title, message);
        }
      }
    }

    // Push channel.
    if (pushUserIds.length > 0) {
      for (const userId of pushUserIds) {
        await this._pushService.sendPushNotification(userId, {
          title,
          body: message,
          data: metadata ? this._stringifyData(metadata) : undefined,
        });
      }
    }
  }

  private async _routeDigestEmails(
    orgId: string,
    category: NotificationCategory,
    title: string,
    message: string,
    recipients: { userId: string; email: string }[],
    html?: string
  ): Promise<void> {
    const frequencies = await this._preferenceService.getDigestFrequencies(
      recipients.map((r) => r.userId)
    );

    const instantRecipients: string[] = [];
    const queuedRecipients: string[] = [];

    for (const recipient of recipients) {
      const frequency = frequencies[recipient.userId] ?? 'instant';
      if (frequency === 'never') continue;
      if (frequency === 'instant') {
        instantRecipients.push(recipient.email);
      } else {
        queuedRecipients.push(recipient.userId);
      }
    }

    for (const to of instantRecipients) {
      await this.sendEmail(to, title, message);
    }

    if (queuedRecipients.length > 0) {
      await this._digestService.enqueueMany(queuedRecipients, orgId, {
        title,
        message,
        html,
        category,
      });
    }
  }

  private _stringifyData(data: Record<string, any>): Record<string, string> {
    return Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
      return acc;
    }, {} as Record<string, string>);
  }

  async sendEmail(to: string, subject: string, html: string, replyTo?: string) {
    await this._emailService.sendEmail(to, subject, html, 'top', replyTo);
  }

  // Convenience senders.
  async notifyPostPublishFailure(
    orgId: string,
    integrationName: string,
    postId: string,
    subStep?: string,
    errMessage?: string
  ) {
    const subject = subStep
      ? `Post published with ${subStep} failure`
      : 'Post publish failure';
    const baseMessage = subStep
      ? `Your post on ${integrationName} was published, but the "${subStep}" step failed.`
      : `Your post on ${integrationName} could not be published.`;
    const detail = errMessage ? ` ${errMessage}` : ' Please review the error details.';
    await this.notify({
      orgId,
      category: 'post_failed',
      title: subject,
      message: `${baseMessage}${detail}`,
      metadata: { postId, integrationName, subStep, errMessage },
      channels: { email: true, push: true, inApp: true },
    });
  }

  async notifyPostPublished(
    orgId: string,
    integrationName: string,
    releaseURL: string,
    postId: string
  ) {
    const title = `Your post has been published on ${integrationName}`;
    const message = `Your post has been published on ${integrationName} at ${releaseURL}`;
    await this.notify({
      orgId,
      category: 'post_published',
      title,
      message,
      link: releaseURL,
      metadata: { postId, integrationName, releaseURL },
      channels: { email: true, push: false, inApp: true },
      digest: true,
    });
  }

  async notifyChannelError(
    orgId: string,
    integrationName: string,
    providerIdentifier: string,
    reason: 'refresh' | 'disabled',
    postId?: string
  ) {
    const title = `We couldn't post to ${providerIdentifier} for ${integrationName}`;
    const message =
      reason === 'refresh'
        ? `We couldn't post to ${providerIdentifier} for ${integrationName} because you need to reconnect it. Please enable it and try again.`
        : `We couldn't post to ${providerIdentifier} for ${integrationName} because it's disabled. Please enable it and try again.`;
    await this.notify({
      orgId,
      category: 'channel_error',
      title,
      message,
      metadata: { integrationName, providerIdentifier, reason, postId },
      channels: { email: true, push: true, inApp: true },
    });
  }

  async notifyFirstCommentUnsupported(
    orgId: string,
    integrationName: string,
    postId: string
  ) {
    const title = `First comment is not supported on ${integrationName}`;
    const message = `The post was published successfully, but ${integrationName} does not support first comments. Please add the comment manually if the platform allows it.`;
    await this.notify({
      orgId,
      category: 'system',
      title,
      message,
      metadata: { integrationName, postId },
      channels: { email: true, push: false, inApp: true },
    });
  }

  async notifyFirstCommentFailed(
    orgId: string,
    integrationName: string,
    postId: string
  ) {
    const title = `First comment could not be posted on ${integrationName}`;
    const message = `The post was published successfully, but the first comment could not be posted on ${integrationName}. Please add the comment manually.`;
    await this.notify({
      orgId,
      category: 'system',
      title,
      message,
      metadata: { integrationName, postId },
      channels: { email: true, push: false, inApp: true },
    });
  }

  async notifyInboxBacklog(orgId: string, backlogCount: number) {
    if (backlogCount <= 5) return;
    const title = 'Comment inbox backlog';
    const message = `You have ${backlogCount} unhandled comments in your inbox. Responding quickly improves engagement.`;
    await this.notify({
      orgId,
      category: 'comment',
      title,
      message,
      metadata: { backlogCount },
      channels: { email: true, push: false, inApp: true },
      digest: true,
    });
  }

  async notifyBudgetThreshold(orgId: string, scope: string, usagePct: number) {
    const title = `AI budget alert: ${usagePct.toFixed(0)}% used`;
    const message = `Your AI budget for "${scope}" has reached ${usagePct.toFixed(0)}% of the cap. Review your usage in AI settings.`;
    await this.notify({
      orgId,
      category: 'budget',
      title,
      message,
      metadata: { scope, usagePct },
      channels: { email: true, push: false, inApp: true },
    });
  }

  async notifyWatchlistTrend(
    orgId: string,
    accountName: string,
    metric: string,
    changePct: number
  ) {
    const direction = changePct > 0 ? 'increased' : 'decreased';
    const title = `Watchlist alert: ${accountName}`;
    const message = `${accountName} ${metric} has ${direction} by ${Math.abs(changePct).toFixed(1)}%.`;
    await this.notify({
      orgId,
      category: 'watchlist',
      title,
      message,
      metadata: { accountName, metric, changePct },
      channels: { email: true, push: false, inApp: true },
      digest: true,
    });
  }

  async notifyCommentDigest(
    orgId: string,
    totalNewComments: number,
    posts: { id: string; content?: string | null; integration?: { name?: string | null } | null; socialComments: any[] }[]
  ) {
    if (totalNewComments <= 5) return;

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

    await this.notify({
      orgId,
      category: 'comment',
      title: 'Comment inbox backlog',
      message: `You have ${totalNewComments} unhandled comments in your inbox. Responding quickly improves engagement.`,
      metadata: { backlogCount: totalNewComments, posts: posts.map((p) => p.id) },
      channels: { email: true, push: false, inApp: true },
      digest: true,
      html,
    });
  }

  async notifySystem(orgId: string, title: string, message: string, link?: string) {
    await this.notify({
      orgId,
      category: 'system',
      title,
      message,
      link,
      channels: { email: true, push: false, inApp: true },
    });
  }

  hasEmailProvider() {
    return this._emailService.hasProvider();
  }

  hasPushProvider() {
    return this._pushService.hasProvider();
  }
}

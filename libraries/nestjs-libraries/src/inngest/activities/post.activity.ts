import { Injectable, Logger } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  NotificationService,
  NotificationType,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Integration, Post, State } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { AuthTokenDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { timer } from '@gitroom/helpers/utils/timer';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { PROVIDER_CAPABILITIES } from '@gitroom/nestjs-libraries/integrations/social/provider-capabilities';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';

// Drops fields the workflow and downstream activities never read — biggest wins are `error` (grows per retry) and `childrenPost` (Prisma side-loads it on every recursive row).
function slimPost(post: any) {
  if (!post) return post;
  const {
    error,
    childrenPost,
    tags,
    description,
    title,
    parentPostId,
    deletedAt,
    createdAt,
    updatedAt,
    comments,
    errors,
    ...rest
  } = post;
  return rest;
}

@Injectable()
export class PostActivity {
  private readonly logger = new Logger(PostActivity.name);

  constructor(
    private _postService: PostsService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _webhookService: WebhooksService,
    private _subscriptionService: SubscriptionService
  ) {}

  async getIntegrationById(orgId: string, id: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  async searchForMissingThreeHoursPosts() {
    const list = await this._postService.searchForMissingThreeHoursPosts();
    for (const post of list) {
      const provider = this._integrationManager.getSocialIntegrationUnchecked(
        post.integration.providerIdentifier
      );
      const taskQueue = post.integration.providerIdentifier
        .split('-')[0]
        .toLowerCase();
      const maxConcurrentJob = provider?.maxConcurrentJob ?? 1;

      await inngest.send({
        name: 'post/cancel',
        data: { postId: post.id },
      });
      await inngest.send({
        name: 'post/publish',
        data: {
          postId: post.id,
          organizationId: post.organizationId,
          taskQueue,
          maxConcurrentJob,
          postNow: true,
        },
        id: `post_${post.id}`,
      });
    }
  }

  async updatePost(id: string, postId: string, releaseURL: string) {
    await this._postService.updatePost(id, postId, releaseURL);
  }

  async getPost(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return false;
      }
    }
    const post = await this._postService.getPostById(postId, orgId);
    if (post.deletedAt) {
      return false;
    }

    return post;
  }

  async getPostsList(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    return getPosts.map(slimPost);
  }

  async isCommentable(integration: Integration) {
    const getIntegration = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return !!getIntegration.comment;
  }

  async supportsFirstComment(integration: Integration) {
    const capabilities =
      PROVIDER_CAPABILITIES[
        integration.providerIdentifier as keyof typeof PROVIDER_CAPABILITIES
      ];
    if (!capabilities?.firstComment) {
      return false;
    }

    const getIntegration = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return !!getIntegration.comment;
  }

  async postComment(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: Post[]
  ) {
    const getIntegration = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const clientInformation = await this._integrationManager.requireClientInformation(
      integration.providerIdentifier,
      integration.organizationId
    ).catch(() => undefined);

    return getIntegration.comment(
      integration.internalId,
      postId,
      lastPostId,
      integration.token,
      await Promise.all(
        (newPosts || []).map(async (p) => ({
          id: p.id,
          message: stripHtmlValidation(
            getIntegration.editor,
            p.content,
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(p.content),
            getIntegration.mentionFormat
          ),
          settings: JSON.parse(p.settings || '{}'),
          media: await this._postService.updateMedia(
            p.id,
            JSON.parse(p.image || '[]'),
            getIntegration?.convertToJPEG || false,
            integration.organizationId
          ),
        }))
      ),
      integration,
      clientInformation
    );
  }

  async postFirstComment(
    postId: string,
    integration: Integration,
    firstComment: string,
  ) {
    const getIntegration = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const clientInformation = await this._integrationManager.requireClientInformation(
      integration.providerIdentifier,
      integration.organizationId
    ).catch(() => undefined);

    return getIntegration.comment(
      integration.internalId,
      postId,
      undefined,
      integration.token,
      [
        {
          id: makeId(10),
          message: stripHtmlValidation(
            getIntegration.editor,
            firstComment,
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(firstComment),
            getIntegration.mentionFormat
          ),
          settings: {},
          media: [],
        },
      ],
      integration,
      clientInformation
    );
  }

  async postSocial(integration: Integration, posts: Post[]) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        integration.organizationId
      );

      if (!subscription) {
        throw new Error('No active subscription found for this organization.');
      }
    }

    const getIntegration = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const clientInformation = await this._integrationManager.requireClientInformation(
      integration.providerIdentifier,
      integration.organizationId
    ).catch(() => undefined);

    const postNow = await getIntegration.post(
      integration.internalId,
      integration.token,
      await Promise.all(
        (newPosts || []).map(async (p) => ({
          id: p.id,
          message: stripHtmlValidation(
            getIntegration.editor,
            p.content,
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(p.content),
            getIntegration.mentionFormat
          ),
          settings: JSON.parse(p.settings || '{}'),
          media: await this._postService.updateMedia(
            p.id,
            JSON.parse(p.image || '[]'),
            getIntegration?.convertToJPEG || false,
            integration.organizationId
          ),
        }))
      ),
      integration,
      clientInformation
    );

    await inngest.send({
      name: 'streak/start',
      data: { organizationId: integration.organizationId },
      id: `streak_${integration.organizationId}`,
    });

    return postNow;
  }

  async inAppNotification(
    orgId: string,
    subject: string,
    message: string,
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      subject,
      message,
      sendEmail,
      digest,
      type
    );
  }

  async globalPlugs(integration: Integration) {
    return this._postService.checkPlugs(
      integration.organizationId,
      integration.providerIdentifier,
      integration.id
    );
  }

  async updatePostSettings(id: string, settings: string) {
    await this._postService.updatePostSettings(id, settings);
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    await this._postService.changeState(id, state, err, body);
  }

  async internalPlugs(integration: Integration, settings: any) {
    return this._postService.checkInternalPlug(
      integration,
      integration.organizationId,
      integration.id,
      settings
    );
  }

  async sendWebhooks(postId: string, orgId: string, integrationId: string) {
    const webhooks = (await this._webhookService.getWebhooks(orgId)).filter(
      (f) => {
        return (
          f.integrations.length === 0 ||
          f.integrations.some((i) => i.integration.id === integrationId)
        );
      }
    );

    const post = await this._postService.getPostByForWebhookId(postId);
    await Promise.all(
      webhooks.map(async (webhook) => {
        try {
          await safeFetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(post),
          });
        } catch (e) {
          /**empty**/
        }
      })
    );
  }

  async processPlug(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    return this._integrationService.processPlugs(data);
  }

  async processInternalPlug(data: {
    post: string;
    originalIntegration: string;
    integration: string;
    plugName: string;
    orgId: string;
    delay: number;
    information: any;
  }) {
    await this._integrationService.processInternalPlug(data);
  }

  async refreshToken(
    integration: Integration
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration);
      return false;
    }
  }

  async refreshTokenWithCause(
    integration: Integration,
    cause: string
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = await this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration,
        cause
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration, cause);
      return false;
    }
  }

  private getPostWorkflowName(post: Pick<Post, 'settings'>): string {
    if (!post.settings) {
      return 'postWorkflowV105';
    }

    try {
      const settings = JSON.parse(
        typeof post.settings === 'string'
          ? post.settings
          : JSON.stringify(post.settings)
      );
      if (
        settings?.firstComment &&
        !settings?.firstCommentPostedAt &&
        !settings?.firstCommentId
      ) {
        return 'postWorkflowV106';
      }
    } catch (err) {}

    return 'postWorkflowV105';
  }
}

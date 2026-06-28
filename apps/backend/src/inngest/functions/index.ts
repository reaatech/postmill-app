import { PostActivity } from '@gitroom/nestjs-libraries/inngest/activities/post.activity';
import { AnalyticsActivity } from '@gitroom/nestjs-libraries/inngest/activities/analytics.activity';
import { CommentsActivity } from '@gitroom/nestjs-libraries/inngest/activities/comments.activity';
import { EmailActivity } from '@gitroom/nestjs-libraries/inngest/activities/email.activity';
import { IntegrationsActivity } from '@gitroom/nestjs-libraries/inngest/activities/integrations.activity';
import { AutopostActivity } from '@gitroom/nestjs-libraries/inngest/activities/autopost.activity';
import { MediaJobsActivity } from '@gitroom/nestjs-libraries/inngest/activities/media-jobs.activity';
import { DigestActivity } from '@gitroom/nestjs-libraries/inngest/activities/digest.activity';
import { CampaignActivity } from '@gitroom/nestjs-libraries/inngest/activities/campaign.activity';
import { InngestRunRepository } from '@gitroom/nestjs-libraries/database/prisma/inngest-runs/inngest-run.repository';
import { createAnalyticsCollection } from './analytics-collection';
import { createCommentsCollection, createCommentsSyncOrg } from './comments-collection';
import { createMissingPostFinder } from './missing-post-finder';
import { createMediaJobsPoll } from './media-jobs-poll';
import { createSendEmail } from './send-email';
import { createDigestEmailDaily } from './digest-email-daily';
import { createDigestEmailWeekly } from './digest-email-weekly';
import { createCampaignTagPurge } from './campaign-tag-purge';
import { createAutopostProcess } from './autopost-process';
import { createRefreshToken } from './refresh-token';
import { createStreakTracker } from './streak-tracker';
import { createAnalyticsBackfill } from './analytics-backfill';
import { createPostPublishFunctions } from './post-publish';

export interface InngestActivities {
  postActivity: PostActivity;
  analyticsActivity: AnalyticsActivity;
  commentsActivity: CommentsActivity;
  emailActivity: EmailActivity;
  integrationsActivity: IntegrationsActivity;
  autopostActivity: AutopostActivity;
  mediaJobsActivity: MediaJobsActivity;
  digestActivity: DigestActivity;
  campaignActivity: CampaignActivity;
  inngestRunRepository: InngestRunRepository;
}

export const createFunctions = (activities: InngestActivities) => [
  createAnalyticsCollection(activities.analyticsActivity, activities.inngestRunRepository),
  createCommentsCollection(activities.commentsActivity, activities.inngestRunRepository),
  createCommentsSyncOrg(activities.commentsActivity),
  createMissingPostFinder(activities.postActivity, activities.inngestRunRepository),
  createMediaJobsPoll(activities.mediaJobsActivity, activities.inngestRunRepository),
  createSendEmail(activities.emailActivity),
  createDigestEmailDaily(activities.digestActivity),
  createDigestEmailWeekly(activities.digestActivity),
  createCampaignTagPurge(activities.campaignActivity, activities.inngestRunRepository),
  createAutopostProcess(activities.autopostActivity),
  createRefreshToken(activities.integrationsActivity),
  createStreakTracker(activities.emailActivity, activities.postActivity),
  createAnalyticsBackfill(activities.analyticsActivity),
  ...createPostPublishFunctions(activities.postActivity),
];

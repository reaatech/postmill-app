import { Module } from '@nestjs/common';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { PostActivity } from './activities/post.activity';
import { AnalyticsActivity } from './activities/analytics.activity';
import { CommentsActivity } from './activities/comments.activity';
import { EmailActivity } from './activities/email.activity';
import { IntegrationsActivity } from './activities/integrations.activity';
import { AutopostActivity } from './activities/autopost.activity';
import { MediaJobsActivity } from './activities/media-jobs.activity';
import { DigestActivity } from './activities/digest.activity';
import { InngestService } from './inngest.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    PostActivity,
    AnalyticsActivity,
    CommentsActivity,
    EmailActivity,
    IntegrationsActivity,
    AutopostActivity,
    MediaJobsActivity,
    DigestActivity,
    InngestService,
  ],
  exports: [
    PostActivity,
    AnalyticsActivity,
    CommentsActivity,
    EmailActivity,
    IntegrationsActivity,
    AutopostActivity,
    MediaJobsActivity,
    DigestActivity,
    InngestService,
  ],
})
export class InngestModule {}

import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { getTemporalModule } from '@gitroom/nestjs-libraries/temporal/temporal.module';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { AiModule } from '@gitroom/nestjs-libraries/ai/ai.module';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';
import { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';
import { AnalyticsActivity } from '@gitroom/orchestrator/activities/analytics.activity';
import { CommentsActivity } from '@gitroom/orchestrator/activities/comments.activity';
import { HealthController } from '@gitroom/orchestrator/health.controller';

const activities = [
  PostActivity,
  AutopostService,
  EmailActivity,
  IntegrationsActivity,
  AnalyticsActivity,
  CommentsActivity,
];
@Module({
  imports: [
    DatabaseModule,
    // The orchestrator is a SEPARATE Nest app — AiModule's @Global only applies within
    // one app, so it must be imported here for PostsService → RagService (and other
    // AI-layer deps) to resolve. AiModule's AiThrottlerGuard needs ThrottlerModule's
    // tokens, so ThrottlerModule.forRoot must be present too (mirrors backend AppModule).
    AiModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 3600000,
          // Mirrors backend default (raised 90 -> 600); see apps/backend/src/app.module.ts.
          limit: process.env.API_LIMIT ? Number(process.env.API_LIMIT) : 600,
        },
      ],
      storage: new ThrottlerStorageRedisService(ioRedis),
    }),
    getTemporalModule(true, require.resolve('./workflows'), activities),
  ],
  controllers: [HealthController],
  providers: [...activities],
  get exports() {
    return [...this.providers, ...this.imports];
  },
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { AiModule } from '@gitroom/nestjs-libraries/ai/ai.module';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { getTemporalModule } from '@gitroom/nestjs-libraries/temporal/temporal.module';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
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
    // v3.5.0 injected AI-layer deps into shared services the orchestrator uses
    // (PostsService→RagService, AutopostService→AIModelProvider). These live in
    // the (backend-global) AiModule, so the orchestrator must import it too.
    // AiModule's AiThrottlerGuard needs ThrottlerModule's tokens — mirror the
    // backend's ThrottlerModule.forRoot wiring to satisfy that DI.
    AiModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 3600000,
          limit: process.env.API_LIMIT ? Number(process.env.API_LIMIT) : 90,
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

import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { ApiModule } from '@gitroom/backend/api/api.module';
import { APP_GUARD } from '@nestjs/core';
import { PoliciesGuard } from '@gitroom/backend/services/auth/permissions/permissions.guard';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { PublicApiModule } from '@gitroom/backend/public-api/public.api.module';
import { ThrottlerBehindProxyGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import { ThrottlerModule } from '@nestjs/throttler';
import { AgentModule } from '@gitroom/nestjs-libraries/agent/agent.module';
import { ThirdPartyModule } from '@gitroom/nestjs-libraries/3rdparties/thirdparty.module';
import { VideoModule } from '@gitroom/nestjs-libraries/videos/video.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { FILTER } from '@gitroom/nestjs-libraries/sentry/sentry.exception';
import { PROVIDER_NOT_CONFIGURED_FILTER } from '@gitroom/nestjs-libraries/integrations/provider-not-configured.filter';
import { SHORT_LINK_PROVIDER_FILTER } from '@gitroom/nestjs-libraries/short-linking/short-link-provider.filter';
import { ChatModule } from '@gitroom/nestjs-libraries/chat/chat.module';
import { getTemporalModule } from '@gitroom/nestjs-libraries/temporal/temporal.module';
import { TemporalRegisterMissingSearchAttributesModule } from '@gitroom/nestjs-libraries/temporal/temporal.register';
import { InfiniteWorkflowRegisterModule } from '@gitroom/nestjs-libraries/temporal/infinite.workflow.register';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { AiModule } from '@gitroom/nestjs-libraries/ai/ai.module';
import { ScheduleModule } from '@nestjs/schedule';

@Global()
@Module({
  imports: [
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ApiModule,
    PublicApiModule,
    AgentModule,
    ThirdPartyModule,
    VideoModule,
    ChatModule,
    getTemporalModule(false),
    TemporalRegisterMissingSearchAttributesModule,
    InfiniteWorkflowRegisterModule,
    AiModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 3600000,
          // Global abuse backstop (per client IP, 1h window). The frontend SPA fires
          // 15-30 /api calls per page navigation, so the old default of 90/hr tripped
          // during normal interactive use and made the app look dead (blank renders on
          // 429). Sensitive routes have their own tight per-minute @Throttle() decorators
          // (auth 5/min, public 20-60/min, AI 10-30/min); this global limit only needs to
          // catch scraping/abuse. Raised 90 -> 600 default; override via API_LIMIT env.
          limit: process.env.API_LIMIT ? Number(process.env.API_LIMIT) : 600,
        },
      ],
      storage: new ThrottlerStorageRedisService(ioRedis),
    }),
  ],
  controllers: [],
  providers: [
    FILTER,
    PROVIDER_NOT_CONFIGURED_FILTER,
    SHORT_LINK_PROVIDER_FILTER,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PoliciesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OrgRbacGuard,
    },
  ],
  exports: [
    DatabaseModule,
    ApiModule,
    PublicApiModule,
    AgentModule,
    ThrottlerModule,
    ChatModule,
  ],
})
export class AppModule {}

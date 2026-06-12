import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from '@gitroom/backend/api/routes/auth.controller';
import { AuthService } from '@gitroom/backend/services/auth/auth.service';
import { UsersController } from '@gitroom/backend/api/routes/users.controller';
import { AuthMiddleware } from '@gitroom/backend/services/auth/auth.middleware';
import { CsrfMiddleware } from '@gitroom/backend/services/auth/csrf.middleware';
import { StripeController } from '@gitroom/backend/api/routes/stripe.controller';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { AnalyticsV2Controller } from '@gitroom/backend/api/routes/analytics.v2.controller';
import { AnalyticsService } from '@gitroom/nestjs-libraries/analytics/analytics.service';
import { PoliciesGuard } from '@gitroom/backend/services/auth/permissions/permissions.guard';
import { PermissionsService } from '@gitroom/backend/services/auth/permissions/permissions.service';
import { IntegrationsController } from '@gitroom/backend/api/routes/integrations.controller';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { SettingsController } from '@gitroom/backend/api/routes/settings.controller';
import { PostsController } from '@gitroom/backend/api/routes/posts.controller';
import { MediaController } from '@gitroom/backend/api/routes/media.controller';
import { UploadModule } from '@gitroom/nestjs-libraries/upload/upload.module';
import { BillingController } from '@gitroom/backend/api/routes/billing.controller';
import { NotificationsController } from '@gitroom/backend/api/routes/notifications.controller';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { ExtractContentService } from '@gitroom/nestjs-libraries/openai/extract.content.service';
import { CodesService } from '@gitroom/nestjs-libraries/services/codes.service';
import { CopilotController } from '@gitroom/backend/api/routes/copilot.controller';
import { PublicController } from '@gitroom/backend/api/routes/public.controller';
import { RootController } from '@gitroom/backend/api/routes/root.controller';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { WebhookController } from '@gitroom/backend/api/routes/webhooks.controller';
import { SignatureController } from '@gitroom/backend/api/routes/signature.controller';
import { AutopostController } from '@gitroom/backend/api/routes/autopost.controller';
import { SetsController } from '@gitroom/backend/api/routes/sets.controller';
import { ThirdPartyController } from '@gitroom/backend/api/routes/third-party.controller';
import { MonitorController } from '@gitroom/backend/api/routes/monitor.controller';
import { NoAuthIntegrationsController } from '@gitroom/backend/api/routes/no.auth.integrations.controller';
import { EnterpriseController } from '@gitroom/backend/api/routes/enterprise.controller';
import { OAuthAppController } from '@gitroom/backend/api/routes/oauth-app.controller';
import { ApprovedAppsController } from '@gitroom/backend/api/routes/approved-apps.controller';
import { OAuthController, OAuthAuthorizedController } from '@gitroom/backend/api/routes/oauth.controller';
import { AnnouncementsController } from '@gitroom/backend/api/routes/announcements.controller';
import { ChannelConfigController } from '@gitroom/backend/api/routes/channel.config.controller';
import { ChannelConfigPerTenantController } from '@gitroom/backend/api/routes/channel-config.per-tenant.controller';
import { SocialCommentsController } from '@gitroom/backend/api/routes/social-comments.controller';
import { AiSettingsController } from '@gitroom/backend/api/routes/ai-settings.controller';
import { AiModerateController } from '@gitroom/backend/api/routes/ai-moderate.controller';
import { AiUserController } from '@gitroom/backend/api/routes/ai-user.controller';
import { ProviderCapabilitiesController } from '@gitroom/backend/api/routes/provider-capabilities.controller';
import { CampaignsController } from '@gitroom/backend/api/routes/campaigns.controller';
import { RagController } from '@gitroom/backend/api/routes/rag.controller';
import { StorageController } from '@gitroom/backend/api/routes/storage.controller';
import { OrgAiSettingsController } from '@gitroom/backend/api/routes/org-ai-settings.controller';
import { OrgShortLinkSettingsController } from '@gitroom/backend/api/routes/org-shortlink-settings.controller';
import { MediaProviderController } from '@gitroom/backend/api/routes/media-provider.controller';
import { DashboardController } from '@gitroom/backend/api/routes/dashboard.controller';
import { BrandsController } from '@gitroom/backend/api/routes/brands.controller';
import { ApiKeysController } from '@gitroom/backend/api/routes/api-keys.controller';
import { RolesController } from '@gitroom/backend/api/routes/roles.controller';
import { EmailWebhooksController } from '@gitroom/backend/api/routes/email-webhooks.controller';
import { MediaJobsWebhookController } from '@gitroom/backend/api/routes/media-jobs-webhook.controller';
import { AiGuardMiddleware } from '@gitroom/backend/services/ai/ai-guard.middleware';
import { BudgetMiddleware } from '@gitroom/nestjs-libraries/ai/governance/budget.middleware';
import { AuthProviderManager } from '@gitroom/backend/services/auth/providers/providers.manager';
import { GithubProvider } from '@gitroom/backend/services/auth/providers/github.provider';
import { GoogleProvider } from '@gitroom/backend/services/auth/providers/google.provider';
import { FarcasterProvider } from '@gitroom/backend/services/auth/providers/farcaster.provider';
import { WalletProvider } from '@gitroom/backend/services/auth/providers/wallet.provider';
import { OauthProvider } from '@gitroom/backend/services/auth/providers/oauth.provider';
import { AdminController } from '@gitroom/backend/api/routes/admin.controller';
import { OrgRbacGuard } from '@gitroom/backend/services/auth/rbac/org-rbac.guard';
import { SessionCleanupService } from '@gitroom/backend/services/session-cleanup.service';

const authenticatedController = [
  UsersController,
  IntegrationsController,
  SettingsController,
  SocialCommentsController,
  CampaignsController,
  PostsController,
  MediaController,
  BillingController,
  NotificationsController,
  CopilotController,
  WebhookController,
  SignatureController,
  AutopostController,
  SetsController,
  ThirdPartyController,
  OAuthAppController,
  ApprovedAppsController,
  OAuthAuthorizedController,
  AnnouncementsController,
  ChannelConfigController,
  AnalyticsV2Controller,
  AiSettingsController,
  AiModerateController,
  AiUserController,
  ProviderCapabilitiesController,
  StorageController,
  ChannelConfigPerTenantController,
  OrgAiSettingsController,
  RagController,
  OrgShortLinkSettingsController,
  MediaProviderController,
  ApiKeysController,
  DashboardController,
  BrandsController,
  RolesController,
  AdminController,
];
@Module({
  imports: [UploadModule],
  controllers: [
    RootController,
    StripeController,
    AuthController,
    PublicController,
    MonitorController,
    EnterpriseController,
    NoAuthIntegrationsController,
    OAuthController,
    EmailWebhooksController,
    MediaJobsWebhookController,
    ...authenticatedController,
  ],
  providers: [
    AuthService,
    StripeService,
    OpenaiService,
    ExtractContentService,
    AuthMiddleware,
    PoliciesGuard,
    OrgRbacGuard,
    PermissionsService,
    CodesService,
    IntegrationManager,
    TrackService,
    ShortLinkService,
    AuthProviderManager,
    GithubProvider,
    GoogleProvider,
    FarcasterProvider,
    WalletProvider,
    OauthProvider,
    AnalyticsService,
    AiGuardMiddleware,
    SessionCleanupService,
  ],
  get exports() {
    return [...this.imports, ...this.providers];
  },
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(...authenticatedController);
    consumer.apply(CsrfMiddleware).forRoutes(...authenticatedController);
    // path-to-regexp v8 (Express 5 / Nest 11) requires named wildcards; bare `*`
    // throws "Missing parameter name". `{/*splat}` matches both the bare path and
    // everything under it (e.g. /agents and /agents/list).
    consumer
      .apply(BudgetMiddleware)
      .forRoutes({ path: '/agents{/*splat}', method: RequestMethod.ALL });
    consumer
      .apply(BudgetMiddleware)
      .forRoutes({ path: '/copilot{/*splat}', method: RequestMethod.ALL });
    consumer
      .apply(BudgetMiddleware)
      .forRoutes({ path: '/ai{/*splat}', method: RequestMethod.ALL });
    consumer
      .apply(AiGuardMiddleware)
      .forRoutes({ path: '/copilot/chat', method: RequestMethod.POST });
    consumer
      .apply(AiGuardMiddleware)
      .forRoutes({ path: '/copilot/agent', method: RequestMethod.POST });
  }
}

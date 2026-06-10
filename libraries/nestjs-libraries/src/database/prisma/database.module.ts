import { Global, Module } from '@nestjs/common';
import { PrismaRepository, PrismaService, PrismaTransaction } from './prisma.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { SubscriptionRepository } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.repository';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { NotificationsRepository } from '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { ExtractContentService } from '@gitroom/nestjs-libraries/openai/extract.content.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { AgenciesService } from '@gitroom/nestjs-libraries/database/prisma/agencies/agencies.service';
import { AgenciesRepository } from '@gitroom/nestjs-libraries/database/prisma/agencies/agencies.repository';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { ShortLinkRegistry } from '@gitroom/nestjs-libraries/short-linking/short-link.registry';
import { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import { OrgShortLinkSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.repository';
import { BitlyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/bitly.adapter';
import { BlinkAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/blink.adapter';
import { CuttlyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/cuttly.adapter';
import { DubAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/dub.adapter';
import { IsgdAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/isgd.adapter';
import { RebrandlyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/rebrandly.adapter';
import { ShortioAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/shortio.adapter';
import { TinyccAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/tinycc.adapter';
import { TinyurlAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/tinyurl.adapter';
import { TlyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/tly.adapter';
import { VgdAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/vgd.adapter';
import { CleanuriAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/cleanuri.adapter';
import { LinklyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/linkly.adapter';
import { OwlyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/owly.adapter';
import { PixelmeAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/pixelme.adapter';
import { ReplugAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/replug.adapter';
import { SniplyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/sniply.adapter';
import { SwitchyAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/switchy.adapter';
import { T2mAdapter } from '@gitroom/nestjs-libraries/short-linking/adapters/t2m.adapter';
import { WebhooksRepository } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.repository';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { SignatureRepository } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.repository';
import { SignatureService } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.service';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { SetsService } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.service';
import { SetsRepository } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.repository';
import { ThirdPartyRepository } from '@gitroom/nestjs-libraries/database/prisma/third-party/third-party.repository';
import { ThirdPartyService } from '@gitroom/nestjs-libraries/database/prisma/third-party/third-party.service';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { FalService } from '@gitroom/nestjs-libraries/openai/fal.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { OAuthRepository } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.repository';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { AnnouncementsRepository } from '@gitroom/nestjs-libraries/database/prisma/announcements/announcements.repository';
import { AnnouncementsService } from '@gitroom/nestjs-libraries/database/prisma/announcements/announcements.service';
import { ProviderConfigService } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/provider-config.service';
import { ProviderConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/provider-config.repository';
import { ProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/provider-config.manager';
import { OrgProviderConfigService } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/org-provider-config.service';
import { OrgProviderConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/provider-configs/org-provider-config.repository';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';
import { SocialCommentsService } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.service';
import { SocialCommentsRepository } from '@gitroom/nestjs-libraries/database/prisma/social-comments/social.comments.repository';
import { AiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.service';
import { AiSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/ai-settings.repository';
import { OrgAiSettingsService } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service';
import { OrgAiSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.repository';
import { AiRagRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-rag/ai-rag.repository';
import { PgVectorStoreAdapter } from '@gitroom/nestjs-libraries/ai/rag/pgvector.adapter';
import { AnalyticsRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics.repository';
import { RedisService } from '@gitroom/nestjs-libraries/redis/redis.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { MultipartUploadRepository } from '@gitroom/nestjs-libraries/database/prisma/media/multipart-upload.repository';
import { MultipartUploadService } from '@gitroom/nestjs-libraries/database/prisma/media/multipart-upload.service';
import { WatchlistRepository } from '@gitroom/nestjs-libraries/database/prisma/watchlist/watchlist.repository';
import { WatchlistService } from '@gitroom/nestjs-libraries/database/prisma/watchlist/watchlist.service';
import { CampaignsRepository } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.repository';
import { CampaignsService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaigns.service';
import { AuditRepository } from '@gitroom/nestjs-libraries/database/prisma/audit/audit.repository';
import { EmailLogRepository } from '@gitroom/nestjs-libraries/database/prisma/emails/email-log.repository';
import { EmailLogService } from '@gitroom/nestjs-libraries/database/prisma/emails/email-log.service';
import { EmailAdapterRegistry } from '@gitroom/nestjs-libraries/emails/email-adapter.registry';
import { EmptyAdapter } from '@gitroom/nestjs-libraries/emails/adapters/empty.adapter';
import { ResendAdapter } from '@gitroom/nestjs-libraries/emails/adapters/resend.adapter';
import { SendGridAdapter } from '@gitroom/nestjs-libraries/emails/adapters/sendgrid.adapter';
import { MailgunAdapter } from '@gitroom/nestjs-libraries/emails/adapters/mailgun.adapter';
import { PostmarkAdapter } from '@gitroom/nestjs-libraries/emails/adapters/postmark.adapter';
import { SesAdapter } from '@gitroom/nestjs-libraries/emails/adapters/ses.adapter';
import { SmtpAdapter } from '@gitroom/nestjs-libraries/emails/adapters/smtp.adapter';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    PrismaService,
    PrismaRepository,
    PrismaTransaction,
    UsersService,
    UsersRepository,
    OrganizationService,
    OrganizationRepository,
    SubscriptionService,
    SubscriptionRepository,
    NotificationService,
    NotificationsRepository,
    WebhooksRepository,
    WebhooksService,
    IntegrationService,
    IntegrationRepository,
    PostsService,
    PostsRepository,
    StripeService,
    SignatureRepository,
    AutopostRepository,
    AutopostService,
    SignatureService,
    MediaService,
    MediaRepository,
    AgenciesService,
    AgenciesRepository,
    IntegrationManager,
    RefreshIntegrationService,
    ExtractContentService,
    OpenaiService,
    FalService,
    EmailService,
    TrackService,
    ShortLinkService,
    SetsService,
    SetsRepository,
    ThirdPartyRepository,
    ThirdPartyService,
    OAuthRepository,
    OAuthService,
    VideoManager,
    AnnouncementsRepository,
    AnnouncementsService,
    ProviderConfigManager,
    ProviderConfigService,
    ProviderConfigRepository,
    SocialCommentsService,
    SocialCommentsRepository,
    AiSettingsService,
    AiSettingsRepository,
    OrgAiSettingsService,
    OrgAiSettingsRepository,
    AiRagRepository,
    PgVectorStoreAdapter,
    AiSettingsManager,
    AnalyticsRepository,
    RedisService,
    EncryptionService,
    MultipartUploadRepository,
    MultipartUploadService,
    WatchlistRepository,
    WatchlistService,
    CampaignsRepository,
    CampaignsService,
    OrgProviderConfigService,
    OrgProviderConfigRepository,
    OrgProviderConfigManager,
    AuditRepository,
    EmailLogRepository,
    EmailLogService,
    EmailAdapterRegistry,
    EmptyAdapter,
    ResendAdapter,
    SendGridAdapter,
    MailgunAdapter,
    PostmarkAdapter,
    SesAdapter,
    SmtpAdapter,
    ShortLinkRegistry,
    OrgShortLinkSettingsService,
    OrgShortLinkSettingsRepository,
    BitlyAdapter,
    BlinkAdapter,
    CuttlyAdapter,
    DubAdapter,
    IsgdAdapter,
    RebrandlyAdapter,
    ShortioAdapter,
    TinyccAdapter,
    TinyurlAdapter,
    TlyAdapter,
    VgdAdapter,
    CleanuriAdapter,
    LinklyAdapter,
    OwlyAdapter,
    PixelmeAdapter,
    ReplugAdapter,
    SniplyAdapter,
    SwitchyAdapter,
    T2mAdapter,
    {
      provide: 'SHORT_LINK_ADAPTER_REGISTRATION',
      useFactory: (
        registry: ShortLinkRegistry,
        bitly: BitlyAdapter,
        blink: BlinkAdapter,
        cuttly: CuttlyAdapter,
        dub: DubAdapter,
        isgd: IsgdAdapter,
        rebrandly: RebrandlyAdapter,
        shortio: ShortioAdapter,
        tinycc: TinyccAdapter,
        tinyurl: TinyurlAdapter,
        tly: TlyAdapter,
        vgd: VgdAdapter,
        cleanuri: CleanuriAdapter,
        linkly: LinklyAdapter,
        owly: OwlyAdapter,
        pixelme: PixelmeAdapter,
        replug: ReplugAdapter,
        sniply: SniplyAdapter,
        switchy: SwitchyAdapter,
        t2m: T2mAdapter,
      ) => {
        registry.register(bitly);
        registry.register(blink);
        registry.register(cuttly);
        registry.register(dub);
        registry.register(isgd);
        registry.register(rebrandly);
        registry.register(shortio);
        registry.register(tinycc);
        registry.register(tinyurl);
        registry.register(tly);
        registry.register(vgd);
        registry.register(cleanuri);
        registry.register(linkly);
        registry.register(owly);
        registry.register(pixelme);
        registry.register(replug);
        registry.register(sniply);
        registry.register(switchy);
        registry.register(t2m);
      },
      inject: [
        ShortLinkRegistry,
        BitlyAdapter,
        BlinkAdapter,
        CuttlyAdapter,
        DubAdapter,
        IsgdAdapter,
        RebrandlyAdapter,
        ShortioAdapter,
        TinyccAdapter,
        TinyurlAdapter,
        TlyAdapter,
        VgdAdapter,
        CleanuriAdapter,
        LinklyAdapter,
        OwlyAdapter,
        PixelmeAdapter,
        ReplugAdapter,
        SniplyAdapter,
        SwitchyAdapter,
        T2mAdapter,
      ],
    },
    {
      provide: 'EMAIL_ADAPTER_REGISTRATION',
      useFactory: (
        registry: EmailAdapterRegistry,
        empty: EmptyAdapter,
        resend: ResendAdapter,
        sendgrid: SendGridAdapter,
        mailgun: MailgunAdapter,
        postmark: PostmarkAdapter,
        ses: SesAdapter,
        smtp: SmtpAdapter,
      ) => {
        registry.register(empty);
        registry.register(resend);
        registry.register(sendgrid);
        registry.register(mailgun);
        registry.register(postmark);
        registry.register(ses);
        registry.register(smtp);
      },
      inject: [
        EmailAdapterRegistry,
        EmptyAdapter,
        ResendAdapter,
        SendGridAdapter,
        MailgunAdapter,
        PostmarkAdapter,
        SesAdapter,
        SmtpAdapter,
      ],
    },
  ],
  get exports() {
    return this.providers;
  },
})
export class DatabaseModule {}

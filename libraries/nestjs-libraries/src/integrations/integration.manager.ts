import 'reflect-metadata';

import { Injectable, NotFoundException } from '@nestjs/common';
import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';
import { SocialProvider } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { LinkedinProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.provider';
import { RedditProvider } from '@gitroom/nestjs-libraries/integrations/social/reddit.provider';
import { DevToProvider } from '@gitroom/nestjs-libraries/integrations/social/dev.to.provider';
import { HashnodeProvider } from '@gitroom/nestjs-libraries/integrations/social/hashnode.provider';
import { MediumProvider } from '@gitroom/nestjs-libraries/integrations/social/medium.provider';
import { FacebookProvider } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { TiktokProvider } from '@gitroom/nestjs-libraries/integrations/social/tiktok.provider';
import { PinterestProvider } from '@gitroom/nestjs-libraries/integrations/social/pinterest.provider';
import { DribbbleProvider } from '@gitroom/nestjs-libraries/integrations/social/dribbble.provider';
import { LinkedinPageProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.page.provider';
import { ThreadsProvider } from '@gitroom/nestjs-libraries/integrations/social/threads.provider';
import { DiscordProvider } from '@gitroom/nestjs-libraries/integrations/social/discord.provider';
import { SlackProvider } from '@gitroom/nestjs-libraries/integrations/social/slack.provider';
import { MastodonProvider } from '@gitroom/nestjs-libraries/integrations/social/mastodon.provider';
import { BlueskyProvider } from '@gitroom/nestjs-libraries/integrations/social/bluesky.provider';
import { LemmyProvider } from '@gitroom/nestjs-libraries/integrations/social/lemmy.provider';
import { InstagramStandaloneProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.standalone.provider';
import { FarcasterProvider } from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import { TelegramProvider } from '@gitroom/nestjs-libraries/integrations/social/telegram.provider';
import { NostrProvider } from '@gitroom/nestjs-libraries/integrations/social/nostr.provider';
import { VkProvider } from '@gitroom/nestjs-libraries/integrations/social/vk.provider';
import { WordpressProvider } from '@gitroom/nestjs-libraries/integrations/social/wordpress.provider';
import { ListmonkProvider } from '@gitroom/nestjs-libraries/integrations/social/listmonk.provider';
import { GmbProvider } from '@gitroom/nestjs-libraries/integrations/social/gmb.provider';
import { KickProvider } from '@gitroom/nestjs-libraries/integrations/social/kick.provider';
import { TwitchProvider } from '@gitroom/nestjs-libraries/integrations/social/twitch.provider';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { MoltbookProvider } from '@gitroom/nestjs-libraries/integrations/social/moltbook.provider';
import { SkoolProvider } from '@gitroom/nestjs-libraries/integrations/social/skool.provider';
import { WhopProvider } from '@gitroom/nestjs-libraries/integrations/social/whop.provider';
import { MeweProvider } from '@gitroom/nestjs-libraries/integrations/social/mewe.provider';
import { TumblrProvider } from '@gitroom/nestjs-libraries/integrations/social/tumblr.provider';
import { PixelfedProvider } from '@gitroom/nestjs-libraries/integrations/social/pixelfed.provider';
import { PeerTubeProvider } from '@gitroom/nestjs-libraries/integrations/social/peertube.provider';
import { ProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/provider-config.manager';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { ProviderNotConfiguredError } from '@gitroom/nestjs-libraries/integrations/provider-not-configured.error';

export const socialIntegrationList: Array<SocialAbstract & SocialProvider> = [
  new XProvider(),
  new LinkedinProvider(),
  new LinkedinPageProvider(),
  new RedditProvider(),
  new InstagramProvider(),
  new InstagramStandaloneProvider(),
  new FacebookProvider(),
  new ThreadsProvider(),
  new YoutubeProvider(),
  new GmbProvider(),
  new TiktokProvider(),
  new PinterestProvider(),
  new DribbbleProvider(),
  new DiscordProvider(),
  new SlackProvider(),
  new KickProvider(),
  new TwitchProvider(),
  new MastodonProvider(),
  new BlueskyProvider(),
  new LemmyProvider(),
  new FarcasterProvider(),
  new TelegramProvider(),
  new NostrProvider(),
  new VkProvider(),
  new MediumProvider(),
  new DevToProvider(),
  new HashnodeProvider(),
  new WordpressProvider(),
  new ListmonkProvider(),
  new MoltbookProvider(),
  new WhopProvider(),
  new SkoolProvider(),
  new MeweProvider(),
  new TumblrProvider(),
  new PixelfedProvider(),
  new PeerTubeProvider(),
  // new MastodonCustomProvider(),
];

@Injectable()
export class IntegrationManager {
  constructor(
    private _providerConfigManager: ProviderConfigManager,
    private _orgProviderConfigManager: OrgProviderConfigManager
  ) {}

  async getAllIntegrations(orgId?: string) {
    if (orgId) {
      await this._orgProviderConfigManager.ensureFresh(orgId);
    } else {
      await this._providerConfigManager.ensureFresh();
    }
    const enabledIdentifiers = orgId
      ? await this._orgProviderConfigManager.getEnabledIdentifiers(orgId)
      : await this._providerConfigManager.getEnabledIdentifiers();
    const allConfigs = orgId
      ? await this._orgProviderConfigManager.getAllConfigs(orgId)
      : await this._providerConfigManager.getAllConfigs();
    const enabledSet = new Set(enabledIdentifiers);
    const hasAnyConfigs = allConfigs.length > 0;

    return {
      social: await Promise.all(
        socialIntegrationList
          .filter((p) => !hasAnyConfigs || enabledSet.has(p.identifier))
          .map(async (p) => {
            const config = orgId
              ? await this._orgProviderConfigManager.getConfig(orgId, p.identifier)
              : await this._providerConfigManager.getConfig(p.identifier);
            return {
              name: p.name,
              identifier: p.identifier,
              toolTip: p.toolTip,
              editor: p.editor,
              isExternal: !!p.externalUrl,
              isWeb3: !!p.isWeb3,
              isChromeExtension: !!p.isChromeExtension,
              ...(p.extensionCookies
                ? { extensionCookies: p.extensionCookies }
                : {}),
              ...(p.customFields
                ? { customFields: await p.customFields() }
                : {}),
              ...('setupInstructions' in (config || {}) && (config as any)?.setupInstructions
                ? { setupInstructions: (config as any).setupInstructions }
                : {}),
              ...('setupNotes' in (config || {}) && (config as any)?.setupNotes
                ? { setupInstructions: (config as any).setupNotes }
                : {}),
            };
          })
      ),
      article: [] as any[],
    };
  }

  getAllTools(): {
    [key: string]: {
      description: string;
      dataSchema: any;
      methodName: string;
    }[];
  } {
    return socialIntegrationList.reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata('custom:tool', current.constructor.prototype) ||
          [],
      }),
      {}
    );
  }

  getAllRulesDescription(): {
    [key: string]: string;
  } {
    return socialIntegrationList.reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata(
            'custom:rules:description',
            current.constructor
          ) || '',
      }),
      {}
    );
  }

  getAllPlugs() {
    return socialIntegrationList
      .map((p) => {
        return {
          name: p.name,
          identifier: p.identifier,
          plugs: (
            Reflect.getMetadata('custom:plug', p.constructor.prototype) || []
          )
            .filter((f: any) => !f.disabled)
            .map((p: any) => ({
              ...p,
              fields: p.fields.map((c: any) => ({
                ...c,
                validation: c?.validation?.toString(),
              })),
            })),
        };
      })
      .filter((f) => f.plugs.length);
  }

  async getInternalPlugs(providerName: string, orgId?: string) {
    const p = socialIntegrationList.find((p) => p.identifier === providerName);
    if (!p) {
      console.warn(`IntegrationManager: Unknown provider '${providerName}' requested in getInternalPlugs`);
      return { internalPlugs: [] };
    }
    const enabled = orgId
      ? await this._orgProviderConfigManager.isEnabled(orgId, providerName)
      : await this._providerConfigManager.isEnabled(providerName);
    if (!enabled) {
      throw new NotFoundException(`Integration not available: ${providerName}`);
    }
    return {
      internalPlugs:
        (
          Reflect.getMetadata(
            'custom:internal_plug',
            p.constructor.prototype
          ) || []
        ).filter((f: any) => !f.disabled) || [],
    };
  }

  getAllowedSocialsIntegrations() {
    return socialIntegrationList.map((p) => p.identifier);
  }
  async getSocialIntegration(integration: string, orgId?: string): Promise<SocialProvider> {
    const provider = socialIntegrationList.find((i) => i.identifier === integration);
    if (!provider) {
      throw new NotFoundException(`Unknown integration: ${integration}`);
    }
    const enabled = orgId
      ? await this._orgProviderConfigManager.isEnabled(orgId, integration)
      : await this._providerConfigManager.isEnabled(integration);
    if (!enabled) {
      throw new NotFoundException(`Integration not available: ${integration}`);
    }
    return provider;
  }

  // Returns the provider definition WITHOUT checking the enabled state.
  // Used for listing/maintaining already-connected integrations (channel list,
  // token refresh), which must keep working even if an admin later disables the
  // provider for new connections. Returns undefined for genuinely unknown ids.
  getSocialIntegrationUnchecked(
    integration: string
  ): SocialProvider | undefined {
    return socialIntegrationList.find((i) => i.identifier === integration);
  }

  // INTERNAL USE ONLY - returns decrypted client credentials.
  // When configId is provided the credentials of that specific named config are used
  // (each named credential set has its own auth); otherwise resolution falls back to
  // the org's primary config for the provider identifier.
  async getClientInformation(integration: string, orgId?: string, configId?: string | null) {
    if (orgId) {
      if (configId) {
        return this._orgProviderConfigManager.getClientInfoById(orgId, configId);
      }
      return this._orgProviderConfigManager.getClientInfo(orgId, integration);
    }
    return this._providerConfigManager.getClientInfo(integration);
  }

  async requireClientInformation(integration: string, orgId?: string, configId?: string | null) {
    const info = await this.getClientInformation(integration, orgId, configId);
    if (!info?.client_id && !info?.token) {
      throw new ProviderNotConfiguredError(integration, orgId);
    }
    return info;
  }

  async isProviderEnabled(integration: string, orgId?: string) {
    if (orgId) {
      return this._orgProviderConfigManager.isEnabled(orgId, integration);
    }
    return this._providerConfigManager.isEnabled(integration);
  }
}

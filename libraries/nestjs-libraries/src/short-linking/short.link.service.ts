import { Injectable, Logger } from '@nestjs/common';
import { ShortLinkRegistry } from '@gitroom/nestjs-libraries/short-linking/short-link.registry';
import { OrgShortLinkSettingsService } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.service';
import { OrgShortLinkSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/short-links/org-shortlink-settings.repository';
import { type ShortLinkContext } from '@gitroom/nestjs-libraries/short-linking/short-link.interface';
import { uniq } from 'lodash';
import striptags from 'striptags';

@Injectable()
export class ShortLinkService {
  private readonly _logger = new Logger(ShortLinkService.name);

  constructor(
    private _registry: ShortLinkRegistry,
    private _settingsService: OrgShortLinkSettingsService,
    private _repository: OrgShortLinkSettingsRepository,
  ) {}

  private async _resolve(orgId: string): Promise<{ adapter: any; ctx: ShortLinkContext } | null> {
    const active = await this._settingsService.getActiveProvider(orgId);
    if (!active) return null;

    const adapter = this._registry.getAdapter(active.identifier);
    if (!adapter) return null;

    return {
      adapter,
      ctx: {
        orgId,
        credentials: active.credentials || {},
        customDomain: active.customDomain || undefined,
      },
    };
  }

  async askShortLinkedin(orgId: string, messages: string[]): Promise<boolean> {
    const resolved = await this._resolve(orgId);
    if (!resolved) return false;

    const domain = resolved.adapter.resolveDomain(resolved.ctx);
    if (!domain || domain === 'empty') return false;

    const mergeMessages = messages.join(' ');
    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gm;
    const urls = mergeMessages.match(urlRegex);
    if (!urls) return false;

    return urls.some((url) => url.indexOf(domain) === -1);
  }

  async convertTextToShortLinks(orgId: string, messagesList: string[]) {
    const resolved = await this._resolve(orgId);
    if (!resolved) return messagesList;
    const { adapter, ctx } = resolved;
    const domain = adapter.resolveDomain(ctx);

    const messages = messagesList.map((text) => {
      return text
        .replace(/&amp;/g, '&')
        .replace(/&quest;/g, '?')
        .replace(/&num;/g, '#');
    });

    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gm;
    return Promise.all(
      messages.map(async (text) => {
        const urls = uniq(text.match(urlRegex));
        if (!urls) return text;

        const replacementMap: Record<string, string> = {};
        await Promise.all(
          urls.map(async (url) => {
            if (url.indexOf(domain) === -1) {
              try {
                const result = await adapter.createShortLink(ctx, url);
                replacementMap[url] = result.shortUrl;
                await this._repository.recordLink({
                  organizationId: orgId,
                  provider: adapter.identifier,
                  shortUrl: result.shortUrl,
                  originalUrl: url,
                  providerLinkId: result.providerLinkId,
                  postId: undefined,
                }).catch((err) => {
                  this._logger.warn(`Failed to record short link in ledger: ${(err as Error).message}`);
                });
              } catch (err) {
                this._logger.warn(`Failed to shorten URL ${url}: ${(err as Error).message}`);
                replacementMap[url] = url;
              }
            } else {
              replacementMap[url] = url;
            }
          })
        );

        return text.replace(urlRegex, (url) => replacementMap[url] ?? url);
      })
    );
  }

  async convertShortLinksToLinks(orgId: string, messages: string[]) {
    const resolved = await this._resolve(orgId);
    if (!resolved) return messages;
    const { adapter, ctx } = resolved;
    const domain = adapter.resolveDomain(ctx);

    if (!adapter.expandShortLink) return messages;

    const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/g;
    return Promise.all(
      messages.map(async (text) => {
        const urls = text.match(urlRegex);
        if (!urls) return text;

        const replacementMap: Record<string, string> = {};
        await Promise.all(
          urls.map(async (url) => {
            if (url.indexOf(domain) > -1) {
              try {
                replacementMap[url] = await adapter.expandShortLink!(ctx, url);
              } catch {
                replacementMap[url] = url;
              }
            } else {
              replacementMap[url] = url;
            }
          })
        );

        return text.replace(urlRegex, (url) => replacementMap[url] ?? url);
      })
    );
  }

  async getStatistics(orgId: string, messages: string[]) {
    const resolved = await this._resolve(orgId);
    if (!resolved) return [];
    const { adapter, ctx } = resolved;
    const domain = adapter.resolveDomain(ctx);

    if (!adapter.linkStatistics) return [];

    const mergeMessages = messages.join(' ');
    const regex = new RegExp(`https?://${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^\\s]*`, 'g');
    const urls = striptags(mergeMessages).match(regex);
    if (!urls) return [];

    try {
      return await adapter.linkStatistics(ctx, urls);
    } catch (err) {
      this._logger.warn(`Failed to get link statistics: ${(err as Error).message}`);
      return [];
    }
  }

  async getAllLinks(orgId: string) {
    const resolved = await this._resolve(orgId);
    if (!resolved) return [];
    const { adapter, ctx } = resolved;

    if (!adapter.listLinks) return [];

    try {
      const allLinks: any[] = [];
      let page = 1;
      const maxPages = 10;
      while (page <= maxPages) {
        const pageResults = await adapter.listLinks(ctx, page);
        if (!pageResults.length) break;
        allLinks.push(...pageResults);
        if (pageResults.length < 50) break;
        page++;
      }
      return allLinks;
    } catch (err) {
      this._logger.warn(`Failed to list links: ${(err as Error).message}`);
      return [];
    }
  }
}

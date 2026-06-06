import { Injectable, Logger } from '@nestjs/common';
import { WebhooksRepository } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.repository';
import { WebhooksDto } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

const SUPPORTED_EVENT_TYPES = [
  'post.published',
  'comment.new',
  'comment.reply',
  'analytics.snapshot_complete',
] as const;

export type WebhookEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

@Injectable()
export class WebhooksService {
  private readonly _logger = new Logger(WebhooksService.name);

  constructor(private _webhooksRepository: WebhooksRepository) {}

  getSupportedEventTypes(): string[] {
    return [...SUPPORTED_EVENT_TYPES];
  }

  getTotal(orgId: string) {
    return this._webhooksRepository.getTotal(orgId);
  }

  getWebhooks(orgId: string) {
    return this._webhooksRepository.getWebhooks(orgId);
  }

  createWebhook(orgId: string, body: WebhooksDto) {
    return this._webhooksRepository.createWebhook(orgId, body);
  }

  deleteWebhook(orgId: string, id: string) {
    return this._webhooksRepository.deleteWebhook(orgId, id);
  }

  async dispatchEvent(orgId: string, eventType: string, payload: Record<string, any>): Promise<void> {
    const webhooks = (await this._webhooksRepository.getWebhooks(orgId)).filter(
      (w) => w.integrations.length === 0 || eventType === 'post.published'
    );

    if (!webhooks.length) return;

    await Promise.allSettled(
      webhooks.map(async (webhook) => {
        try {
          await safeFetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: eventType, ...payload }),
          });
        } catch (err) {
          this._logger.warn(`Webhook dispatch failed for ${webhook.url}: ${(err as Error)?.message}`);
        }
      })
    );
  }
}

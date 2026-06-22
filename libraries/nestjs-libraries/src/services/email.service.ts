import { Injectable, Logger } from '@nestjs/common';
import { EmailAdapterRegistry } from '@gitroom/nestjs-libraries/emails/email-adapter.registry';
import { EmailLogService } from '@gitroom/nestjs-libraries/database/prisma/emails/email-log.service';
import {
  inngest,
  isInngestEnabled,
} from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { timer } from '@gitroom/helpers/utils/timer';

@Injectable()
export class EmailService {
  private readonly _logger = new Logger(EmailService.name);

  constructor(
    private _registry: EmailAdapterRegistry,
    private _emailLogService: EmailLogService,
  ) {}

  hasProvider() {
    const adapter = this._registry.getActiveAdapter();
    return adapter.name !== 'empty' && adapter.isConfigured();
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    addTo: 'top' | 'bottom',
    replyTo?: string,
  ) {
    if (!isInngestEnabled()) {
      this._logger.debug('Skipping email/send event — Inngest is disabled');
      return;
    }

    return inngest.send({
      name: 'email/send',
      data: { to, subject, html, replyTo, addTo },
    });
  }

  async sendEmailSync(
    to: string,
    subject: string,
    html: string,
    replyTo?: string,
  ) {
    if (to.indexOf('@') === -1) {
      return;
    }

    if (!process.env.EMAIL_FROM_ADDRESS || !process.env.EMAIL_FROM_NAME) {
      this._logger.warn('Email sender information not found in environment variables');
      return;
    }

    const modifiedHtml = `
    <div style="
        background: linear-gradient(to bottom right, #e6f2ff, #f0e6ff);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    ">
        <div style="
            background-color: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(4px);
            border-radius: 0.5rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            max-width: 48rem;
            width: 100%;
            padding: 2rem;
        ">
            <h1 style="
                font-size: 1.875rem;
                font-weight: bold;
                margin-bottom: 1.5rem;
                text-align: left;
                color: #1f2937;
            ">${subject}</h1>
            
            <div style="
                margin-bottom: 2rem;
                color: #374151;
            ">
                ${html}
            </div>
            
            <div style="
                display: flex;
                align-items: center;
                border-top: 1px solid #e5e7eb;
                padding-top: 1.5rem;
            ">
                <div>
                    <h2 style="
                        font-size: 1.25rem;
                        font-weight: 600;
                        color: #1f2937;
                        margin: 0;
                    ">${process.env.EMAIL_FROM_NAME}</h2>
                    <div style="font-size: 12px">
                      You can change your notification preferences in your <a href="${process.env.FRONTEND_URL}/settings">account settings.</a>
                     </div>
                </div>
            </div>
        </div>
    </div>
    `;

    const adapter = this._registry.getActiveAdapter();
    const log = await this._emailLogService.createLog({
      provider: adapter.name,
      toAddress: to,
      fromAddress: process.env.EMAIL_FROM_ADDRESS!,
      subject,
      replyTo,
    });

    // At-least-once semantics: retry up to 3 times on connection-level errors.
    // Business-level rejections (e.g. invalid address, rate-limit) are not retried.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await adapter.send({
          to,
          subject,
          html: modifiedHtml,
          fromName: process.env.EMAIL_FROM_NAME!,
          fromAddress: process.env.EMAIL_FROM_ADDRESS!,
          replyTo,
        });

        if (result.providerMessageId) {
          await this._emailLogService.markSent(log.id, result.providerMessageId);
        } else {
          await this._emailLogService.markSent(log.id, 'no-id');
        }

        return;
      } catch (err) {
        const isConnectionError = (err as Error)?.message && (
          /(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|network|connect|timeout)/i.test((err as Error).message)
        );
        if (!isConnectionError) {
          this._logger.warn(`Non-retryable email error on attempt ${attempt + 1}: ${(err as Error).message}`);
          lastErr = err;
          break;
        }
        lastErr = err;
        this._logger.warn(`Email attempt ${attempt + 1}/3 failed: ${(err as Error).message}`);
        if (attempt < 2) {
          await timer(700);
        }
      }
    }

    const errorMsg = (lastErr as Error)?.message || 'Unknown error';
    this._logger.warn(`Email to ${to} failed after 3 attempts: ${errorMsg}`);
    await this._emailLogService.markFailed(log.id, errorMsg);
  }
}

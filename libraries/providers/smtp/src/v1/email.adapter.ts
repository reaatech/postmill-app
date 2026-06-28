import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  EmailCapability,
  EmailAdapterCapabilities,
  EmailSendParams,
  EmailSendResult,
  ProviderModule,
} from '@gitroom/provider-kernel';

export class SmtpAdapter implements EmailCapability {
  readonly name = 'smtp';
  readonly capabilities: EmailAdapterCapabilities = {
    webhooks: false,
    openTracking: false,
    clickTracking: false,
  };
  readonly requiredEnvKeys = ['EMAIL_SMTP_HOST', 'EMAIL_SMTP_PORT', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME'];

  private _transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this._transporter) {
      const auth: { user?: string; pass?: string } = {};
      if (process.env.EMAIL_SMTP_USER) auth.user = process.env.EMAIL_SMTP_USER;
      if (process.env.EMAIL_SMTP_PASS) auth.pass = process.env.EMAIL_SMTP_PASS;

      this._transporter = nodemailer.createTransport({
        host: process.env.EMAIL_SMTP_HOST,
        port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
        secure: process.env.EMAIL_SMTP_SECURE === 'true',
        ...(auth.user ? { auth } : {}),
      });
    }
    return this._transporter;
  }

  isConfigured(): boolean {
    return !!process.env.EMAIL_SMTP_HOST && !!process.env.EMAIL_SMTP_PORT;
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const transporter = this.getTransporter();
    const info = await transporter.sendMail({
      from: `${params.fromName} <${params.fromAddress}>`,
      to: params.to,
      subject: params.subject,
      text: params.html,
      html: params.html,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });
    return { providerMessageId: info.messageId };
  }
}

const _meta: EmailCapability = new SmtpAdapter();

export const smtpEmailModule: ProviderModule<any, any> = {
  manifest: {
    domain: 'email',
    providerId: _meta.name,
    version: 'v1',
    displayName: _meta.name,
    status: 'active',
    credentialFields: [],
    capabilities: _meta.capabilities,
  },
  create: () => new SmtpAdapter(),
};

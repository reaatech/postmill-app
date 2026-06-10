import { Injectable } from '@nestjs/common';
import { EmailAdapter, EmailAdapterCapabilities, EmailSendParams, EmailSendResult } from '@gitroom/nestjs-libraries/emails/email-adapter.interface';

@Injectable()
export class EmptyAdapter implements EmailAdapter {
  readonly name = 'empty';
  readonly capabilities: EmailAdapterCapabilities = {
    webhooks: false,
    openTracking: false,
    clickTracking: false,
  };
  readonly requiredEnvKeys: string[] = [];

  isConfigured(): boolean {
    return false;
  }

  async send(_params: EmailSendParams): Promise<EmailSendResult> {
    return {};
  }
}

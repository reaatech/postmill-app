import { Injectable } from '@nestjs/common';
import { EmailAdapter } from '@gitroom/nestjs-libraries/emails/email-adapter.interface';

@Injectable()
export class EmailAdapterRegistry {
  private readonly _adapters = new Map<string, EmailAdapter>();

  register(adapter: EmailAdapter): void {
    this._adapters.set(adapter.name, adapter);
  }

  getAdapter(name: string): EmailAdapter | undefined {
    return this._adapters.get(name);
  }

  getActiveAdapter(): EmailAdapter {
    const name = process.env.EMAIL_PROVIDER || '';
    const adapter = this._adapters.get(name);
    if (adapter && adapter.isConfigured()) {
      return adapter;
    }
    return this._adapters.get('empty')!;
  }

  list(): EmailAdapter[] {
    return Array.from(this._adapters.values());
  }
}

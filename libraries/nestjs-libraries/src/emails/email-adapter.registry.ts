import { Injectable } from '@nestjs/common';
import { EmailAdapter } from '@gitroom/nestjs-libraries/emails/email-adapter.interface';

type EmailAdapterConstructor = new () => EmailAdapter;

@Injectable()
export class EmailAdapterRegistry {
  private readonly _instances = new Map<string, EmailAdapter>();
  private readonly _factories = new Map<string, EmailAdapterConstructor>();

  /** Eager registration (kept for tests and callers that already have an instance). */
  register(adapter: EmailAdapter): void {
    this._instances.set(adapter.name, adapter);
  }

  /** Lazy registration: the adapter is constructed on first use. */
  registerFactory(name: string, factory: EmailAdapterConstructor): void {
    this._factories.set(name, factory);
  }

  private _ensureAdapter(name: string): EmailAdapter | undefined {
    if (this._instances.has(name)) {
      return this._instances.get(name);
    }

    const factory = this._factories.get(name);
    if (!factory) {
      return undefined;
    }

    const adapter = new factory();
    this._instances.set(name, adapter);
    return adapter;
  }

  getAdapter(name: string): EmailAdapter | undefined {
    return this._ensureAdapter(name);
  }

  getActiveAdapter(): EmailAdapter {
    const name = process.env.EMAIL_PROVIDER || '';
    const adapter = this._ensureAdapter(name);
    if (adapter && adapter.isConfigured()) {
      return adapter;
    }
    return this._ensureAdapter('empty')!;
  }

  /** Instantiates any registered factories so the returned list is complete. */
  list(): EmailAdapter[] {
    for (const name of this._factories.keys()) {
      this._ensureAdapter(name);
    }
    return Array.from(this._instances.values());
  }
}

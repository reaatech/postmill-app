import { Injectable } from '@nestjs/common';
import { type ShortLinkAdapter, type ShortLinkCapabilities } from './short-link.interface';

type ShortLinkAdapterConstructor = new () => ShortLinkAdapter;

@Injectable()
export class ShortLinkRegistry {
  private readonly _instances = new Map<string, ShortLinkAdapter>();
  private readonly _factories = new Map<string, ShortLinkAdapterConstructor>();

  /** Eager registration (kept for tests and callers that already have an instance). */
  register(adapter: ShortLinkAdapter): void {
    this._instances.set(adapter.identifier, adapter);
  }

  /** Lazy registration: the adapter is constructed on first use. */
  registerFactory(identifier: string, factory: ShortLinkAdapterConstructor): void {
    this._factories.set(identifier, factory);
  }

  private _ensureAdapter(id: string): ShortLinkAdapter | undefined {
    if (this._instances.has(id)) {
      return this._instances.get(id);
    }

    const factory = this._factories.get(id);
    if (!factory) {
      return undefined;
    }

    const adapter = new factory();
    this._instances.set(id, adapter);
    return adapter;
  }

  getAdapter(id: string): ShortLinkAdapter | undefined {
    return this._ensureAdapter(id);
  }

  /** Instantiates any registered factories so the returned list is complete. */
  list(): ShortLinkAdapter[] {
    for (const id of this._factories.keys()) {
      this._ensureAdapter(id);
    }
    return Array.from(this._instances.values());
  }

  capabilitiesFor(id: string): ShortLinkCapabilities | undefined {
    return this._ensureAdapter(id)?.capabilities;
  }
}

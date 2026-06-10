import { Injectable } from '@nestjs/common';
import { type ShortLinkAdapter, type ShortLinkCapabilities } from './short-link.interface';

@Injectable()
export class ShortLinkRegistry {
  private readonly _adapters = new Map<string, ShortLinkAdapter>();

  register(adapter: ShortLinkAdapter): void {
    this._adapters.set(adapter.identifier, adapter);
  }

  getAdapter(id: string): ShortLinkAdapter | undefined {
    return this._adapters.get(id);
  }

  list(): ShortLinkAdapter[] {
    return Array.from(this._adapters.values());
  }

  capabilitiesFor(id: string): ShortLinkCapabilities | undefined {
    return this._adapters.get(id)?.capabilities;
  }
}

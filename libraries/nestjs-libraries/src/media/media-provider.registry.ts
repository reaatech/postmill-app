import { Injectable } from '@nestjs/common';
import { MediaProviderAdapter, MediaProviderCapabilities } from './media-provider-adapter.interface';

@Injectable()
export class MediaProviderRegistry {
  private providers = new Map<string, MediaProviderAdapter>();

  register(provider: MediaProviderAdapter) {
    this.providers.set(provider.identifier, provider);
  }

  get(identifier: string): MediaProviderAdapter | undefined {
    return this.providers.get(identifier);
  }

  getAll(): MediaProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  getCapabilities(): Record<string, MediaProviderCapabilities> {
    const caps: Record<string, MediaProviderCapabilities> = {};
    for (const [id, provider] of this.providers) {
      caps[id] = provider.capabilities;
    }
    return caps;
  }
}

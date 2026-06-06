import { Injectable } from '@nestjs/common';
import { type AIProviderAdapter, type AICapabilities } from './ai-provider.interface';

@Injectable()
export class AIProviderRegistry {
  private readonly _adapters = new Map<string, AIProviderAdapter>();

  register(adapter: AIProviderAdapter): void {
    this._adapters.set(adapter.identifier, adapter);
  }

  getAdapter(id: string): AIProviderAdapter | undefined {
    return this._adapters.get(id);
  }

  list(): AIProviderAdapter[] {
    return Array.from(this._adapters.values());
  }

  capabilitiesFor(id: string): AICapabilities | undefined {
    return this._adapters.get(id)?.capabilities;
  }

  async modelCapabilitiesFor(adapterId: string, modelId: string, creds?: Record<string, string>): Promise<AICapabilities | null> {
    const adapter = this._adapters.get(adapterId);
    if (!adapter) return null;

    const models = await adapter.listModels(creds || {});
    const model = models.find(m => m.id === modelId);
    if (!model) return null; // model not found — caller should fall back to adapter-level if desired

    return model.capabilities;
  }
}

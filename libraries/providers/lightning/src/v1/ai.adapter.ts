import { OpenAICompatibleAdapter, type ProviderModule } from '@gitroom/provider-kernel';

import { metadata as providerMetadata } from './metadata';
const adapter = new OpenAICompatibleAdapter('lightning', 'Lightning AI', 'https://api.lightning.ai/v1', undefined, undefined, 'hub');

export const lightningAiModule: ProviderModule<any, any> = {
  metadata: providerMetadata,
  manifest: {
    domain: 'ai',
    providerId: adapter.identifier,
    version: 'v1',
    displayName: adapter.name,
    status: 'active',
    credentialFields: (adapter as any).credentialFields || [],
    capabilities: (adapter as any).capabilities,
  },
  create: () => adapter as any,
  validateCredentials: async (ctx) => adapter.validateCredentials(ctx.credentials),
};

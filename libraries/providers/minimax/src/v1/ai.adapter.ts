import { OpenAICompatibleAdapter, type ProviderModule } from '@gitroom/provider-kernel';

const adapter = new OpenAICompatibleAdapter('minimax', 'MiniMax', 'https://api.minimax.chat/v1', {"image":true}, undefined, 'direct');

export const minimaxAiModule: ProviderModule<any, any> = {
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

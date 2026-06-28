import { OpenAICompatibleAdapter, type ProviderModule } from '@gitroom/provider-kernel';

const adapter = new OpenAICompatibleAdapter('deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai', {"embeddings":true}, undefined, 'hub');

export const deepinfraAiModule: ProviderModule<any, any> = {
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

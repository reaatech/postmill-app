import { OpenAICompatibleAdapter, type ProviderModule } from '@gitroom/provider-kernel';

const adapter = new OpenAICompatibleAdapter('vultr', 'Vultr Inference', 'https://api.vultr.com/v1', undefined, undefined, 'hub');

export const vultrAiModule: ProviderModule<any, any> = {
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

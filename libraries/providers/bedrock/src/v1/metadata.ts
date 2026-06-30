import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'bedrock',
  displayName: 'bedrock',
  kind: 'hub',
  domains: ['ai', 'media'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['text-to-image', 'image-to-image', 'image-focal-point', 'image-slide'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['claude-haiku-4', 'nova-lite', 'claude-3-5-haiku'],
    'high-reasoning': ['claude-sonnet-4', 'nova-pro', 'claude-3-7-sonnet'],
    workflow: ['claude-sonnet-4', 'nova-pro', 'claude-3-5-sonnet'],
    vision: ['claude-sonnet-4', 'nova-pro', 'claude-3-7-sonnet'],
  },
};

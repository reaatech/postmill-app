import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'gateway',
  displayName: 'gateway',
  kind: 'hub',
  domains: ['ai', 'media'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'image-focal-point', 'image-slide'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['gpt-4.1-mini', 'claude-haiku-4', 'llama-3.1-8b'],
    'high-reasoning': ['gpt-5', 'claude-sonnet-4', 'deepseek-r1'],
    workflow: ['gpt-5', 'claude-sonnet-4', 'llama-3.3-70b'],
    vision: ['gpt-4.1', 'claude-sonnet-4', 'llama-3.2-11b-vision'],
  },
};

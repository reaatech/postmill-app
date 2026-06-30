import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'openai',
  displayName: 'OpenAI',
  kind: 'hub',
  domains: ['ai', 'media'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['text-to-speech', 'text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'video-caption', 'image-focal-point', 'image-slide'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o-mini', 'gpt-4.1'],
    'high-reasoning': ['gpt-5', 'o3', 'o1'],
    workflow: ['gpt-5', 'gpt-4.1', 'gpt-4o'],
    vision: ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],
  },
};

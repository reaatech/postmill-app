import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'fireworks',
  displayName: 'fireworks',
  kind: 'hub',
  domains: ['ai', 'media'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['text-to-image', 'image-to-image', 'image-focal-point', 'image-slide'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['llama-v3p1-8b', 'llama-v3p2-3b'],
    'high-reasoning': ['llama-v3p1-405b', 'llama-v3p1-70b'],
    workflow: ['llama-v3p1-70b', 'llama-v3p1-405b'],
    vision: ['llama-v3p2-11b-vision', 'llama-v3p1-70b'],
  },
};

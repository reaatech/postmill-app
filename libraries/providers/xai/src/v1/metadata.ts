import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'xai',
  displayName: 'xai',
  kind: 'hub',
  domains: ['ai', 'media'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['text-to-image', 'image-to-image', 'image-focal-point', 'image-slide'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['grok-2', 'grok-beta'],
    'high-reasoning': ['grok-3', 'grok-2'],
    workflow: ['grok-2', 'grok-3'],
    vision: ['grok-2-vision', 'grok-3-vision'],
  },
};

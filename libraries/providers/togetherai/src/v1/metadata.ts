import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'togetherai',
  displayName: 'togetherai',
  kind: 'hub',
  domains: ['ai', 'media'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['text-to-speech', 'text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'image-focal-point', 'image-slide'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['llama-3.1-8b', 'llama-3.2-3b', 'mixtral-8x7b'],
    'high-reasoning': ['deepseek-r1', 'llama-3.3-70b', 'llama-3.1-70b'],
    workflow: ['llama-3.3-70b', 'llama-3.1-70b', 'llama-3.2-90b-vision'],
    vision: ['llama-3.2-11b-vision', 'llama-3.2-90b-vision'],
  },
};

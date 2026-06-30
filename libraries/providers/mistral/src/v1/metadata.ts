import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'mistral',
  displayName: 'mistral',
  kind: 'hub',
  domains: ['ai'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['image-focal-point'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['mistral-small', 'mistral-7b'],
    'high-reasoning': ['mistral-large', 'mistral-medium'],
    workflow: ['mistral-large', 'mistral-small'],
    vision: ['pixtral', 'mistral-large'],
  },
};

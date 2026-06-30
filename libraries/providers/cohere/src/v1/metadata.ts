import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'cohere',
  displayName: 'cohere',
  kind: 'hub',
  domains: ['ai'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['image-focal-point'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['command-r', 'command-light'],
    'high-reasoning': ['command-r-plus', 'command-r7b'],
    workflow: ['command-r', 'command-r-plus'],
    vision: ['command-r-plus', 'command-r'],
  },
};

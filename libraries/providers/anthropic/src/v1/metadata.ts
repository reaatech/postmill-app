import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'anthropic',
  displayName: 'anthropic',
  kind: 'hub',
  domains: ['ai'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['image-focal-point'],
  hasModelList: true,
  modelHints: {
    'low-reasoning': ['claude-haiku-4', 'claude-3-5-haiku', 'claude-3-haiku'],
    'high-reasoning': ['claude-sonnet-4', 'claude-3-7-sonnet', 'claude-3-5-sonnet'],
    workflow: ['claude-sonnet-4', 'claude-3-7-sonnet', 'claude-3-5-sonnet'],
    vision: ['claude-sonnet-4', 'claude-3-7-sonnet', 'claude-3-5-sonnet'],
  },
};

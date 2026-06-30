import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'leonardo',
  displayName: 'leonardo',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-image', 'image-to-image', 'image-slide'],
  hasModelList: false,
};

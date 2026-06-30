import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'black-forest-labs',
  displayName: 'black-forest-labs',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-image', 'image-to-image', 'image-slide'],
  hasModelList: false,
};

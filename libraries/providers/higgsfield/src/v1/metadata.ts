import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'higgsfield',
  displayName: 'higgsfield',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'image-slide'],
  hasModelList: false,
};

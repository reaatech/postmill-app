import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'stability-ai',
  displayName: 'stability',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-music', 'text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'image-slide'],
  hasModelList: false,
};

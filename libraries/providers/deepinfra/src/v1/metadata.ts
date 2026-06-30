import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'deepinfra',
  displayName: 'deepinfra',
  kind: 'hub',
  domains: ['ai', 'media'],
  mediaCategories: ['text-to-speech', 'text-to-music', 'text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'image-slide'],
  hasModelList: true,
};

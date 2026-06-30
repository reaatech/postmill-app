import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'qwen',
  displayName: 'qwen',
  kind: 'action',
  domains: ['ai', 'media'],
  mediaCategories: ['text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'image-slide'],
  hasModelList: false,
};

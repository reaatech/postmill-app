import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'replicate',
  displayName: 'replicate',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-music', 'text-to-image', 'image-to-image', 'text-to-video', 'image-to-video', 'video-avatar', 'image-upscale', 'image-bg-remove', 'image-inpaint', 'video-upscale', 'video-background', 'video-to-video', 'image-slide'],
  hasModelList: false,
};

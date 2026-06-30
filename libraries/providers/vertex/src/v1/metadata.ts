import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'vertex',
  displayName: 'vertex',
  kind: 'hub',
  domains: ['ai', 'media'],
  modelCategories: ['low-reasoning', 'high-reasoning', 'workflow', 'vision'],
  mediaCategories: ['text-to-image', 'text-to-video', 'image-to-image', 'image-to-video', 'image-focal-point', 'image-slide'],
  hasModelList: true,
};

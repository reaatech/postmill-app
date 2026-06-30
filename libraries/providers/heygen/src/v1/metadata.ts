import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'heygen',
  displayName: 'heygen',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-video', 'image-to-video', 'video-avatar'],
  hasModelList: false,
};

import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'hedra',
  displayName: 'hedra',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-video', 'image-to-video', 'video-avatar'],
  hasModelList: false,
};

import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'luma',
  displayName: 'luma',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['text-to-video', 'image-to-video'],
  hasModelList: false,
};

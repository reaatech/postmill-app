import { ProviderMetadata } from '@gitroom/provider-kernel';

export const metadata: ProviderMetadata = {
  id: 'deepgram',
  displayName: 'deepgram',
  kind: 'action',
  domains: ['media'],
  mediaCategories: ['video-caption'],
  hasModelList: false,
};

import type { StudioDescriptor } from '@gitroom/frontend/components/media-tools/studio-kit/types';
import { DeepgramPanel } from './deepgram-panel';

// Deepgram (registry/config identifier `deepgram`) is STT — it returns text, not a media
// artifact, so it can't ride the generic kit form/job pipeline. It uses the StudioShell
// chrome with a bespoke `custom` panel that calls the dedicated /media/deepgram backend.
// `operation` is required by the type but unused for a custom tab.
export const deepgramDescriptor: StudioDescriptor = {
  provider: 'deepgram',
  title: 'Deepgram',
  tabs: [
    {
      key: 'transcribe',
      label: 'Transcribe',
      operation: 'audio',
      custom: DeepgramPanel,
      fields: [],
    },
  ],
};

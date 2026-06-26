import type { StudioDescriptor } from '@gitroom/frontend/components/media-tools/studio-kit/types';

// Tavus replica video (registry/config identifier `tavus`). A pre-trained replica id + a
// script produce a personalized talking video; completion arrives via webhook (poll-cron
// fallback). Replicas are created in the Tavus dashboard — paste the id here.
export const tavusDescriptor: StudioDescriptor = {
  provider: 'tavus',
  title: 'Tavus',
  tabs: [
    {
      key: 'replica-video',
      label: 'Replica Video',
      operation: 'video',
      description: 'Generate a talking video from one of your Tavus replicas and a script.',
      fields: [
        {
          type: 'text',
          name: 'replica_id',
          label: 'Replica id',
          required: true,
          placeholder: 'r1a2b3c4…',
          help: 'The id of a replica you created in the Tavus dashboard.',
        },
        { type: 'prompt', name: 'prompt', label: 'Script', required: true, placeholder: 'What should the replica say?' },
        { type: 'text', name: 'video_name', label: 'Video name (optional)', placeholder: 'Launch announcement' },
      ],
    },
  ],
};

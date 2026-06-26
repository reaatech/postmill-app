import type { StudioDescriptor } from '@gitroom/frontend/components/media-tools/studio-kit/types';

// D-ID talking-avatar video (registry/config identifier `did`). A portrait image + a script
// produce a talking-head clip; completion arrives via webhook (poll-cron fallback). The
// source image is resolved server-side to a provider-reachable URL.
export const didDescriptor: StudioDescriptor = {
  provider: 'did',
  title: 'D-ID',
  tabs: [
    {
      key: 'talking-avatar',
      label: 'Talking Avatar',
      operation: 'video',
      description: 'Animate a portrait image to speak your script. The clip lands in your video files.',
      fields: [
        { type: 'media', name: 'source_image', label: 'Portrait image', accept: 'image', required: true },
        { type: 'prompt', name: 'prompt', label: 'Script', required: true, placeholder: 'What should the avatar say?' },
        {
          type: 'select',
          name: 'voice_provider',
          label: 'Voice provider',
          default: 'microsoft',
          options: [
            { value: 'microsoft', label: 'Microsoft' },
            { value: 'amazon', label: 'Amazon' },
            { value: 'elevenlabs', label: 'ElevenLabs' },
          ],
        },
        {
          type: 'text',
          name: 'voice_id',
          label: 'Voice id',
          placeholder: 'e.g. en-US-JennyNeural',
          help: 'Voice id for the selected provider (leave blank for the D-ID default).',
        },
        { type: 'toggle', name: 'stitch', label: 'Stitch (blend into the source frame)', default: true },
      ],
    },
  ],
};

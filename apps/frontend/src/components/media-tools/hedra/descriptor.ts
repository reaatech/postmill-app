import type { StudioDescriptor } from '@gitroom/frontend/components/media-tools/studio-kit/types';

// Hedra character video (registry/config identifier `hedra`). A portrait keyframe + a text
// prompt drive an expressive character clip; completion arrives via webhook (poll-cron
// fallback). The keyframe image is resolved server-side to a provider-reachable URL.
export const hedraDescriptor: StudioDescriptor = {
  provider: 'hedra',
  title: 'Hedra',
  tabs: [
    {
      key: 'character-video',
      label: 'Character Video',
      operation: 'video',
      description: 'Generate an expressive character video from a portrait and a prompt.',
      fields: [
        { type: 'media', name: 'start_keyframe', label: 'Portrait image', accept: 'image', required: true },
        { type: 'prompt', name: 'prompt', label: 'Prompt', required: true, placeholder: 'Describe the scene / performance…' },
        {
          type: 'select',
          name: 'aspect_ratio',
          label: 'Aspect ratio',
          default: '9:16',
          options: [
            { value: '9:16', label: 'Portrait 9:16' },
            { value: '1:1', label: 'Square 1:1' },
            { value: '16:9', label: 'Landscape 16:9' },
          ],
        },
      ],
    },
  ],
};

import type { StudioDescriptor } from '@gitroom/frontend/components/media-tools/studio-kit/types';

// OpenAI image generation (registry/config identifier `openai`). gpt-image-1 and DALL·E 3
// take different param sets, so each is its own tab with a fixed model and its own correct
// fields — field names are native OpenAI Images params. Both return synchronously.
export const openaiDescriptor: StudioDescriptor = {
  provider: 'openai',
  title: 'OpenAI',
  tabs: [
    {
      key: 'gpt-image',
      label: 'GPT Image',
      operation: 'image',
      model: 'gpt-image-1',
      description: 'Generate a still image with gpt-image-1.',
      fields: [
        { type: 'prompt', name: 'prompt', label: 'Prompt', required: true, placeholder: 'Describe the image…' },
        {
          type: 'select',
          name: 'size',
          label: 'Size',
          default: '1024x1024',
          options: [
            { value: '1024x1024', label: 'Square 1024×1024' },
            { value: '1536x1024', label: 'Landscape 1536×1024' },
            { value: '1024x1536', label: 'Portrait 1024×1536' },
            { value: 'auto', label: 'Auto' },
          ],
        },
        {
          type: 'select',
          name: 'quality',
          label: 'Quality',
          default: 'auto',
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ],
        },
        {
          type: 'select',
          name: 'background',
          label: 'Background',
          default: 'auto',
          help: 'Transparent requires PNG or WebP output.',
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'transparent', label: 'Transparent' },
            { value: 'opaque', label: 'Opaque' },
          ],
        },
        {
          type: 'select',
          name: 'output_format',
          label: 'Output format',
          default: 'png',
          options: [
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WebP' },
          ],
        },
        { type: 'number', name: 'n', label: 'Number of images', min: 1, max: 4, step: 1, default: 1 },
      ],
    },
    {
      key: 'dalle-3',
      label: 'DALL·E 3',
      operation: 'image',
      model: 'dall-e-3',
      description: 'Generate a still image with DALL·E 3.',
      fields: [
        { type: 'prompt', name: 'prompt', label: 'Prompt', required: true, placeholder: 'Describe the image…' },
        {
          type: 'select',
          name: 'size',
          label: 'Size',
          default: '1024x1024',
          options: [
            { value: '1024x1024', label: 'Square 1024×1024' },
            { value: '1792x1024', label: 'Landscape 1792×1024' },
            { value: '1024x1792', label: 'Portrait 1024×1792' },
          ],
        },
        {
          type: 'select',
          name: 'quality',
          label: 'Quality',
          default: 'standard',
          options: [
            { value: 'standard', label: 'Standard' },
            { value: 'hd', label: 'HD' },
          ],
        },
        {
          type: 'select',
          name: 'style',
          label: 'Style',
          default: 'vivid',
          options: [
            { value: 'vivid', label: 'Vivid' },
            { value: 'natural', label: 'Natural' },
          ],
        },
      ],
    },
  ],
};

import type { StudioDescriptor } from '@gitroom/frontend/components/media-tools/studio-kit/types';

// Groq — TTS only (PlayAI / Orpheus voices) on the org's existing Groq LLM key
// (universal-credential reuse). OpenAI-compatible `/audio/speech`.
export const groqDescriptor: StudioDescriptor = {
  provider: 'groq',
  title: 'Groq',
  tabs: [
    {
      key: 'text-to-speech',
      label: 'Text → Speech',
      operation: 'audio',
      description: 'Generate a fast voiceover with Groq PlayAI / Orpheus.',
      fields: [
        {
          type: 'select',
          name: 'model',
          label: 'Model',
          default: 'playai-tts',
          options: [
            { value: 'playai-tts', label: 'PlayAI TTS' },
            { value: 'playai-tts-arabic', label: 'PlayAI TTS (Arabic)' },
            { value: 'canopylabs/orpheus-v1-english', label: 'Orpheus (English)' },
          ],
        },
        { type: 'prompt', name: 'prompt', label: 'Text', required: true, placeholder: 'Text to speak…' },
        { type: 'text', name: 'voice', label: 'Voice', placeholder: 'e.g. Fritz-PlayAI' },
        {
          type: 'select',
          name: 'response_format',
          label: 'Format',
          default: 'wav',
          options: [
            { value: 'wav', label: 'WAV' },
            { value: 'mp3', label: 'MP3' },
          ],
        },
      ],
    },
  ],
};

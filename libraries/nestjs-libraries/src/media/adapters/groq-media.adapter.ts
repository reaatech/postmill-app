import {
  MediaProviderCapabilities,
  MediaCredentialOptions,
  MediaOperation,
  MediaModelOption,
} from '../media-provider-adapter.interface';
import { OpenAiCompatibleMediaAdapter } from './openai-compatible-media.adapter';

// Groq — same key as the Groq LLM provider (registry id `groq`), reused via the
// universal-credential fallback. Groq's only media surface is TTS (`/openai/v1/audio/speech`,
// PlayAI / Orpheus voices), which rides the OpenAI-compatible base. No image/video.
export class GroqMediaAdapter extends OpenAiCompatibleMediaAdapter {
  readonly identifier = 'groq';
  readonly name = 'Groq';
  readonly capabilities: MediaProviderCapabilities = {
    image: false,
    video: false,
    audio: true,
    avatar: false,
    tts: true,
    stt: false,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  protected readonly baseUrl = 'https://api.groq.com/openai/v1';
  protected override defaultAudioModel = 'playai-tts';
  protected override defaultVoice = 'Fritz-PlayAI';

  // Groq's /models endpoint lists all (mostly LLM) models without a TTS tag — the descriptor
  // carries the curated TTS model list + free entry instead.
  protected override _modelTypes(): string[] {
    return [];
  }

  override async listModels(_operation: MediaOperation, _options?: MediaCredentialOptions): Promise<MediaModelOption[]> {
    return [];
  }
}

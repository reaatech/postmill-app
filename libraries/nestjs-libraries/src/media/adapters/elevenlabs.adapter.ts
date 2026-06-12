import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaJobSubmission,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

export class ElevenLabsAdapter implements MediaProviderAdapter {
  readonly identifier = 'elevenlabs';
  readonly name = 'ElevenLabs';
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

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('ElevenLabs does not support image generation');
  }

  async generateVideo(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('ElevenLabs does not support video generation');
  }

  // ElevenLabs TTS is synchronous — return the artifact inline.
  async generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const audio = await this.textToSpeech(prompt, options);
    const base64 = Buffer.isBuffer(audio) ? audio.toString('base64') : audio;
    return {
      jobId: `elevenlabs-audio-${Date.now()}`,
      artifactUrl: `data:audio/mpeg;base64,${base64}`,
      metadata: { provider: this.identifier, mime: 'audio/mpeg' },
    };
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('ElevenLabs does not support avatar generation');
  }

  async textToSpeech(text: string, options?: MediaGenerateOptions): Promise<Buffer | string> {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('ElevenLabs API key is required');

    const voiceId = options?.voiceId || options?.voice || '21m00Tcm4TlvDq8ikWAM';
    const model = options?.model || 'eleven_monolingual_v1';

    const res = await safeFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: options?.voiceSettings?.stability ?? 0.5,
          similarity_boost: options?.voiceSettings?.similarityBoost ?? 0.75,
        },
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

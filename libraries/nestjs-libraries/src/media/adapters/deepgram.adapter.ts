import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaJobSubmission,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

interface DeepgramListenResponse {
  results?: {
    channels?: {
      alternatives?: { transcript?: string }[];
    }[];
  };
}

export class DeepgramAdapter implements MediaProviderAdapter {
  readonly identifier = 'deepgram';
  readonly name = 'Deepgram';
  readonly capabilities: MediaProviderCapabilities = {
    image: false,
    video: false,
    audio: false,
    avatar: false,
    tts: false,
    stt: true,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('Deepgram does not support image generation');
  }

  async generateVideo(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Deepgram does not support video generation');
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Deepgram does not support audio generation');
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Deepgram does not support avatar generation');
  }

  async speechToText(audio: Buffer, options?: MediaGenerateOptions): Promise<string> {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('Deepgram API key is required');

    const res = await safeFetch(`https://api.deepgram.com/v1/listen?model=${options?.model || 'whisper'}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': options?.mimeType || 'audio/wav',
      },
      body: new Uint8Array(audio),
    });

    if (!res.ok) throw new Error(`Deepgram STT failed: ${await res.text()}`);
    const data = (await res.json()) as DeepgramListenResponse;
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (!transcript) throw new Error('Deepgram returned no transcript');
    return transcript;
  }
}

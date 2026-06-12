import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaJobSubmission,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

interface OpenAIImageResponse {
  data?: { url?: string; b64_json?: string }[];
}

interface OpenAITranscriptionResponse {
  text?: string;
  segments?: { start: number; end: number; text: string }[];
}

export class OpenaiMediaAdapter implements MediaProviderAdapter {
  readonly identifier = 'openai';
  readonly name = 'OpenAI';
  readonly capabilities: MediaProviderCapabilities = {
    image: true,
    video: false,
    audio: true,
    avatar: false,
    tts: true,
    stt: true,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  private _apiKey(options?: MediaGenerateOptions): string {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('OpenAI API key is required');
    return apiKey;
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const apiKey = this._apiKey(options);
    const model = options?.model || 'dall-e-3';

    const res = await safeFetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: options?.n || 1,
        size: options?.size || '1024x1024',
        quality: options?.quality || 'standard',
      }),
    });

    if (!res.ok) throw new Error(`OpenAI image generation failed: ${await res.text()}`);
    const data = (await res.json()) as OpenAIImageResponse;
    const urls = (data.data || [])
      .map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : undefined))
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (urls.length === 0) throw new Error('OpenAI returned no images');
    return {
      multi: urls.length > 1,
      image: urls[0],
      images: urls,
      metadata: { provider: this.identifier, model },
    };
  }

  async generateVideo(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('OpenAI does not support video generation');
  }

  // OpenAI TTS is synchronous — return the artifact inline.
  async generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const audio = await this.textToSpeech(prompt, options);
    const base64 = Buffer.isBuffer(audio) ? audio.toString('base64') : audio;
    return {
      jobId: `openai-audio-${Date.now()}`,
      artifactUrl: `data:audio/mpeg;base64,${base64}`,
      metadata: { provider: this.identifier, model: options?.model || 'tts-1', mime: 'audio/mpeg' },
    };
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('OpenAI does not support avatar generation');
  }

  async textToSpeech(text: string, options?: MediaGenerateOptions): Promise<Buffer | string> {
    const apiKey = this._apiKey(options);

    const res = await safeFetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'tts-1',
        input: text,
        voice: options?.voice || 'alloy',
        response_format: options?.format || 'mp3',
      }),
    });

    if (!res.ok) throw new Error(`OpenAI TTS failed: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async speechToText(audio: Buffer, options?: MediaGenerateOptions): Promise<string> {
    const apiKey = this._apiKey(options);

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(audio)]), 'audio.mp3');
    formData.append('model', options?.model || 'whisper-1');

    const res = await safeFetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) throw new Error(`OpenAI STT failed: ${await res.text()}`);
    const data = (await res.json()) as OpenAITranscriptionResponse;
    return data.text || '';
  }
}

import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaPollResult,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

const BASE = 'https://api.lumalabs.ai/dream-machine/v1';

interface LumaGenerationResponse {
  id?: string;
  state?: string;
  failure_reason?: string;
  assets?: { video?: string };
}

export class LumaAdapter implements MediaProviderAdapter {
  readonly identifier = 'luma';
  readonly name = 'Luma';
  readonly capabilities: MediaProviderCapabilities = {
    image: false,
    video: true,
    audio: false,
    avatar: false,
    tts: false,
    stt: false,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  private _headers(options?: MediaCredentialOptions): Record<string, string> {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('Luma API key is required');
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    };
  }

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('Luma does not support image generation');
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    // Native Luma params (model, resolution, duration, loop, aspect_ratio) ride
    // `options.input` straight into the body. `start_image_url`/`end_image_url` are
    // flattened convenience fields the adapter folds into the nested `keyframes`.
    const input = (options?.input || {}) as Record<string, unknown>;
    const { start_image_url, end_image_url, ...rest } = input;
    const keyframes: Record<string, unknown> = {};
    if (typeof start_image_url === 'string') keyframes.frame0 = { type: 'image', url: start_image_url };
    if (typeof end_image_url === 'string') keyframes.frame1 = { type: 'image', url: end_image_url };

    const res = await safeFetch(`${BASE}/generations`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        prompt,
        aspect_ratio: '16:9',
        ...(options?.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
        ...(options?.loop !== undefined ? { loop: options.loop } : {}),
        ...(options?.model ? { model: options.model } : {}),
        ...rest,
        ...(Object.keys(keyframes).length ? { keyframes } : {}),
        ...(options?.webhookUrl ? { callback_url: options.webhookUrl } : {}),
      }),
    });

    if (!res.ok) throw new Error(`Luma video generation failed: ${await res.text()}`);
    const data = (await res.json()) as LumaGenerationResponse;
    if (!data.id) throw new Error('Luma returned no generation id');
    return { jobId: data.id };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Luma does not support audio generation');
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Luma does not support avatar generation');
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await safeFetch(`${BASE}/generations/${jobId}`, {
      headers: this._headers(options),
    });

    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as LumaGenerationResponse;

    switch (data.state) {
      case 'completed':
        if (!data.assets?.video) return { status: 'failed', error: 'Luma generation completed without video' };
        return {
          status: 'completed',
          artifactUrl: data.assets.video,
          metadata: { provider: this.identifier, mime: 'video/mp4' },
        };
      case 'failed':
        return { status: 'failed', error: data.failure_reason || 'Unknown error' };
      default:
        return { status: 'pending' };
    }
  }
}

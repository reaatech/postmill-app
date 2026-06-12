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

interface HeyGenGenerateResponse {
  data?: { video_id?: string };
}

interface HeyGenStatusResponse {
  data?: {
    status?: string;
    video_url?: string;
    duration?: number;
    error?: { message?: string };
  };
}

export class HeyGenAdapter implements MediaProviderAdapter {
  readonly identifier = 'heygen';
  readonly name = 'HeyGen';
  readonly capabilities: MediaProviderCapabilities = {
    image: false,
    video: true,
    audio: false,
    avatar: true,
    tts: false,
    stt: false,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  private _headers(options?: MediaCredentialOptions): Record<string, string> {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('HeyGen API key is required');
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-key': apiKey,
    };
  }

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('HeyGen does not support image generation');
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const res = await safeFetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        video_inputs: [
          {
            character: { type: 'avatar', avatar_id: options?.avatarId },
            voice: { type: 'text', input_text: prompt },
          },
        ],
        ...(options?.webhookUrl ? { callback_url: options.webhookUrl } : {}),
      }),
    });

    if (!res.ok) throw new Error(`HeyGen video generation failed: ${await res.text()}`);
    const { data } = (await res.json()) as HeyGenGenerateResponse;
    if (!data?.video_id) throw new Error('HeyGen returned no video id');
    return { jobId: data.video_id };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('HeyGen does not support standalone audio generation');
  }

  generateAvatar(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this.generateVideo(prompt, options);
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await safeFetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`, {
      headers: this._headers(options),
    });

    if (!res.ok) return { status: 'failed', error: await res.text() };
    const { data } = (await res.json()) as HeyGenStatusResponse;

    if (data?.status === 'completed') {
      if (!data.video_url) return { status: 'failed', error: 'HeyGen video completed without a URL' };
      return {
        status: 'completed',
        artifactUrl: data.video_url,
        metadata: { provider: this.identifier, mime: 'video/mp4', durationSeconds: data.duration },
      };
    }
    if (data?.status === 'failed') return { status: 'failed', error: data.error?.message };
    return { status: 'pending' };
  }
}

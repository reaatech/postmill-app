import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaInputValue,
  MediaPollResult,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

const BASE = 'https://api.hedra.com/web-app/public';

interface HedraGenerationResponse {
  id?: string;
  generation_id?: string;
  status?: string;
  url?: string;
  asset_url?: string;
  error_message?: string;
}

export class HedraAdapter implements MediaProviderAdapter {
  readonly identifier = 'hedra';
  readonly name = 'Hedra';
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
    if (!apiKey) throw new Error('Hedra API key is required');
    return { 'Content-Type': 'application/json', 'X-API-Key': apiKey };
  }

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('Hedra does not support image generation');
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    // The studio resolves the start-keyframe media field to a reachable URL in `options.input`;
    // legacy callers still pass it via top-level options.
    const input = (options?.input || {}) as Record<string, MediaInputValue>;
    const startKeyframe =
      options?.sourceUrl ||
      (typeof input.start_keyframe === 'string' ? input.start_keyframe : undefined) ||
      (typeof input.start_keyframe_url === 'string' ? input.start_keyframe_url : undefined);
    const aspectRatio =
      options?.aspectRatio || (typeof input.aspect_ratio === 'string' ? input.aspect_ratio : undefined);

    const res = await safeFetch(`${BASE}/generations`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        type: 'video',
        text_prompt: prompt,
        ...(options?.model ? { ai_model_id: options.model } : {}),
        ...(options?.avatarId ? { avatar_id: options.avatarId } : {}),
        ...(startKeyframe ? { start_keyframe_url: startKeyframe } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Hedra video generation failed: ${await res.text()}`);
    const data = (await res.json()) as HedraGenerationResponse;
    const jobId = data.id || data.generation_id;
    if (!jobId) throw new Error('Hedra returned no generation id');
    return { jobId };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Hedra does not support standalone audio generation');
  }

  generateAvatar(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this.generateVideo(prompt, options);
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await safeFetch(`${BASE}/generations/${jobId}/status`, {
      headers: this._headers(options),
    });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as HedraGenerationResponse;

    if (data.status === 'complete') {
      const artifactUrl = data.url || data.asset_url;
      if (!artifactUrl) return { status: 'failed', error: 'Hedra generation complete without an asset URL' };
      return { status: 'completed', artifactUrl, metadata: { provider: this.identifier, mime: 'video/mp4' } };
    }
    if (data.status === 'error' || data.status === 'failed') {
      return { status: 'failed', error: data.error_message || 'Hedra generation failed' };
    }
    return { status: 'pending' };
  }
}

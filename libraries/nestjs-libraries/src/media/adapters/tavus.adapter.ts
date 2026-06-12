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

const BASE = 'https://tavusapi.com/v2';

interface TavusVideoResponse {
  video_id?: string;
  status?: string;
  download_url?: string;
  hosted_url?: string;
  error?: string;
}

export class TavusAdapter implements MediaProviderAdapter {
  readonly identifier = 'tavus';
  readonly name = 'Tavus';
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
    if (!apiKey) throw new Error('Tavus API key is required');
    return { 'Content-Type': 'application/json', 'x-api-key': apiKey };
  }

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('Tavus does not support image generation');
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const replicaId = options?.avatarId || options?.credentials?.replicaId;
    if (!replicaId) throw new Error('Tavus video generation requires a replica id (avatarId)');

    const res = await safeFetch(`${BASE}/videos`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        replica_id: replicaId,
        script: prompt,
        ...(options?.webhookUrl ? { callback_url: options.webhookUrl } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Tavus video generation failed: ${await res.text()}`);
    const data = (await res.json()) as TavusVideoResponse;
    if (!data.video_id) throw new Error('Tavus returned no video id');
    return { jobId: data.video_id };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Tavus does not support standalone audio generation');
  }

  generateAvatar(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this.generateVideo(prompt, options);
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await safeFetch(`${BASE}/videos/${jobId}`, {
      headers: this._headers(options),
    });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as TavusVideoResponse;

    if (data.status === 'ready') {
      const artifactUrl = data.download_url || data.hosted_url;
      if (!artifactUrl) return { status: 'failed', error: 'Tavus video ready without a download URL' };
      return { status: 'completed', artifactUrl, metadata: { provider: this.identifier, mime: 'video/mp4' } };
    }
    if (data.status === 'error' || data.status === 'deleted') {
      return { status: 'failed', error: data.error || `Tavus video status: ${data.status}` };
    }
    return { status: 'pending' };
  }
}

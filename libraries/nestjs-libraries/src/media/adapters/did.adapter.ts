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

const BASE = 'https://api.d-id.com';

interface DIDTalkResponse {
  id?: string;
  status?: string;
  result_url?: string;
  error?: { description?: string };
}

export class DIDAdapter implements MediaProviderAdapter {
  readonly identifier = 'did';
  readonly name = 'D-ID';
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
    if (!apiKey) throw new Error('D-ID API key is required');
    return {
      'Content-Type': 'application/json',
      Authorization: `Basic ${apiKey}`,
    };
  }

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('D-ID does not support image generation');
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const sourceUrl = options?.sourceUrl || options?.credentials?.sourceUrl;
    if (!sourceUrl) throw new Error('D-ID talking-avatar generation requires a source image (sourceUrl)');

    const res = await safeFetch(`${BASE}/talks`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        script: { type: 'text', input: prompt },
        source_url: sourceUrl,
        ...(options?.webhookUrl ? { webhook: options.webhookUrl } : {}),
      }),
    });
    if (!res.ok) throw new Error(`D-ID video generation failed: ${await res.text()}`);
    const data = (await res.json()) as DIDTalkResponse;
    if (!data.id) throw new Error('D-ID returned no talk id');
    return { jobId: data.id };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('D-ID does not support standalone audio generation');
  }

  generateAvatar(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this.generateVideo(prompt, options);
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await safeFetch(`${BASE}/talks/${jobId}`, {
      headers: this._headers(options),
    });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as DIDTalkResponse;

    if (data.status === 'done') {
      if (!data.result_url) return { status: 'failed', error: 'D-ID talk done without a result URL' };
      return {
        status: 'completed',
        artifactUrl: data.result_url,
        metadata: { provider: this.identifier, mime: 'video/mp4' },
      };
    }
    if (data.status === 'error' || data.status === 'rejected') {
      return { status: 'failed', error: data.error?.description || `D-ID talk status: ${data.status}` };
    }
    return { status: 'pending' };
  }
}

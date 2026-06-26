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

const BASE = 'https://api.replicate.com/v1';

type ReplicateOutput = string | string[] | undefined;

interface ReplicatePredictionResponse {
  id?: string;
  status?: string;
  output?: ReplicateOutput;
  error?: string;
}

function firstOutputUrl(output: ReplicateOutput): string | undefined {
  if (Array.isArray(output)) return output.find((u) => typeof u === 'string');
  return typeof output === 'string' ? output : undefined;
}

export class ReplicateMediaAdapter implements MediaProviderAdapter {
  readonly identifier = 'replicate';
  readonly name = 'Replicate';
  readonly capabilities: MediaProviderCapabilities = {
    image: true,
    video: true,
    audio: true,
    avatar: true,
    tts: false,
    stt: false,
    upscale: true,
    bgRemove: true,
    inpaint: true,
  };

  private _headers(options?: MediaCredentialOptions, preferWait?: number): Record<string, string> {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('Replicate API key is required');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(preferWait ? { Prefer: `wait=${preferWait}` } : {}),
    };
  }

  private async _createPrediction(
    options: MediaGenerateOptions | undefined,
    input: Record<string, string | number | boolean | undefined>,
    preferWait?: number,
  ): Promise<ReplicatePredictionResponse> {
    const res = await safeFetch(`${BASE}/predictions`, {
      method: 'POST',
      headers: this._headers(options, preferWait),
      body: JSON.stringify({
        version: options?.version,
        input: { ...input, ...options?.input },
        ...(options?.webhookUrl
          ? { webhook: options.webhookUrl, webhook_events_filter: ['completed'] }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Replicate request failed: ${await res.text()}`);
    return (await res.json()) as ReplicatePredictionResponse;
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const data = await this._createPrediction(
      { ...options, version: options?.version || options?.model || 'black-forest-labs/flux-schnell' },
      { prompt },
      60,
    );
    const output = data.output;
    if (!output) throw new Error('Replicate returned no output');

    if (Array.isArray(output)) {
      const urls = output.filter((u): u is string => typeof u === 'string');
      if (urls.length === 0) throw new Error('Replicate returned no image URLs');
      return { multi: urls.length > 1, image: urls[0], images: urls, metadata: { provider: this.identifier } };
    }
    if (typeof output === 'string') {
      return { multi: false, image: output, images: [output], metadata: { provider: this.identifier } };
    }
    throw new Error(`Unexpected Replicate output format: ${JSON.stringify(output)}`);
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const data = await this._createPrediction(options, { prompt });
    if (!data.id) throw new Error('Replicate returned no prediction id');
    return { jobId: data.id };
  }

  generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this.generateVideo(prompt, options);
  }

  generateAvatar(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this.generateVideo(prompt, options);
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await safeFetch(`${BASE}/predictions/${jobId}`, {
      headers: this._headers(options),
    });

    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as ReplicatePredictionResponse;

    switch (data.status) {
      case 'succeeded': {
        const url = firstOutputUrl(data.output);
        if (!url) return { status: 'failed', error: 'Replicate prediction succeeded without output' };
        return { status: 'completed', artifactUrl: url, metadata: { provider: this.identifier } };
      }
      case 'failed':
      case 'canceled':
        return { status: 'failed', error: data.error || 'Unknown error' };
      default:
        return { status: 'pending' };
    }
  }

  async upscaleImage(imageUrl: string, options?: MediaGenerateOptions): Promise<string> {
    const data = await this._createPrediction(
      { ...options, version: options?.version || 'nightmareai/real-esrgan' },
      { image: imageUrl, scale: options?.scale || 4 },
      60,
    );
    return firstOutputUrl(data.output) || '';
  }

  async removeBackground(imageUrl: string, options?: MediaGenerateOptions): Promise<string> {
    const data = await this._createPrediction(
      { ...options, version: options?.version || 'cjwbw/rembg' },
      { image: imageUrl },
      60,
    );
    return firstOutputUrl(data.output) || '';
  }

  async inpaintImage(imageUrl: string, maskUrl: string, prompt: string, options?: MediaGenerateOptions): Promise<string> {
    const data = await this._createPrediction(
      { ...options, version: options?.version || 'stability-ai/stable-diffusion-inpainting' },
      { image: imageUrl, mask: maskUrl, prompt },
      60,
    );
    return firstOutputUrl(data.output) || '';
  }

  async runOfficial(
    modelId: string,
    input: Record<string, unknown>,
    opts?: { wait?: boolean; webhookUrl?: string; apiKey?: string; credentials?: Record<string, string> },
  ): Promise<ReplicatePredictionResponse> {
    const res = await safeFetch(`${BASE}/models/${modelId}/predictions`, {
      method: 'POST',
      headers: this._headers(opts, opts?.wait ? 60 : undefined),
      body: JSON.stringify({
        input,
        ...(opts?.webhookUrl
          ? { webhook: opts.webhookUrl, webhook_events_filter: ['completed'] }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Replicate request failed: ${await res.text()}`);
    return (await res.json()) as ReplicatePredictionResponse;
  }

  async runCommunity(
    versionId: string,
    input: Record<string, unknown>,
    opts?: { wait?: boolean; webhookUrl?: string; apiKey?: string; credentials?: Record<string, string> },
  ): Promise<ReplicatePredictionResponse> {
    const res = await safeFetch(`${BASE}/predictions`, {
      method: 'POST',
      headers: this._headers(opts, opts?.wait ? 60 : undefined),
      body: JSON.stringify({
        version: versionId,
        input,
        ...(opts?.webhookUrl
          ? { webhook: opts.webhookUrl, webhook_events_filter: ['completed'] }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Replicate request failed: ${await res.text()}`);
    return (await res.json()) as ReplicatePredictionResponse;
  }
}

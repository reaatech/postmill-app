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

interface FalQueueSubmitResponse {
  request_id?: string;
}

interface FalQueueStatusResponse {
  status?: string;
  error?: string;
}

interface FalResultResponse {
  images?: { url?: string; width?: number; height?: number }[];
  video?: { url?: string };
  audio?: { url?: string };
  audio_file?: { url?: string };
  seed?: number;
}

const DEFAULT_IMAGE_MODEL = 'fal-ai/flux/schnell';
const DEFAULT_VIDEO_MODEL = 'fal-ai/kling-video/v1.6/standard/text-to-video';
const DEFAULT_AUDIO_MODEL = 'fal-ai/stable-audio';

// fal queue job ids carry the model path (the status/result URLs include it):
// `<model>::<request_id>`.
function encodeJobId(model: string, requestId: string): string {
  return `${model}::${requestId}`;
}

function decodeJobId(jobId: string): { model: string; requestId: string } {
  const idx = jobId.lastIndexOf('::');
  if (idx === -1) return { model: DEFAULT_VIDEO_MODEL, requestId: jobId };
  return { model: jobId.slice(0, idx), requestId: jobId.slice(idx + 2) };
}

export class FalAdapter implements MediaProviderAdapter {
  readonly identifier = 'fal';
  // Display name shown in Settings → Media. Kept as "Kling" to match the studio
  // (/media/kling, nav + title "Kling"); the registry/config identifier stays `fal`.
  readonly name = 'Kling';
  readonly capabilities: MediaProviderCapabilities = {
    image: true,
    video: true,
    audio: true,
    avatar: false,
    tts: false,
    stt: false,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  private _headers(options?: MediaCredentialOptions): Record<string, string> {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('fal.ai API key is required');
    return {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    };
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const model = options?.model || DEFAULT_IMAGE_MODEL;
    const res = await safeFetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        prompt,
        num_images: options?.n || 1,
        ...options?.input,
      }),
    });
    if (!res.ok) throw new Error(`fal.ai image generation failed: ${await res.text()}`);
    const data = (await res.json()) as FalResultResponse;
    const urls = (data.images || [])
      .map((i) => i.url)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (urls.length === 0) throw new Error('fal.ai returned no images');
    return {
      multi: urls.length > 1,
      image: urls[0],
      images: urls,
      metadata: {
        provider: this.identifier,
        model,
        seed: data.seed,
        width: data.images?.[0]?.width,
        height: data.images?.[0]?.height,
      },
    };
  }

  private async _submitQueue(
    model: string,
    prompt: string,
    options?: MediaGenerateOptions,
  ): Promise<MediaJobSubmission> {
    const url = new URL(`https://queue.fal.run/${model}`);
    if (options?.webhookUrl) url.searchParams.set('fal_webhook', options.webhookUrl);
    const res = await safeFetch(url.toString(), {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({ prompt, ...options?.input }),
    });
    if (!res.ok) throw new Error(`fal.ai job submission failed: ${await res.text()}`);
    const data = (await res.json()) as FalQueueSubmitResponse;
    if (!data.request_id) throw new Error('fal.ai returned no request id');
    return { jobId: encodeJobId(model, data.request_id) };
  }

  generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this._submitQueue(options?.model || DEFAULT_VIDEO_MODEL, prompt, options);
  }

  generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    return this._submitQueue(options?.model || DEFAULT_AUDIO_MODEL, prompt, options);
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('fal.ai avatar generation not supported');
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const { model, requestId } = decodeJobId(jobId);
    const statusRes = await safeFetch(
      `https://queue.fal.run/${model}/requests/${requestId}/status`,
      { headers: this._headers(options) },
    );
    if (!statusRes.ok) return { status: 'failed', error: await statusRes.text() };
    const status = (await statusRes.json()) as FalQueueStatusResponse;

    if (status.status === 'COMPLETED') {
      const resultRes = await safeFetch(
        `https://queue.fal.run/${model}/requests/${requestId}`,
        { headers: this._headers(options) },
      );
      if (!resultRes.ok) return { status: 'failed', error: await resultRes.text() };
      const result = (await resultRes.json()) as FalResultResponse;
      const artifactUrl =
        result.video?.url ||
        result.audio?.url ||
        result.audio_file?.url ||
        result.images?.[0]?.url;
      if (!artifactUrl) return { status: 'failed', error: 'fal.ai job completed without output' };
      return {
        status: 'completed',
        artifactUrl,
        metadata: { provider: this.identifier, model, seed: result.seed },
      };
    }
    if (status.status === 'FAILED' || status.status === 'CANCELLED') {
      return { status: 'failed', error: status.error || `fal.ai job ${status.status}` };
    }
    return { status: 'pending' };
  }
}

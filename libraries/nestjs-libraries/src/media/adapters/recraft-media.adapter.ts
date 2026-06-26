import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

// Recraft — own-key (Bearer) image generation, strong on vector/SVG, brand styles, and icons.
// Synchronous: a single POST returns hosted image URLs. Native params (style, substyle, size, n,
// response_format, controls) ride through `options.input` so the descriptor is the full surface.
const BASE = 'https://external.api.recraft.ai/v1';

interface RecraftResponse {
  data?: { url?: string; image_id?: string }[];
}

export class RecraftMediaAdapter implements MediaProviderAdapter {
  readonly identifier = 'recraft';
  readonly name = 'Recraft';
  readonly capabilities: MediaProviderCapabilities = {
    image: true,
    video: false,
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
    if (!apiKey) throw new Error('Recraft API key is required');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const model = options?.model || 'recraftv3';
    const res = await safeFetch(`${BASE}/images/generations`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({ prompt, model, ...(options?.input || {}) }),
    });
    if (!res.ok) throw new Error(`Recraft image generation failed: ${await res.text()}`);
    const data = (await res.json()) as RecraftResponse;
    const images = (data.data || []).map((d) => d.url).filter((u): u is string => !!u);
    if (images.length === 0) throw new Error('Recraft returned no images');
    return {
      multi: images.length > 1,
      image: images[0],
      images,
      metadata: { provider: this.identifier, model },
    };
  }

  async generateVideo(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Recraft does not support video generation');
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Recraft does not support audio generation');
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Recraft does not support avatar generation');
  }
}

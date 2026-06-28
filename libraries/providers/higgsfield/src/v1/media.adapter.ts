import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaCredentialField,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaInputValue,
  MediaJobSubmission,
  MediaPollResult,
  SafeFetchPort,
  ProviderModule,
} from '@gitroom/provider-kernel';

// Higgsfield (platform.higgsfield.ai) — own-key media provider. Auth is a TWO-part credential
// (`KEY_ID` + `KEY_SECRET`) sent as a single header `Authorization: Key <id>:<secret>` (see the
// official higgsfield-js V2 client). Every generation is submit-and-poll: POST the input fields
// directly to the model endpoint → `{ request_id, status }`, then poll `GET /requests/{id}/status`
// until `completed` (or `nsfw`/`failed`); the result is `images[].url` (image) or `video.url`
// (video). There is no completion webhook wired here → video relies on the media-jobs-poll cron
// (like Runway/Wan); image keeps the synchronous contract (§11.2) via bounded internal polling.
//
// Three model surfaces, routed by operation + model:
//   image  → Soul text-to-image      POST /v1/text2image/soul
//   video  → DoP image-to-video      POST /v1/image2video/dop   (model = dop-lite|dop-turbo|dop-standard)
//   video  → Speak audio→talk-video  POST /v1/speak/higgsfield  (model = 'speak', routing marker only)
const BASE = 'https://platform.higgsfield.ai';

const SOUL_ENDPOINT = '/v1/text2image/soul';
const DOP_ENDPOINT = '/v1/image2video/dop';
const SPEAK_ENDPOINT = '/v1/speak/higgsfield';

interface HiggsfieldResponse {
  status?: 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw';
  request_id?: string;
  images?: { url?: string }[];
  video?: { url?: string };
  detail?: unknown;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HiggsfieldAdapter implements MediaProviderAdapter {
  constructor(private readonly _fetch: SafeFetchPort) {}
  readonly identifier = 'higgsfield';
  readonly name = 'Higgsfield';
  readonly capabilities: MediaProviderCapabilities = {
    image: true,
    video: true,
    audio: false,
    avatar: false,
    tts: false,
    stt: false,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  // Two-part key — the V2 client expects `Authorization: Key KEY_ID:KEY_SECRET`. A combined
  // "id:secret" pasted into a single field is also accepted (apiKey fallback).
  readonly credentialFields: MediaCredentialField[] = [
    { key: 'keyId', label: 'API Key ID', type: 'string', required: true, placeholder: 'Higgsfield key id' },
    { key: 'keySecret', label: 'API Key Secret', type: 'password', required: true, placeholder: 'Higgsfield key secret' },
  ];

  private _headers(options?: MediaCredentialOptions): Record<string, string> {
    const creds = options?.credentials || {};
    let id = creds.keyId;
    let secret = creds.keySecret;
    // Fallback: a single "KEY_ID:KEY_SECRET" string in apiKey/key.
    const combined = options?.apiKey || creds.apiKey || creds.key;
    if ((!id || !secret) && combined && combined.includes(':')) {
      [id, secret] = combined.split(':');
    }
    if (!id || !secret) throw new Error('Higgsfield requires both an API Key ID and Key Secret');
    return {
      'Content-Type': 'application/json',
      Authorization: `Key ${id}:${secret}`,
    };
  }

  // Drop empty/undefined values; the rest are native Higgsfield params.
  private _clean(raw?: Record<string, MediaInputValue>): Record<string, MediaInputValue> {
    const out: Record<string, MediaInputValue> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (v !== undefined && v !== '') out[k] = v;
    }
    return out;
  }

  private async _submit(endpoint: string, body: Record<string, unknown>, options?: MediaCredentialOptions): Promise<string> {
    const res = await this._fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Higgsfield request failed: ${await res.text()}`);
    const data = (await res.json()) as HiggsfieldResponse;
    if (!data.request_id) throw new Error('Higgsfield returned no request id');
    return data.request_id;
  }

  // Soul text-to-image (submit-and-poll). A reference image (image-to-image) rides the native
  // `image_reference` object; everything else passes straight through.
  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    this._headers(options); // validate credentials before any work
    const { image_url, ...rest } = this._clean(options?.input);
    const body: Record<string, unknown> = { prompt, ...rest };
    if (typeof image_url === 'string' && image_url) {
      body.image_reference = { type: 'image_url', image_url };
    }
    const requestId = await this._submit(SOUL_ENDPOINT, body, options);

    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(2000);
      const poll = await this.pollJob(requestId, options);
      if (poll.status === 'completed' && poll.artifactUrl) {
        const urls = (poll.metadata?.source ? JSON.parse(poll.metadata.source) : [poll.artifactUrl]) as string[];
        return {
          multi: urls.length > 1,
          image: urls[0],
          images: urls,
          metadata: { provider: this.identifier, model: 'soul', prompt },
        };
      }
      if (poll.status === 'failed') {
        throw new Error(`Higgsfield image generation failed: ${poll.error || 'unknown error'}`);
      }
    }
    throw new Error('Higgsfield image generation timed out');
  }

  // Video: DoP image-to-video, or Speak (audio-driven talking video) when model === 'speak'.
  // The media-field URLs (resolved server-side) ride the native nested input objects.
  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    this._headers(options); // validate credentials before any work
    const model = options?.model || 'dop-standard';
    const { image_url, audio_url, ...rest } = this._clean(options?.input);

    let endpoint: string;
    let body: Record<string, unknown>;
    if (model === 'speak') {
      if (typeof image_url !== 'string' || !image_url) throw new Error('Higgsfield Speak requires a source image');
      if (typeof audio_url !== 'string' || !audio_url) throw new Error('Higgsfield Speak requires an audio file');
      endpoint = SPEAK_ENDPOINT;
      body = {
        prompt,
        input_image: { type: 'image_url', image_url },
        input_audio: { type: 'audio_url', audio_url },
        ...rest,
      };
    } else {
      if (typeof image_url !== 'string' || !image_url) throw new Error('Higgsfield DoP requires a source image');
      endpoint = DOP_ENDPOINT;
      body = {
        model,
        prompt,
        input_images: [{ type: 'image_url', image_url }],
        ...rest,
      };
    }

    const requestId = await this._submit(endpoint, body, options);
    return { jobId: requestId };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Higgsfield does not support audio generation');
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Higgsfield does not support avatar generation');
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await this._fetch(`${BASE}/requests/${jobId}/status`, { headers: this._headers(options) });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as HiggsfieldResponse;

    if (data.status === 'completed') {
      const images = (data.images || []).map((i) => i.url).filter((u): u is string => !!u);
      const artifactUrl = data.video?.url || images[0];
      if (!artifactUrl) return { status: 'failed', error: 'Higgsfield completed without output' };
      // Stash the full image list (Soul batch_size: 4) for generateImage to surface as multi.
      const metadata = images.length > 1 ? { provider: this.identifier, source: JSON.stringify(images) } : { provider: this.identifier };
      return { status: 'completed', artifactUrl, metadata };
    }
    if (data.status === 'failed' || data.status === 'nsfw') {
      return { status: 'failed', error: data.status === 'nsfw' ? 'Blocked by NSFW filter' : 'Higgsfield generation failed' };
    }
    return { status: 'pending' };
  }

  // Auth probe with no generation cost: a status GET on a non-existent request returns 401 on bad
  // credentials, but a 404/422 (request not found) on valid credentials.
  async testConnection(options?: MediaCredentialOptions): Promise<{ ok: boolean; message: string }> {
    let headers: Record<string, string>;
    try {
      headers = this._headers(options);
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
    try {
      const res = await this._fetch(`${BASE}/requests/00000000-0000-0000-0000-000000000000/status`, { headers });
      if (res.status === 401) return { ok: false, message: 'Invalid Higgsfield API credentials' };
      return { ok: true, message: 'Connection successful' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}

const _meta = new HiggsfieldAdapter(undefined as unknown as SafeFetchPort);

export const higgsfieldMediaModule: ProviderModule<any, any> = {
  manifest: {
    domain: 'media',
    providerId: _meta.identifier,
    version: 'v1',
    displayName: _meta.name,
    status: 'active',
    credentialFields: (_meta as any).credentialFields || [],
    capabilities: (_meta as any).capabilities,
  },
  create: (rt) => new HiggsfieldAdapter(rt.fetch),
};

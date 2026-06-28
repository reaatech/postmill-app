import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaPollResult,
  MediaInputValue,
  resolveApiKey,
  SafeFetchPort,
  ProviderModule,
} from '@gitroom/provider-kernel';

// LTX Studio (Lightricks) official developer API — own-key Bearer provider configured at
// Settings → Media. Video-only: text-to-video, image-to-video, and audio-to-video, all on the LTX-2 /
// LTX-2.3 model family. Every generation is async: POST /v2/<op> returns `{ id }`, then poll
// GET /v2/<op>/{id} until `status: completed`, reading the output from `result.video_url`.
//
// The poll path mirrors the submit path, so the operation must travel with the job id — we namespace
// the returned jobId as `<op>:<id>` (the HeyGen pattern) and pollJob splits it back out. There is no
// completion webhook → video relies on the media-jobs-poll cron (like Runway/Wan).
const BASE = 'https://api.ltx.video';

// Sub-operation → async submit/poll path segment. Routed by the media inputs present in the request
// (the studio descriptor's media-field names are LTX's native params): an audio source → audio-to-video,
// an image source → image-to-video, otherwise text-to-video.
type LtxOp = 'text-to-video' | 'image-to-video' | 'audio-to-video';

interface LtxSubmitResponse {
  id?: string;
  created_at?: string;
  detail?: unknown;
}

interface LtxStatusResponse {
  status?: 'queued' | 'pending' | 'processing' | 'running' | 'completed' | 'failed' | 'error' | 'canceled';
  result?: { video_url?: string };
  error?: string;
  detail?: unknown;
}

export class LtxAdapter implements MediaProviderAdapter {
  constructor(private readonly _fetch: SafeFetchPort) {}
  readonly identifier = 'ltx';
  readonly name = 'LTX Studio';
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
    if (!apiKey) throw new Error('LTX Studio API key is required');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  // Drop empty/undefined values; everything else is a native LTX param that rides straight into the body.
  private _clean(raw?: Record<string, MediaInputValue>): Record<string, MediaInputValue> {
    const out: Record<string, MediaInputValue> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (v !== undefined && v !== '') out[k] = v;
    }
    return out;
  }

  async generateImage(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    throw new Error('LTX Studio does not support image generation');
  }

  // Text/image/audio → video. The endpoint is chosen by the media inputs present; the model id and
  // every other native param (resolution, duration, fps, generate_audio, camera_motion, last_frame_uri)
  // ride straight into the body. Returns the LTX job id namespaced with its operation for pollJob.
  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const headers = this._headers(options);
    const model = options?.model || 'ltx-2-3-pro';
    const cleaned = this._clean(options?.input);

    let op: LtxOp;
    if (cleaned.audio_uri) op = 'audio-to-video';
    else if (cleaned.image_uri) op = 'image-to-video';
    else op = 'text-to-video';

    const body: Record<string, unknown> = { model, ...cleaned };
    if (prompt) body.prompt = prompt;

    const res = await this._fetch(`${BASE}/v2/${op}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LTX Studio video generation failed: ${await res.text()}`);
    const id = ((await res.json()) as LtxSubmitResponse).id;
    if (!id) throw new Error('LTX Studio returned no job id');
    return { jobId: `${op}:${id}` };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('LTX Studio does not support audio generation');
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('LTX Studio does not support avatar generation');
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    // jobId is `<op>:<id>`; a bare id (no prefix) defaults to text-to-video.
    const sep = jobId.indexOf(':');
    const op = sep > 0 ? jobId.slice(0, sep) : 'text-to-video';
    const id = sep > 0 ? jobId.slice(sep + 1) : jobId;

    const res = await this._fetch(`${BASE}/v2/${op}/${id}`, { headers: this._headers(options) });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as LtxStatusResponse;

    if (data.status === 'completed') {
      const artifactUrl = data.result?.video_url;
      if (!artifactUrl) return { status: 'failed', error: 'LTX Studio completed without output' };
      return { status: 'completed', artifactUrl, metadata: { provider: this.identifier } };
    }
    if (data.status === 'failed' || data.status === 'error' || data.status === 'canceled') {
      return { status: 'failed', error: data.error || 'LTX Studio generation failed' };
    }
    return { status: 'pending' };
  }

  // Auth probe with no generation cost: a status GET on a non-existent job returns 401 on bad
  // credentials, but a 404 (job not found) on valid credentials.
  async testConnection(options?: MediaCredentialOptions): Promise<{ ok: boolean; message: string }> {
    let headers: Record<string, string>;
    try {
      headers = this._headers(options);
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
    try {
      const res = await this._fetch(`${BASE}/v2/text-to-video/00000000-0000-0000-0000-000000000000`, { headers });
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Invalid LTX Studio API key' };
      return { ok: true, message: 'Connection successful' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}

const _meta = new LtxAdapter(undefined as unknown as SafeFetchPort);

export const ltxMediaModule: ProviderModule<any, any> = {
  manifest: {
    domain: 'media',
    providerId: _meta.identifier,
    version: 'v1',
    displayName: _meta.name,
    status: 'active',
    credentialFields: (_meta as any).credentialFields || [],
    capabilities: (_meta as any).capabilities,
  },
  create: (rt) => new LtxAdapter(rt.fetch),
};

import { createGateway, experimental_generateVideo as generateVideo } from 'ai';
import { Agent } from 'undici';
import {
  MediaProviderCapabilities,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaModelOption,
  MediaOperation,
  MediaCredentialField,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { AiSdkMediaAdapter } from './ai-sdk-media.adapter';

// Vercel AI Gateway — image is delegated to the AI-SDK gateway provider (base class); video
// uses AI SDK v6's experimental `generateVideo` (`gateway.video(modelId)`), which is
// inherently synchronous (one long await — minutes). We extend the Undici timeout to 15 min
// per Vercel's docs and complete the job inline (no poll/webhook). Speech is not exposed by
// the gateway AI-SDK adapter, so audio is omitted here.
const GATEWAY_BASE = 'https://ai-gateway.vercel.sh/v1';

// One long-lived dispatcher so a multi-minute video render isn't killed by the default 5-min
// fetch timeout. Created lazily to avoid touching undici when the gateway is never used.
let _videoDispatcher: Agent | undefined;
function videoFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (!_videoDispatcher) {
    _videoDispatcher = new Agent({ headersTimeout: 15 * 60 * 1000, bodyTimeout: 15 * 60 * 1000 });
  }
  return fetch(url, { ...(init || {}), dispatcher: _videoDispatcher } as RequestInit);
}

interface GatewayModelsResponse {
  data?: { id?: string; name?: string; type?: string; modality?: string }[];
}

export class GatewayMediaAdapter extends AiSdkMediaAdapter {
  readonly identifier = 'gateway';
  readonly name = 'Vercel AI Gateway';
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
  override readonly credentialFields: MediaCredentialField[] = [
    { key: 'apiKey', label: 'Gateway API Key', type: 'password', required: true, placeholder: 'vck_…' },
  ];

  override async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const model = options?.model;
    if (!model) throw new Error('Gateway video generation requires a model');
    const apiKey = options?.credentials?.apiKey || resolveApiKey(options);
    if (!apiKey) throw new Error('Vercel AI Gateway API key is required');

    const gw = createGateway({ apiKey, fetch: videoFetch });
    const input = options?.input || {};
    // Image-to-video: the resolved source image rides as the structured prompt.
    const image = typeof input.image === 'string' ? input.image : undefined;
    const result = await generateVideo({
      model: gw.video(model),
      prompt: image ? { image, text: prompt } : prompt,
      ...(input.seconds !== undefined ? { duration: Number(input.seconds) } : {}),
      ...(typeof input.aspect_ratio === 'string' ? { aspectRatio: input.aspect_ratio } : {}),
      ...(typeof input.resolution === 'string' ? { resolution: input.resolution } : {}),
    } as Parameters<typeof generateVideo>[0]);

    const video = result.videos?.[0];
    if (!video) throw new Error('Gateway returned no video');
    const mime = (video as { mediaType?: string }).mediaType || 'video/mp4';
    const b64 = video.base64 || Buffer.from(video.uint8Array).toString('base64');
    return {
      jobId: `gateway-video-${b64.length}`,
      artifactUrl: `data:${mime};base64,${b64}`,
      metadata: { provider: this.identifier, model, mime, prompt },
    };
  }

  // The gateway exposes its full catalog at /v1/models with a type tag; filter by modality
  // so the dynamic dropdown lists real image/video models (the AI adapter only hardcodes a
  // few text models).
  override async listModels(operation: MediaOperation, options?: MediaCredentialOptions): Promise<MediaModelOption[]> {
    const apiKey = options?.credentials?.apiKey || resolveApiKey(options);
    if (!apiKey) return [];
    try {
      const res = await safeFetch(`${GATEWAY_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) return [];
      const body = (await res.json()) as GatewayModelsResponse;
      const want = operation === 'image' ? 'image' : operation === 'video' ? 'video' : 'audio';
      return (body.data || [])
        .filter((m) => m.id && (m.type === want || m.modality === want || (m.type || '').includes(want)))
        .map((m) => ({ id: m.id as string, label: m.name || (m.id as string) }));
    } catch {
      return [];
    }
  }
}

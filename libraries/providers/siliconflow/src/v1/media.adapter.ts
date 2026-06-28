import {
  OpenAiCompatibleMediaAdapter,
  MediaProviderCapabilities,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaPollResult,
  MediaOperation,
  MediaModelOption,
  MediaInputValue,
  SafeFetchPort,
  ProviderModule,
} from '@gitroom/provider-kernel';

// SiliconFlow — same key as the SiliconFlow LLM provider (registry id `siliconflow`), reused
// via the universal-credential fallback. Image + TTS ride the OpenAI-compatible base
// (`/v1/images/generations`, `/v1/audio/speech`). Video is SiliconFlow's async job API
// (`POST /v1/video/submit` → poll `POST /v1/video/status`), no webhook → poll-cron / on-read
// completion. Image-to-video needs the source frame as base64.
interface SiliconFlowSubmit {
  requestId?: string;
}

interface SiliconFlowStatus {
  status?: string;
  reason?: string;
  results?: { videos?: { url?: string }[] };
}

export class SiliconFlowMediaAdapter extends OpenAiCompatibleMediaAdapter {
  readonly identifier = 'siliconflow';
  readonly name = 'SiliconFlow';
  readonly capabilities: MediaProviderCapabilities = {
    image: true,
    video: true,
    audio: true,
    avatar: false,
    tts: true,
    stt: false,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  protected readonly baseUrl = 'https://api.siliconflow.com/v1';
  protected override defaultImageModel = 'black-forest-labs/FLUX.1-schnell';
  protected override defaultAudioModel = 'fishaudio/fish-speech-1.5';
  protected override defaultVoice = 'fishaudio/fish-speech-1.5:alex';

  override async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const model = options?.model;
    if (!model) throw new Error('SiliconFlow video generation requires a model');
    const input = this._clean(options?.input);
    const body: Record<string, MediaInputValue> = { model, prompt };
    for (const [k, v] of Object.entries(input)) {
      if (k === 'image') continue;
      body[k] = v;
    }
    // i2v source frame must be base64; resolve from the public URL the studio passed.
    if (typeof input.image === 'string' && input.image) {
      body.image = await this._toBase64(input.image, options);
    }
    const res = await this._fetch(`${this.baseUrl}/video/submit`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`SiliconFlow video generation failed: ${await res.text()}`);
    const requestId = ((await res.json()) as SiliconFlowSubmit).requestId;
    if (!requestId) throw new Error('SiliconFlow returned no requestId');
    return { jobId: requestId };
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await this._fetch(`${this.baseUrl}/video/status`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({ requestId: jobId }),
    });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as SiliconFlowStatus;
    const status = (data.status || '').toLowerCase();
    if (status === 'succeed' || status === 'succeeded' || status === 'success') {
      const url = data.results?.videos?.[0]?.url;
      if (!url) return { status: 'failed', error: 'SiliconFlow video completed without a url' };
      return { status: 'completed', artifactUrl: url, metadata: { provider: this.identifier } };
    }
    if (status === 'failed' || status === 'error') {
      return { status: 'failed', error: data.reason || 'SiliconFlow video generation failed' };
    }
    return { status: 'pending' };
  }

  private async _toBase64(url: string, _options?: MediaCredentialOptions): Promise<string> {
    try {
      const res = await this._fetch(url, {});
      if (!res.ok) return url;
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') || 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return url;
    }
  }

  // SiliconFlow's /models catalog tags image models; video/audio fall back to the
  // descriptor's curated options + free entry.
  protected override _modelTypes(operation: MediaOperation): string[] {
    if (operation === 'image') return ['image'];
    return [];
  }

  override async listModels(operation: MediaOperation, options?: MediaCredentialOptions): Promise<MediaModelOption[]> {
    if (operation !== 'image') return [];
    return super.listModels(operation, options);
  }
}

const _meta = new SiliconFlowMediaAdapter(undefined as unknown as SafeFetchPort);

export const siliconflowMediaModule: ProviderModule<any, any> = {
  manifest: {
    domain: 'media',
    providerId: _meta.identifier,
    version: 'v1',
    displayName: _meta.name,
    status: 'active',
    credentialFields: (_meta as any).credentialFields || [],
    capabilities: (_meta as any).capabilities,
  },
  create: (rt) => new SiliconFlowMediaAdapter(rt.fetch),
};

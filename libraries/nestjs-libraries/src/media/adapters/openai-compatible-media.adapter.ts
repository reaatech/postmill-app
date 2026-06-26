import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaModelOption,
  MediaOperation,
  MediaInputValue,
  resolveApiKey,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

// Shared base for hubs that expose an OpenAI-compatible media surface — image via
// `POST {base}/images/generations` (response `data[].url` | `data[].b64_json`) and TTS via
// `POST {base}/audio/speech` (binary audio, returned inline as a data: URL). Subclasses set
// `baseUrl`, `identifier`, `name`, `capabilities`, and default models; providers with a
// bespoke (usually async) video API override `generateVideo` + `pollJob`. Field names in
// `options.input` are the provider's native params and ride straight into the body.

interface OpenAiModelsResponse {
  data?: { id?: string; type?: string }[];
}

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
};

export abstract class OpenAiCompatibleMediaAdapter implements MediaProviderAdapter {
  abstract readonly identifier: string;
  abstract readonly name: string;
  abstract readonly capabilities: MediaProviderCapabilities;

  // OpenAI-compatible API root, e.g. https://api.together.ai/v1
  protected abstract readonly baseUrl: string;
  protected defaultImageModel = '';
  protected defaultAudioModel = '';
  protected defaultVoice = 'alloy';

  protected _key(options?: MediaCredentialOptions): string {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error(`${this.name} API key is required`);
    return apiKey;
  }

  protected _headers(options?: MediaCredentialOptions): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this._key(options)}`,
    };
  }

  // Drop empty values so the provider's own defaults apply.
  protected _clean(raw?: Record<string, MediaInputValue>): Record<string, MediaInputValue> {
    const out: Record<string, MediaInputValue> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (v === undefined || v === '') continue;
      out[k] = v;
    }
    return out;
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const model = options?.model || this.defaultImageModel;
    const res = await safeFetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({ model, prompt, ...this._clean(options?.input) }),
    });
    if (!res.ok) throw new Error(`${this.name} image generation failed: ${await res.text()}`);
    const data = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
    const urls = (data.data || [])
      .map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : undefined))
      .filter((u): u is string => !!u);
    if (!urls.length) throw new Error(`${this.name} returned no image`);
    return {
      multi: urls.length > 1,
      image: urls[0],
      images: urls,
      metadata: { provider: this.identifier, model, prompt },
    };
  }

  // OpenAI-compatible `/audio/speech` — synchronous binary; returned inline as a data: URL
  // (completeJob decodes it into the org's audio files, no webhook/poll).
  async generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const model = options?.model || this.defaultAudioModel;
    const input = this._clean(options?.input);
    const voice = (input.voice as string) || options?.voice || this.defaultVoice;
    const format = (input.response_format as string) || options?.format || 'mp3';
    delete input.voice;
    delete input.response_format;
    const res = await safeFetch(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({ model, input: prompt, voice, response_format: format, ...input }),
    });
    if (!res.ok) throw new Error(`${this.name} speech generation failed: ${await res.text()}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = AUDIO_MIME[format] || 'audio/mpeg';
    return {
      jobId: `${this.identifier}-audio-${buffer.length}`,
      artifactUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      metadata: { provider: this.identifier, model, mime, prompt },
    };
  }

  async generateVideo(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error(`${this.name} does not support video generation`);
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error(`${this.name} does not support avatar generation`);
  }

  // Which `type` value the provider's `/models` catalog uses for a modality. Override when
  // a provider tags models differently (or has no catalog for a modality → []).
  protected _modelTypes(operation: MediaOperation): string[] {
    if (operation === 'image') return ['image'];
    if (operation === 'video') return ['video'];
    return ['audio', 'tts'];
  }

  async listModels(operation: MediaOperation, options?: MediaCredentialOptions): Promise<MediaModelOption[]> {
    const types = this._modelTypes(operation);
    if (!types.length) return [];
    const res = await safeFetch(`${this.baseUrl}/models`, { headers: this._headers(options) });
    if (!res.ok) return [];
    const body = (await res.json()) as OpenAiModelsResponse | { id?: string; type?: string }[];
    const list = Array.isArray(body) ? body : body.data || [];
    return list
      .filter((m) => m.id && (!m.type || types.includes(m.type)))
      .map((m) => ({ id: m.id as string, label: m.id as string }));
  }

  async testConnection(options?: MediaCredentialOptions): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await safeFetch(`${this.baseUrl}/models`, { headers: this._headers(options) });
      if (res.ok) return { ok: true, message: 'Connection successful' };
      return { ok: false, message: `${this.name} connection failed: ${await res.text()}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}

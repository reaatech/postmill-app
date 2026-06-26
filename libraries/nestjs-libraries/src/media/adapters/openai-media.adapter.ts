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
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

// Sora video models (sora-2 / sora-2-pro) on the async Videos API. The finished MP4 is auth-only
// bytes at /v1/videos/{id}/content (no public URL), so pollJob downloads it with the key and
// returns it inline as a data URL — see pollJob.
const SORA_BASE = 'https://api.openai.com/v1/videos';

interface SoraJob {
  id?: string;
  status?: 'queued' | 'in_progress' | 'completed' | 'failed';
  error?: { message?: string } | null;
}

// Map a TTS response_format to the data-URL mime so the artifact lands with the right type.
const TTS_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

interface OpenAIImageResponse {
  data?: { url?: string; b64_json?: string }[];
}

interface OpenAITranscriptionResponse {
  text?: string;
  segments?: { start: number; end: number; text: string }[];
}

export class OpenaiMediaAdapter implements MediaProviderAdapter {
  readonly identifier = 'openai';
  readonly name = 'OpenAI';
  readonly capabilities: MediaProviderCapabilities = {
    image: true,
    video: true,
    audio: true,
    avatar: false,
    tts: true,
    stt: true,
    upscale: false,
    bgRemove: false,
    inpaint: false,
  };

  private _apiKey(options?: MediaGenerateOptions): string {
    const apiKey = resolveApiKey(options);
    if (!apiKey) throw new Error('OpenAI API key is required');
    return apiKey;
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const apiKey = this._apiKey(options);
    const model = options?.model || 'dall-e-3';

    // Native params (size, quality, style, background, output_format, n, …) ride through
    // `options.input` so the descriptor exposes each model's full surface; defaults below
    // apply only when input omits them. gpt-image-1 returns b64_json (no url).
    const res = await safeFetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: options?.n || 1,
        size: options?.size || '1024x1024',
        quality: options?.quality || 'standard',
        ...(options?.input || {}),
      }),
    });

    if (!res.ok) throw new Error(`OpenAI image generation failed: ${await res.text()}`);
    const data = (await res.json()) as OpenAIImageResponse;
    const fmt = String(options?.input?.output_format || 'png');
    const dataMime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
    const urls = (data.data || [])
      .map((d) => d.url || (d.b64_json ? `data:${dataMime};base64,${d.b64_json}` : undefined))
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (urls.length === 0) throw new Error('OpenAI returned no images');
    return {
      multi: urls.length > 1,
      image: urls[0],
      images: urls,
      metadata: { provider: this.identifier, model },
    };
  }

  // Sora text-to-video and image-to-video via the async Videos API. POST /v1/videos returns a job
  // id; the poll-cron drives pollJob to completion (no webhook). Native params (size, seconds)
  // ride through `options.input`. A source frame (`input_reference`, resolved to a URL server-side)
  // is uploaded as the multipart `input_reference` field; text-to-video sends a plain JSON body.
  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const apiKey = this._apiKey(options);
    const model = options?.model || 'sora-2';
    const input = (options?.input || {}) as Record<string, MediaInputValue>;
    const { input_reference, ...rest } = input;

    const params: Record<string, string> = {
      model,
      prompt,
      size: String(rest.size || options?.size || '1280x720'),
      seconds: String(rest.seconds || '8'),
    };
    for (const [k, v] of Object.entries(rest)) {
      if (k === 'size' || k === 'seconds') continue;
      if (v !== undefined && v !== '') params[k] = String(v);
    }

    let res;
    if (typeof input_reference === 'string' && input_reference) {
      // Image-to-video: fetch the source frame and upload it as a multipart file.
      const imgRes = await safeFetch(input_reference);
      if (!imgRes.ok) throw new Error(`Sora reference image fetch failed (${imgRes.status})`);
      const bytes = Buffer.from(await imgRes.arrayBuffer());
      const mime = imgRes.headers.get('content-type')?.split(';')[0] || 'image/png';
      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const form = new FormData();
      for (const [k, v] of Object.entries(params)) form.append(k, v);
      form.append('input_reference', new Blob([new Uint8Array(bytes)], { type: mime }), `reference.${ext}`);
      res = await safeFetch(SORA_BASE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } else {
      res = await safeFetch(SORA_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(params),
      });
    }

    if (!res.ok) throw new Error(`Sora video generation failed: ${await res.text()}`);
    const data = (await res.json()) as SoraJob;
    if (!data.id) throw new Error('Sora returned no job id');
    return { jobId: data.id, metadata: { provider: this.identifier, model } };
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const apiKey = resolveApiKey(options);
    if (!apiKey) return { status: 'failed', error: 'OpenAI API key is required' };
    const headers = { Authorization: `Bearer ${apiKey}` };

    const res = await safeFetch(`${SORA_BASE}/${jobId}`, { headers });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as SoraJob;

    if (data.status === 'completed') {
      // The finished MP4 is auth-only bytes at /content (no public URL). Download it with the key
      // and return it inline as a data URL — the lifecycle decodes data URLs, whereas the default
      // unauthenticated re-download of a provider URL would 401 here.
      const contentRes = await safeFetch(`${SORA_BASE}/${jobId}/content`, { headers });
      if (!contentRes.ok) return { status: 'failed', error: `Sora content download failed (${contentRes.status})` };
      const base64 = Buffer.from(await contentRes.arrayBuffer()).toString('base64');
      return {
        status: 'completed',
        artifactUrl: `data:video/mp4;base64,${base64}`,
        metadata: { provider: this.identifier, mime: 'video/mp4' },
      };
    }
    if (data.status === 'failed') {
      return { status: 'failed', error: data.error?.message || 'Sora generation failed' };
    }
    return { status: 'pending' };
  }

  // OpenAI TTS is synchronous — return the artifact inline.
  async generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const audio = await this.textToSpeech(prompt, options);
    const base64 = Buffer.isBuffer(audio) ? audio.toString('base64') : audio;
    const input = (options?.input || {}) as Record<string, MediaInputValue>;
    const fmt = String(input.response_format || options?.format || 'mp3');
    const mime = TTS_MIME[fmt] || 'audio/mpeg';
    return {
      jobId: `openai-audio-${Date.now()}`,
      artifactUrl: `data:${mime};base64,${base64}`,
      metadata: { provider: this.identifier, model: options?.model || 'tts-1', mime },
    };
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('OpenAI does not support avatar generation');
  }

  async textToSpeech(text: string, options?: MediaGenerateOptions): Promise<Buffer | string> {
    const apiKey = this._apiKey(options);

    // Studio descriptor fields (voice, response_format, speed) arrive in `options.input`;
    // fall back to legacy top-level options so existing callers are unchanged.
    const input = (options?.input || {}) as Record<string, MediaInputValue>;
    const voice = (typeof input.voice === 'string' && input.voice) || options?.voice || 'alloy';
    const responseFormat =
      (typeof input.response_format === 'string' && input.response_format) || options?.format || 'mp3';

    const res = await safeFetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'tts-1',
        input: text,
        voice,
        response_format: responseFormat,
        ...(input.speed !== undefined ? { speed: Number(input.speed) } : {}),
      }),
    });

    if (!res.ok) throw new Error(`OpenAI TTS failed: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async speechToText(audio: Buffer, options?: MediaGenerateOptions): Promise<string> {
    const apiKey = this._apiKey(options);

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(audio)]), 'audio.mp3');
    formData.append('model', options?.model || 'whisper-1');

    const res = await safeFetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) throw new Error(`OpenAI STT failed: ${await res.text()}`);
    const data = (await res.json()) as OpenAITranscriptionResponse;
    return data.text || '';
  }
}

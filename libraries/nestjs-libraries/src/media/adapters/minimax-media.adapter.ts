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

const BASE = 'https://api.minimax.io/v1';

interface MiniMaxBaseResp {
  base_resp?: { status_code?: number; status_msg?: string };
}

interface MiniMaxImageResponse extends MiniMaxBaseResp {
  data?: { image_urls?: string[] };
}

interface MiniMaxVideoSubmitResponse extends MiniMaxBaseResp {
  task_id?: string;
}

interface MiniMaxVideoQueryResponse extends MiniMaxBaseResp {
  status?: string;
  file_id?: string;
}

interface MiniMaxFileResponse extends MiniMaxBaseResp {
  file?: { download_url?: string };
}

interface MiniMaxAudioResponse extends MiniMaxBaseResp {
  data?: { audio?: string };
}

export class MiniMaxMediaAdapter implements MediaProviderAdapter {
  readonly identifier = 'minimax';
  readonly name = 'MiniMax';
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
    if (!apiKey) throw new Error('MiniMax API key is required');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const model = options?.model || 'image-01';
    const res = await safeFetch(`${BASE}/image_generation`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        model,
        prompt,
        n: options?.n || 1,
        response_format: 'url',
        ...(options?.aspectRatio ? { aspect_ratio: options.aspectRatio } : {}),
      }),
    });
    if (!res.ok) throw new Error(`MiniMax image generation failed: ${await res.text()}`);
    const data = (await res.json()) as MiniMaxImageResponse;
    const urls = (data.data?.image_urls || []).filter((u) => typeof u === 'string' && u.length > 0);
    if (urls.length === 0) {
      throw new Error(`MiniMax returned no images: ${data.base_resp?.status_msg || 'unknown error'}`);
    }
    return {
      multi: urls.length > 1,
      image: urls[0],
      images: urls,
      metadata: { provider: this.identifier, model },
    };
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const model = options?.model || 'video-01';
    // Native params (first_frame_image, prompt_optimizer, …) ride `options.input`.
    // `subject_image` is a flattened convenience field folded into MiniMax's nested
    // `subject_reference` array (S2V models).
    const input = (options?.input || {}) as Record<string, unknown>;
    const { subject_image, ...rest } = input;
    const res = await safeFetch(`${BASE}/video_generation`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        model,
        prompt,
        ...rest,
        ...(typeof subject_image === 'string'
          ? { subject_reference: [{ type: 'character', image: [subject_image] }] }
          : {}),
        ...(options?.webhookUrl ? { callback_url: options.webhookUrl } : {}),
      }),
    });
    if (!res.ok) throw new Error(`MiniMax video generation failed: ${await res.text()}`);
    const data = (await res.json()) as MiniMaxVideoSubmitResponse;
    if (!data.task_id) {
      throw new Error(`MiniMax returned no task id: ${data.base_resp?.status_msg || 'unknown error'}`);
    }
    return { jobId: data.task_id };
  }

  // MiniMax T2A is synchronous — return the artifact inline.
  async generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const model = options?.model || 'speech-01-turbo';
    const res = await safeFetch(`${BASE}/t2a_v2`, {
      method: 'POST',
      headers: this._headers(options),
      body: JSON.stringify({
        model,
        text: prompt,
        stream: false,
        voice_setting: { voice_id: options?.voiceId || options?.voice || 'female-shaonv', speed: 1 },
        audio_setting: { format: 'mp3' },
      }),
    });
    if (!res.ok) throw new Error(`MiniMax audio generation failed: ${await res.text()}`);
    const data = (await res.json()) as MiniMaxAudioResponse;
    if (!data.data?.audio) {
      throw new Error(`MiniMax returned no audio: ${data.base_resp?.status_msg || 'unknown error'}`);
    }
    // MiniMax returns hex-encoded audio bytes.
    const base64 = Buffer.from(data.data.audio, 'hex').toString('base64');
    return {
      jobId: `minimax-audio-${Date.now()}`,
      artifactUrl: `data:audio/mpeg;base64,${base64}`,
      metadata: { provider: this.identifier, model, mime: 'audio/mpeg' },
    };
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('MiniMax does not support avatar generation');
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const res = await safeFetch(`${BASE}/query/video_generation?task_id=${encodeURIComponent(jobId)}`, {
      headers: this._headers(options),
    });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as MiniMaxVideoQueryResponse;

    if (data.status === 'Success' && data.file_id) {
      const fileRes = await safeFetch(`${BASE}/files/retrieve?file_id=${encodeURIComponent(data.file_id)}`, {
        headers: this._headers(options),
      });
      if (!fileRes.ok) return { status: 'failed', error: await fileRes.text() };
      const file = (await fileRes.json()) as MiniMaxFileResponse;
      if (!file.file?.download_url) {
        return { status: 'failed', error: 'MiniMax file has no download URL' };
      }
      return {
        status: 'completed',
        artifactUrl: file.file.download_url,
        metadata: { provider: this.identifier, mime: 'video/mp4' },
      };
    }
    if (data.status === 'Fail') {
      return { status: 'failed', error: data.base_resp?.status_msg || 'MiniMax video generation failed' };
    }
    return { status: 'pending' };
  }
}

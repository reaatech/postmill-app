import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaPollResult,
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';

interface VertexPredictResponse {
  predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
}

interface VertexOperationResponse {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    videos?: { gcsUri?: string; bytesBase64Encoded?: string; mimeType?: string }[];
  };
}

interface VertexCredentials {
  accessToken: string;
  projectId: string;
  region: string;
}

const DEFAULT_IMAGE_MODEL = 'imagen-3.0-generate-002';
const DEFAULT_VIDEO_MODEL = 'veo-2.0-generate-001';

export class VertexMediaAdapter implements MediaProviderAdapter {
  readonly identifier = 'vertex';
  readonly name = 'Google Vertex AI';
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

  private _credentials(options?: MediaCredentialOptions): VertexCredentials {
    const accessToken = options?.credentials?.accessToken || options?.apiKey;
    const projectId = options?.credentials?.projectId;
    const region = options?.credentials?.region || 'us-central1';
    if (!accessToken || !projectId) {
      throw new Error('Vertex AI requires accessToken and projectId credentials');
    }
    return { accessToken, projectId, region };
  }

  private _modelUrl(creds: VertexCredentials, model: string, verb: string): string {
    return (
      `https://${creds.region}-aiplatform.googleapis.com/v1/projects/${creds.projectId}` +
      `/locations/${creds.region}/publishers/google/models/${model}:${verb}`
    );
  }

  private _headers(creds: VertexCredentials): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.accessToken}`,
    };
  }

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const creds = this._credentials(options);
    const model = options?.model || DEFAULT_IMAGE_MODEL;
    const res = await safeFetch(this._modelUrl(creds, model, 'predict'), {
      method: 'POST',
      headers: this._headers(creds),
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: options?.n || 1 },
      }),
    });
    if (!res.ok) throw new Error(`Vertex AI image generation failed: ${await res.text()}`);
    const data = (await res.json()) as VertexPredictResponse;
    const images = (data.predictions || [])
      .filter((p) => !!p.bytesBase64Encoded)
      .map((p) => `data:${p.mimeType || 'image/png'};base64,${p.bytesBase64Encoded}`);
    if (images.length === 0) throw new Error('Vertex AI returned no images');
    return {
      multi: images.length > 1,
      image: images[0],
      images,
      metadata: { provider: this.identifier, model, mime: data.predictions?.[0]?.mimeType },
    };
  }

  async generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    const creds = this._credentials(options);
    const model = options?.model || DEFAULT_VIDEO_MODEL;
    const res = await safeFetch(this._modelUrl(creds, model, 'predictLongRunning'), {
      method: 'POST',
      headers: this._headers(creds),
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          ...(options?.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
          ...(options?.durationSeconds ? { durationSeconds: options.durationSeconds } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Vertex AI video generation failed: ${await res.text()}`);
    const data = (await res.json()) as VertexOperationResponse;
    if (!data.name) throw new Error('Vertex AI returned no operation name');
    // The operation name embeds the model path needed by fetchPredictOperation.
    return { jobId: data.name };
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Vertex AI audio generation is not supported via the media adapter');
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error('Vertex AI does not support avatar generation');
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const creds = this._credentials(options);
    // Operation names look like:
    // projects/{p}/locations/{r}/publishers/google/models/{model}/operations/{id}
    const modelMatch = jobId.match(/models\/([^/]+)\//);
    const model = modelMatch?.[1] || DEFAULT_VIDEO_MODEL;
    const res = await safeFetch(this._modelUrl(creds, model, 'fetchPredictOperation'), {
      method: 'POST',
      headers: this._headers(creds),
      body: JSON.stringify({ operationName: jobId }),
    });
    if (!res.ok) return { status: 'failed', error: await res.text() };
    const data = (await res.json()) as VertexOperationResponse;

    if (!data.done) return { status: 'pending' };
    if (data.error) return { status: 'failed', error: data.error.message || 'Vertex AI operation failed' };

    const video = data.response?.videos?.[0];
    if (video?.bytesBase64Encoded) {
      return {
        status: 'completed',
        artifactUrl: `data:${video.mimeType || 'video/mp4'};base64,${video.bytesBase64Encoded}`,
        metadata: { provider: this.identifier, model, mime: video.mimeType || 'video/mp4' },
      };
    }
    if (video?.gcsUri) {
      return {
        status: 'completed',
        artifactUrl: video.gcsUri,
        metadata: { provider: this.identifier, model, mime: video.mimeType || 'video/mp4' },
      };
    }
    return { status: 'failed', error: 'Vertex AI operation finished without video output' };
  }
}

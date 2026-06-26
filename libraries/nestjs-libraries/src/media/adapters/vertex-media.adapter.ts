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
} from '../media-provider-adapter.interface';
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
import { GoogleAuth } from 'google-auth-library';

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
const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export class VertexMediaAdapter implements MediaProviderAdapter {
  readonly identifier = 'vertex';
  readonly name = 'Google Vertex';
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

  // Vertex uses GCP credentials, not a single API key. The service-account JSON is the
  // durable credential — short-lived access tokens are minted from it per call (a raw
  // `accessToken` may still be passed for advanced use, but expires in ~1h). Field keys
  // match the AI Vertex adapter so an org configures the same three values for both.
  readonly credentialFields: MediaCredentialField[] = [
    { key: 'project', label: 'GCP Project ID', type: 'string', required: true, placeholder: 'my-gcp-project' },
    { key: 'location', label: 'GCP Location', type: 'string', required: true, placeholder: 'us-central1' },
    {
      key: 'googleCredentials',
      label: 'GCP Service Account JSON',
      type: 'textarea',
      required: true,
      placeholder: 'Paste your service account key JSON',
      help: 'A short-lived access token is minted from this key on each request.',
    },
  ];

  // Mint a short-lived OAuth token from the service-account JSON (preferred), falling back
  // to a raw access token / apiKey for advanced callers. Returns the project + region too.
  private async _credentials(options?: MediaCredentialOptions): Promise<VertexCredentials> {
    const creds = options?.credentials || {};
    const projectId = creds.project || creds.projectId;
    const region = creds.location || creds.region || 'us-central1';
    if (!projectId) {
      throw new Error('Vertex AI requires a GCP project ID');
    }

    let accessToken = creds.accessToken || options?.apiKey;
    if (!accessToken && creds.googleCredentials) {
      let parsed: object;
      try {
        parsed = JSON.parse(creds.googleCredentials);
      } catch {
        throw new Error('Vertex AI service account JSON is not valid JSON');
      }
      const auth = new GoogleAuth({ credentials: parsed, scopes: [VERTEX_SCOPE] });
      const client = await auth.getClient();
      accessToken = (await client.getAccessToken()).token || undefined;
    }
    if (!accessToken) {
      throw new Error('Vertex AI requires a service account JSON (or an access token)');
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
    const creds = await this._credentials(options);
    const input = (options?.input || {}) as Record<string, MediaInputValue>;
    const model = options?.model || DEFAULT_IMAGE_MODEL;
    const sampleCount = input.sampleCount !== undefined ? Number(input.sampleCount) : options?.n || 1;
    const parameters: Record<string, MediaInputValue> = { sampleCount };
    if (typeof input.aspectRatio === 'string' && input.aspectRatio) parameters.aspectRatio = input.aspectRatio;
    if (typeof input.negativePrompt === 'string' && input.negativePrompt) parameters.negativePrompt = input.negativePrompt;
    const res = await safeFetch(this._modelUrl(creds, model, 'predict'), {
      method: 'POST',
      headers: this._headers(creds),
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters,
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
    const creds = await this._credentials(options);
    const input = (options?.input || {}) as Record<string, MediaInputValue>;
    const model = options?.model || DEFAULT_VIDEO_MODEL;
    const aspectRatio =
      options?.aspectRatio || (typeof input.aspectRatio === 'string' ? input.aspectRatio : undefined);
    const durationSeconds =
      options?.durationSeconds ?? (input.durationSeconds !== undefined ? Number(input.durationSeconds) : undefined);
    const sampleCount = input.sampleCount !== undefined ? Number(input.sampleCount) : undefined;
    const negativePrompt = typeof input.negativePrompt === 'string' ? input.negativePrompt : undefined;
    const res = await safeFetch(this._modelUrl(creds, model, 'predictLongRunning'), {
      method: 'POST',
      headers: this._headers(creds),
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(durationSeconds ? { durationSeconds } : {}),
          ...(sampleCount ? { sampleCount } : {}),
          ...(negativePrompt ? { negativePrompt } : {}),
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

  // Validate credentials without spending an image generation: minting a token exercises
  // the service-account JSON, project, and scope. (capabilities.image would otherwise make
  // the generic test path call Imagen.)
  async testConnection(options?: MediaCredentialOptions): Promise<{ ok: boolean; message: string }> {
    try {
      await this._credentials(options);
      return { ok: true, message: 'Credentials valid (access token minted)' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async pollJob(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult> {
    const creds = await this._credentials(options);
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

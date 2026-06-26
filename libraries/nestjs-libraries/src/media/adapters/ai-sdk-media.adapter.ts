import {
  MediaProviderAdapter,
  MediaProviderCapabilities,
  MediaGenerationResult,
  MediaGenerateOptions,
  MediaCredentialOptions,
  MediaJobSubmission,
  MediaModelOption,
  MediaOperation,
  MediaCredentialField,
} from '../media-provider-adapter.interface';
import {
  generateImageViaAiSdk,
  listImageModelsViaAiSdk,
  testConnectionViaAiSdk,
} from './ai-sdk-media.helper';

// Base for hubs whose media auth is non-trivial (AWS SigV4, Azure deployment URLs, the
// Vercel gateway) — image generation is delegated to the matching AI-SDK provider adapter
// (same identifier) so the `@ai-sdk/*` package handles signing/credentials. Image only;
// subclasses with their own video API (e.g. Gateway) override `generateVideo`. Credentials
// flow from the org's Settings → AI config via the universal-credential fallback.
export abstract class AiSdkMediaAdapter implements MediaProviderAdapter {
  abstract readonly identifier: string;
  abstract readonly name: string;
  abstract readonly capabilities: MediaProviderCapabilities;
  readonly credentialFields?: MediaCredentialField[];

  async generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult> {
    const model = options?.model;
    if (!model) throw new Error(`${this.name} image generation requires a model`);
    const input = options?.input || {};
    return generateImageViaAiSdk({
      identifier: this.identifier,
      credentials: options?.credentials || {},
      prompt,
      model,
      size: typeof input.size === 'string' ? input.size : undefined,
      n: typeof input.n === 'number' ? input.n : undefined,
      aspectRatio: typeof input.aspect_ratio === 'string' ? input.aspect_ratio : undefined,
    });
  }

  async generateVideo(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error(`${this.name} does not support video generation`);
  }

  async generateAudio(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error(`${this.name} does not support audio generation`);
  }

  async generateAvatar(_prompt: string, _options?: MediaGenerateOptions): Promise<MediaJobSubmission> {
    throw new Error(`${this.name} does not support avatar generation`);
  }

  async listModels(operation: MediaOperation, options?: MediaCredentialOptions): Promise<MediaModelOption[]> {
    if (operation !== 'image') return [];
    return listImageModelsViaAiSdk(this.identifier, options?.credentials || {});
  }

  async testConnection(options?: MediaCredentialOptions): Promise<{ ok: boolean; message: string }> {
    return testConnectionViaAiSdk(this.identifier, options?.credentials || {});
  }
}

// AWS Bedrock — image via Amazon Titan / Nova Canvas, auth = SigV4 through
// @ai-sdk/amazon-bedrock. Multi-field credentials mirror the AI Bedrock adapter.
export class BedrockMediaAdapter extends AiSdkMediaAdapter {
  readonly identifier = 'bedrock';
  readonly name = 'Amazon Bedrock';
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
  override readonly credentialFields: MediaCredentialField[] = [
    { key: 'region', label: 'AWS Region', type: 'string', required: true, placeholder: 'us-east-1' },
    { key: 'accessKeyId', label: 'Access Key ID', type: 'password', required: true },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true },
    { key: 'sessionToken', label: 'Session Token (optional)', type: 'password', required: false },
  ];
}

// Azure OpenAI — image via DALL·E / gpt-image deployments through @ai-sdk/azure.
export class AzureMediaAdapter extends AiSdkMediaAdapter {
  readonly identifier = 'azure';
  readonly name = 'Azure OpenAI';
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
  override readonly credentialFields: MediaCredentialField[] = [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'resourceName', label: 'Resource Name', type: 'string', required: true, placeholder: 'my-resource' },
    { key: 'apiVersion', label: 'API Version (optional)', type: 'string', required: false, placeholder: '2024-10-21' },
  ];
}

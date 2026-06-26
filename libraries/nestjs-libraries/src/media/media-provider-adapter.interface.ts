// Typed contract for the per-org media-generation providers (§11.2).
// Images are synchronous (standardized `{ multi, image|images }`); video/audio/avatar
// are asynchronous job submissions completed via webhook (preferred) or `pollJob`.

export interface MediaProviderCapabilities {
  image: boolean;
  video: boolean;
  audio: boolean;
  avatar: boolean;
  tts: boolean;
  stt: boolean;
  upscale: boolean;
  bgRemove: boolean;
  inpaint: boolean;
}

// Metadata extracted from provider responses (§11.7) — persisted on Media.metadata.
export interface MediaArtifactMetadata {
  provider?: string;
  model?: string;
  mime?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  seed?: number;
  costUsd?: number;
  provenance?: string;
  prompt?: string;
  source?: string;
  segments?: { start: number; end: number; text: string }[];
}

export interface MediaGenerationResult {
  multi: boolean;
  image?: string;
  images?: string[];
  metadata?: MediaArtifactMetadata;
}

export type MediaInputValue = string | number | boolean;

// Per-provider credential schema for the Settings → Media modal. Most providers need a
// single API key (the modal's default) and omit this; multi-field providers (e.g. Google
// Vertex: project + location + service-account JSON) declare their fields here so the modal
// renders them dynamically. Mirrors the AI provider's `CredentialField`.
export interface MediaCredentialField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'textarea';
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface MediaCredentialOptions {
  apiKey?: string;
  credentials?: Record<string, string>;
}

export interface MediaGenerateOptions extends MediaCredentialOptions {
  model?: string;
  size?: string;
  n?: number;
  quality?: string;
  version?: string;
  aspectRatio?: string;
  loop?: boolean;
  durationSeconds?: number;
  avatarId?: string;
  // Source image/asset URL for image-to-video and talking-avatar providers.
  sourceUrl?: string;
  voice?: string;
  voiceId?: string;
  format?: string;
  mimeType?: string;
  scale?: number;
  voiceSettings?: { stability?: number; similarityBoost?: number };
  // Completion webhook for async jobs — providers that support callbacks call it;
  // the polling sweep covers the rest.
  webhookUrl?: string;
  input?: Record<string, MediaInputValue>;
}

// Async submission. Synchronous providers may return the finished artifact inline
// (`artifactUrl` set) — the caller then completes the job without webhook/polling.
export interface MediaJobSubmission {
  jobId: string;
  artifactUrl?: string;
  metadata?: MediaArtifactMetadata;
}

export interface MediaPollResult {
  status: 'pending' | 'completed' | 'failed';
  artifactUrl?: string;
  error?: string;
  metadata?: MediaArtifactMetadata;
}

export type MediaOperation = 'image' | 'video' | 'audio';

// A single entry in a provider's runtime model catalog for one modality.
export interface MediaModelOption {
  id: string;
  label: string;
}

export function resolveApiKey(options?: MediaCredentialOptions): string | undefined {
  return (
    options?.apiKey ||
    options?.credentials?.apiKey ||
    options?.credentials?.key ||
    options?.credentials?.token ||
    undefined
  );
}

export interface MediaProviderAdapter {
  readonly identifier: string;
  readonly name: string;
  readonly capabilities: MediaProviderCapabilities;

  // Optional multi-field credential schema. When absent, the Settings → Media modal
  // collects a single `apiKey`.
  readonly credentialFields?: MediaCredentialField[];

  generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult>;

  generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission>;
  generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission>;
  generateAvatar(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission>;

  pollJob?(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult>;

  // Optional runtime model catalog for a modality — powers the studio's dynamic model
  // dropdown (`select` field with `source: 'models'`). Hubs with large/changing catalogs
  // implement this (hitting their `/models` endpoint, or reusing the AI adapter's
  // `listModels`); providers with a small fixed set omit it and rely on the descriptor's
  // static options. Returns [] when the modality has no models.
  listModels?(operation: MediaOperation, options?: MediaCredentialOptions): Promise<MediaModelOption[]>;

  // Lightweight credential/auth check for the Settings → Media "Test connection" action.
  // Image-only providers can rely on the generateImage fallback; providers without image
  // generation (video/avatar/tts/stt) should implement this so the test doesn't
  // misleadingly fail with a "does not support image generation" error.
  testConnection?(options?: MediaCredentialOptions): Promise<{ ok: boolean; message: string }>;

  textToSpeech?(text: string, options?: MediaGenerateOptions): Promise<Buffer | string>;
  speechToText?(audio: Buffer, options?: MediaGenerateOptions): Promise<string>;
  speechToTextWords?(audio: Buffer, options?: MediaGenerateOptions): Promise<{ text: string; words: { word: string; start: number; end: number }[] }>;
  upscaleImage?(imageUrl: string, options?: MediaGenerateOptions): Promise<string>;
  removeBackground?(imageUrl: string, options?: MediaGenerateOptions): Promise<string>;
  inpaintImage?(imageUrl: string, maskUrl: string, prompt: string, options?: MediaGenerateOptions): Promise<string>;
}

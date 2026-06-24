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

  generateImage(prompt: string, options?: MediaGenerateOptions): Promise<MediaGenerationResult>;

  generateVideo(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission>;
  generateAudio(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission>;
  generateAvatar(prompt: string, options?: MediaGenerateOptions): Promise<MediaJobSubmission>;

  pollJob?(jobId: string, options?: MediaCredentialOptions): Promise<MediaPollResult>;

  textToSpeech?(text: string, options?: MediaGenerateOptions): Promise<Buffer | string>;
  speechToText?(audio: Buffer, options?: MediaGenerateOptions): Promise<string>;
  speechToTextWords?(audio: Buffer, options?: MediaGenerateOptions): Promise<{ text: string; words: { word: string; start: number; end: number }[] }>;
  upscaleImage?(imageUrl: string, options?: MediaGenerateOptions): Promise<string>;
  removeBackground?(imageUrl: string, options?: MediaGenerateOptions): Promise<string>;
  inpaintImage?(imageUrl: string, maskUrl: string, prompt: string, options?: MediaGenerateOptions): Promise<string>;
}

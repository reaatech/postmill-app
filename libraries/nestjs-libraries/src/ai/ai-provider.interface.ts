import type { LanguageModelV2, ImageModelV2, EmbeddingModelV2, SpeechModelV2 } from '@ai-sdk/provider-v5';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type LanguageModel = LanguageModelV2;
export type ImageModel = ImageModelV2;
export type EmbeddingModel = EmbeddingModelV2<string>;
export type SpeechModel = SpeechModelV2;

export type AIProviderType = 'hub' | 'direct';

export interface CredentialField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'textarea' | 'select';
  required: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  kind: 'text' | 'image' | 'embedding';
  dimension?: number;
  capabilities: AICapabilities;
}

export interface AICapabilities {
  text: boolean;
  image: boolean;
  vision: boolean;
  embeddings: boolean;
  speech: boolean;
  tools: boolean;
}

export interface AIModelOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

// When adding a new scope, update SURFACE_DEFAULTS in ai-model.provider.ts
// and the exhaustive checks in all switch statements.
export type AIScope = 'utility' | 'generator' | 'agent' | 'mcp';

export interface AIProviderAdapter {
  readonly identifier: string;
  readonly name: string;
  readonly type: AIProviderType;
  readonly credentialFields: CredentialField[];
  readonly capabilities: AICapabilities;
  readonly privacy?: {
    dataRetention: string;
    trainingOnData: boolean;
    zeroRetention?: boolean;
    description: string;
  };
  readonly health?: {
    lastSuccessAt: number | null;
    lastErrorAt: number | null;
    successCount: number;
    errorCount: number;
    consecutiveErrors: number;
  };

  listModels(creds: Record<string, string>): Promise<ModelInfo[]>;
  validateCredentials(
    creds: Record<string, string>,
  ): Promise<{ ok: boolean; error?: string }>;

  createLanguageModel(
    creds: Record<string, string>,
    modelId: string,
    opts?: AIModelOptions,
  ): LanguageModel;
  createLangchainModel(
    creds: Record<string, string>,
    modelId: string,
    opts?: AIModelOptions,
  ): BaseChatModel;
  createImageModel?(
    creds: Record<string, string>,
    modelId: string,
  ): ImageModel | undefined;
  createEmbeddingModel?(
    creds: Record<string, string>,
    modelId: string,
  ): EmbeddingModel | undefined;
  createSpeechModel?(
    creds: Record<string, string>,
    modelId: string,
  ): SpeechModel | undefined;
}

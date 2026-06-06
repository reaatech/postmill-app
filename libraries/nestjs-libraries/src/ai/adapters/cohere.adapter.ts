import { Injectable } from '@nestjs/common';
import { createCohere } from '@ai-sdk/cohere';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LanguageModelV2, EmbeddingModelV2 } from '@ai-sdk/provider-v5';
import {
  type AIProviderAdapter,
  type CredentialField,
  type ModelInfo,
  type AICapabilities,
  type AIModelOptions,
} from '../ai-provider.interface';

const COHERE_CAPABILITIES: AICapabilities = {
  text: true,
  image: false,
  vision: false,
  embeddings: true,
  speech: false,
  tools: true,
};

const COHERE_CREDENTIAL_FIELDS: CredentialField[] = [
  { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: '...' },
];

const COHERE_MODELS: ModelInfo[] = [
  { id: 'command-r-plus', label: 'Command R+', kind: 'text', capabilities: { ...COHERE_CAPABILITIES, embeddings: false } },
  { id: 'command-r', label: 'Command R', kind: 'text', capabilities: { ...COHERE_CAPABILITIES, embeddings: false } },
  { id: 'command', label: 'Command', kind: 'text', capabilities: { ...COHERE_CAPABILITIES, embeddings: false } },
  { id: 'embed-english-v3.0', label: 'Embed English v3', kind: 'embedding', dimension: 1024, capabilities: { text: false, image: false, vision: false, embeddings: true, speech: false, tools: false } },
  { id: 'embed-multilingual-v3.0', label: 'Embed Multilingual v3', kind: 'embedding', dimension: 1024, capabilities: { text: false, image: false, vision: false, embeddings: true, speech: false, tools: false } },
];

const COHERE_BASE_URL = 'https://api.cohere.com/v1';

@Injectable()
export class CohereAdapter implements AIProviderAdapter {
  readonly identifier = 'cohere';
  readonly name = 'Cohere';
  readonly type = 'direct' as const;
  readonly credentialFields = COHERE_CREDENTIAL_FIELDS;
  readonly capabilities = COHERE_CAPABILITIES;
  readonly privacy = {
    dataRetention: 'Per Cohere privacy policy',
    trainingOnData: false,
    description: 'Cohere API',
  };

  private _buildProvider(creds: Record<string, string>) {
    return createCohere({ apiKey: creds.apiKey });
  }

  async listModels(_creds: Record<string, string>): Promise<ModelInfo[]> {
    return COHERE_MODELS;
  }

  async validateCredentials(creds: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    if (!creds.apiKey) return { ok: false, error: 'API key is required' };
    try {
      const response = await fetch(`${COHERE_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${creds.apiKey}` },
      });
      if (response.ok) return { ok: true };
      const errorText = await response.text().catch(() => '');
      return { ok: false, error: `API error: ${response.status} ${errorText}` };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Unknown error' };
    }
  }

  createLanguageModel(creds: Record<string, string>, modelId: string, _opts?: AIModelOptions): LanguageModelV2 {
    return this._buildProvider(creds).languageModel(modelId) as unknown as LanguageModelV2;
  }

  createLangchainModel(creds: Record<string, string>, modelId: string, opts?: AIModelOptions): BaseChatModel {
    return new ChatOpenAI({
      openAIApiKey: creds.apiKey,
      configuration: { baseURL: COHERE_BASE_URL },
      model: modelId,
      temperature: opts?.temperature,
      topP: opts?.topP,
      maxTokens: opts?.maxTokens,
    });
  }

  createEmbeddingModel(creds: Record<string, string>, modelId: string): EmbeddingModelV2<string> | undefined {
    return this._buildProvider(creds).textEmbeddingModel?.(modelId);
  }
}

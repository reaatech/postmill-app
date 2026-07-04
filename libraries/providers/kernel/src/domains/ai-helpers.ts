import { createOpenAI } from '@ai-sdk/openai';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  LanguageModelV2,
  EmbeddingModelV2,
  ImageModelV2,
  SpeechModelV2,
} from '@ai-sdk/provider-v5';
import type {
  AiCapability,
  AiProviderType,
  AiCredentialField,
  AiModelInfo,
  AiCapabilities,
  AiModelOptions,
} from './ai';

/**
 * Shared OpenAI-compatible AI adapter base. Lives in the kernel so the nine
 * `openai-compatible` provider packages (siliconflow, deepinfra, minimax, qwen,
 * meta-llama, gmihub, bitdeer, lightning, vultr) can construct it without
 * importing each other or `@gitroom/nestjs-libraries`.
 */
export class OpenAICompatibleAdapter implements AiCapability {
  readonly identifier: string;
  readonly name: string;
  readonly type: AiProviderType;
  readonly credentialFields: AiCredentialField[];
  readonly capabilities: AiCapabilities;
  readonly privacy = {
    dataRetention: 'Varies by provider — review the provider\'s data policy',
    trainingOnData: false,
    description: 'Generic OpenAI-compatible API provider',
  };
  private readonly _defaultModels: AiModelInfo[];
  private readonly _defaultBaseURL: string;
  private _providerCache = new Map<string, ReturnType<typeof createOpenAI>>();

  constructor(
    identifier: string,
    name: string,
    baseURL: string,
    capabilities?: Partial<AiCapabilities>,
    models?: AiModelInfo[],
    type: AiProviderType = 'hub',
  ) {
    this.identifier = identifier;
    this.name = name;
    this.type = type;
    // The provider's canonical endpoint. Used as the default when the org didn't
    // set a custom baseURL, so Base URL is not a required user setting.
    this._defaultBaseURL = baseURL;
    this.credentialFields = [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Enter API key' },
      { key: 'baseURL', label: 'Base URL', type: 'string', required: false, placeholder: baseURL },
    ];
    this.capabilities = {
      text: true,
      image: capabilities?.image || false,
      vision: capabilities?.vision || false,
      embeddings: capabilities?.embeddings || false,
      speech: capabilities?.speech || false,
      tools: capabilities?.tools ?? true,
    };
    this._defaultModels = models || [
      { id: 'default', label: `${name} Default`, kind: 'text', capabilities: this.capabilities },
    ];
  }

  private _getProvider(creds: Record<string, string>) {
    const baseURL = creds.baseURL || this._defaultBaseURL;
    const key = `${creds.apiKey}||${baseURL}`;
    let provider = this._providerCache.get(key);
    if (!provider) {
      provider = createOpenAI({ apiKey: creds.apiKey, baseURL: baseURL || undefined });
      this._providerCache.set(key, provider);
    }
    return provider;
  }

  async listModels(creds: Record<string, string>): Promise<AiModelInfo[]> {
    const resolvedBaseURL = creds.baseURL || this._defaultBaseURL;
    if (resolvedBaseURL && creds.apiKey) {
      try {
        const baseURL = resolvedBaseURL.replace(/(?<![/])\/+$/, '');
        const response = await fetch(`${baseURL}/models`, {
          headers: { Authorization: `Bearer ${creds.apiKey}` },
        });
        if (response.ok) {
          const data: any = await response.json();
          const models = data.data || [];
          if (Array.isArray(models) && models.length > 0) {
            return models.map((m: any) => {
              const id = m.id.toLowerCase();
              let kind: 'text' | 'image' | 'embedding' = 'text';
              const caps = { ...this.capabilities };
              if (id.includes('embedding')) {
                kind = 'embedding';
                caps.text = false;
                caps.image = false;
                caps.vision = false;
                caps.speech = false;
                caps.tools = false;
                caps.embeddings = true;
              } else if (id.includes('dall-e') || id.includes('image')) {
                kind = 'image';
                caps.text = false;
                caps.embeddings = false;
                caps.speech = false;
                caps.tools = false;
                caps.vision = false;
                caps.image = true;
              }
              return { id: m.id, label: m.id, kind, capabilities: caps };
            });
          }
        }
      } catch {
      }
    }
    return this._defaultModels;
  }

  async validateCredentials(creds: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    if (!creds.apiKey) return { ok: false, error: 'API key is required' };
    try {
      const baseURL = (creds.baseURL || this._defaultBaseURL || '').replace(/(?<![/])\/+$/, '');
      if (baseURL) {
        const response = await fetch(`${baseURL}/models`, {
          headers: { Authorization: `Bearer ${creds.apiKey}` },
        });
        if (response.ok) return { ok: true };
        const errorText = await response.text().catch(() => '');
        return { ok: false, error: `API error: ${response.status} ${errorText}` };
      }
      return { ok: false, error: 'Base URL is required to validate credentials' };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Unknown error' };
    }
  }

  createLanguageModel(creds: Record<string, string>, modelId: string, _opts?: AiModelOptions): LanguageModelV2 {
    return this._getProvider(creds).languageModel(modelId);
  }

  createImageModel(creds: Record<string, string>, modelId: string): ImageModelV2 | undefined {
    return this._getProvider(creds).imageModel?.(modelId);
  }

  createLangchainModel(creds: Record<string, string>, modelId: string, opts?: AiModelOptions): BaseChatModel {
    return new ChatOpenAI({
      openAIApiKey: creds.apiKey,
      configuration: { baseURL: creds.baseURL || this._defaultBaseURL || undefined },
      model: modelId,
      temperature: opts?.temperature,
      topP: opts?.topP,
      maxTokens: opts?.maxTokens,
    });
  }

  createEmbeddingModel(creds: Record<string, string>, modelId: string): EmbeddingModelV2<string> | undefined {
    return this._getProvider(creds).textEmbeddingModel?.(modelId);
  }

  createSpeechModel(creds: Record<string, string>, modelId: string): SpeechModelV2 | undefined {
    return this._getProvider(creds).speechModel?.(modelId);
  }
}

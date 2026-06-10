# Adding an AI Provider Adapter

Postmill's AI layer supports 25 providers through a pluggable adapter system.
This guide walks through adding a new AI provider.

## Decision: bespoke vs OpenAI-compatible

Before writing code, decide which pattern applies:

| Pattern | When to use | Example |
|---------|------------|---------|
| **Bespoke adapter** | Provider has its own `@ai-sdk/*` package (e.g. `@ai-sdk/anthropic`, `@ai-sdk/google`) | OpenAI, Anthropic, Google, xAI, Mistral |
| **OpenAICompatibleAdapter** | Provider exposes an OpenAI-compatible API endpoint | SiliconFlow, DeepInfra, MiniMax, Lightning AI |

For OpenAI-compatible providers, you instantiate `OpenAICompatibleAdapter` with
a base URL and capabilities. No new class needed.

For bespoke providers, create a class implementing `AIProviderAdapter`.

## Step 1: Implement `AIProviderAdapter`

Create a new file in `libraries/nestjs-libraries/src/ai/adapters/` (e.g.
`yourprovider.adapter.ts`).

### Required properties

```typescript
import type { AIProviderAdapter, AICapabilities, CredentialField, ModelInfo, AIModelOptions } from '../ai-provider.interface';
import type { LanguageModelV2, ImageModelV2, EmbeddingModelV2, SpeechModelV2 } from '@ai-sdk/provider-v5';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export class YourProviderAdapter implements AIProviderAdapter {
  readonly identifier = 'yourprovider';       // Unique string ID
  readonly name = 'Your Provider';             // Display name
  readonly type: AIProviderType = 'direct';    // 'direct' or 'hub'
```

### Credential fields

```typescript
  readonly credentialFields: CredentialField[] = [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'Enter your API key',
    },
  ];
```

`CredentialField` supports these types: `string`, `password`, `textarea`,
`select`. Select fields require an `options` array.

### Capabilities

```typescript
  readonly capabilities: AICapabilities = {
    text: true,
    image: false,
    vision: false,
    embeddings: false,
    speech: false,
    tools: true,
  };
```

Be honest about capabilities. The admin screen gates features on these flags.

### Privacy (optional)

```typescript
  readonly privacy = {
    dataRetention: '30 days',
    trainingOnData: false,
    description: 'Enterprise-grade privacy with no training on customer data',
  };
```

### Core methods

```typescript
  async listModels(creds: Record<string, string>): Promise<ModelInfo[]> {
    // Fetch available models from the provider's API
    return [
      { id: 'model-v1', label: 'Model V1', kind: 'text', capabilities: this.capabilities },
    ];
  }

  async validateCredentials(creds: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    if (!creds.apiKey) return { ok: false, error: 'API key is required' };
    try {
      // Make a lightweight API call to verify credentials
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
```

### Model creation methods

**`createLanguageModel` (required):**

```typescript
  createLanguageModel(creds: Record<string, string>, modelId: string, opts?: AIModelOptions): LanguageModelV2 {
    const provider = createProvider({ apiKey: creds.apiKey });
    return provider.languageModel(modelId);
  }
```

Uses the `@ai-sdk/*` package specific to your provider (Vercel AI SDK v5).

**`createLangchainModel` (required):**

```typescript
  createLangchainModel(creds: Record<string, string>, modelId: string, opts?: AIModelOptions): BaseChatModel {
    return new ChatProviderModel({
      apiKey: creds.apiKey,
      model: modelId,
      temperature: opts?.temperature,
      topP: opts?.topP,
      maxTokens: opts?.maxTokens,
    });
  }
```

Uses the LangChain chat model class for your provider.

**Optional methods:**

```typescript
  createImageModel?(creds: Record<string, string>, modelId: string): ImageModelV2 | undefined;
  createEmbeddingModel?(creds: Record<string, string>, modelId: string): EmbeddingModelV2 | undefined;
  createSpeechModel?(creds: Record<string, string>, modelId: string): SpeechModelV2 | undefined;
```

Implement only what the provider supports, gated on the capabilities flags.

## Step 2: Register with the AI provider registry

In `libraries/nestjs-libraries/src/ai/ai.module.ts`, import your adapter and
register it in the `onModuleInit` hook:

```typescript
import { YourProviderAdapter } from './adapters/yourprovider.adapter';

// In AiModule.onModuleInit():
this.registry.register(new YourProviderAdapter());
```

For `OpenAICompatibleAdapter`:

```typescript
this.registry.register(new OpenAICompatibleAdapter(
  'yourprovider',
  'Your Provider',
  'https://api.yourprovider.com/v1',
  { vision: true },     // partial capabilities override
  [                     // default models (fallback if /models endpoint fails)
    { id: 'model-v1', label: 'Model V1', kind: 'text', capabilities: { text: true, image: false, vision: true, embeddings: false, speech: false, tools: true } },
  ],
  'hub',                // AIProviderType (direct or hub)
));
```

## Step 3: Credential encryption

Credentials are encrypted at rest via `EncryptionService` (AES-256-GCM, `v2:`
prefix). The adapter receives decrypted credentials at call time — it never
stores or logs them. No additional work needed on the adapter's part.

## Step 4: Tests

Write an adapter spec in `libraries/nestjs-libraries/src/ai/adapters/` (e.g.
`yourprovider.adapter.spec.ts`). Test:

- `validateCredentials()` with valid and invalid credentials
- `listModels()` returns expected shape
- `createLanguageModel()` / `createLangchainModel()` return valid model objects
- Optional methods return correct types or `undefined`

## OpenAICompatibleAdapter reference

For providers with OpenAI-compatible APIs, the adapter is pre-built:

```typescript
import { OpenAICompatibleAdapter } from '../adapters/openai-compatible.adapter';

const adapter = new OpenAICompatibleAdapter(
  'siliconflow',          // identifier
  'SiliconFlow',          // name
  'https://api.siliconflow.cn/v1',  // base URL
  {                       // capabilities (optional partial override)
    vision: true,
    embeddings: true,
  },
  [                       // default models (optional)
    { id: 'deepseek-v3', label: 'DeepSeek V3', kind: 'text', capabilities: { ... } },
  ],
  'hub',                  // type
);
```

The `OpenAICompatibleAdapter` automatically:
- Uses `@ai-sdk/openai` under the hood (works with any OpenAI-compatible API)
- Tries to fetch the model list from `{baseURL}/models` if credentials are provided
- Falls back to the provided default models if the `/models` endpoint is unreachable
- Supports `createImageModel`, `createEmbeddingModel`, and `createSpeechModel` when
  the underlying OpenAI-compatible API does

## Current adapter inventory

### Bespoke adapters (16)

`openai`, `anthropic`, `google`, `bedrock`, `vertex`, `azure`, `groq`,
`fireworks`, `togetherai`, `deepseek`, `mistral`, `cohere`, `perplexity`,
`xai`, `gateway`, `openrouter`

### OpenAI-compatible adapters (9)

`siliconflow`, `deepinfra`, `minimax`, `qwen`, `meta-llama`, `gmihub`,
`bitdeer`, `lightning`, `vultr`

**Total: 25 providers.**

> Verified against v3.7.0

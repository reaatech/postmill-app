# Adding an AI Adapter

How to add a new AI provider to the pluggable AI layer. For the architecture see
[AI architecture](./ai-architecture.md).

> **Verified against v3.4.0.** Adapters live in `libraries/nestjs-libraries/src/ai/adapters/`.

---

## Decide: distinct adapter or OpenAI-compatible?

- If the provider exposes an **OpenAI-compatible** API, you may not need a new class — the generic
  `OpenAICompatibleAdapter` is already registered for ~14 hub providers. Adding another hub provider
  can be as simple as registering it with the right base URL/metadata.
- If the provider needs bespoke wiring (its own SDK, auth, or model construction), implement a
  distinct adapter.

## 1. Implement `AIProviderAdapter`

Create `your-provider.adapter.ts` implementing the contract:

```ts
createLanguageModel(creds, modelId, options?)      // required
createLangchainModel(creds, modelId, options?)     // required
createImageModel?(creds, modelId)                  // optional
createEmbeddingModel?(creds, modelId)              // optional
createSpeechModel?(creds, modelId)                 // optional
```

Also declare the provider's metadata: credential fields (`CredentialField[]`), available models
(`ModelInfo[]`), and capabilities (`AICapabilities`). These drive the admin UI's credential form and
model picker.

## 2. Register it

Register the adapter with `AIProviderRegistry` so the facade can resolve it. Existing distinct
adapters (OpenAI, Anthropic, Azure, Gateway, Bedrock, Google, Vertex, Groq, Cohere, Mistral, xAI,
OpenRouter) are the reference set.

## 3. Wire credentials

Credentials are entered by a super-admin in [AI settings admin](../admin/ai-settings.md) and stored
encrypted (via `JWT_SECRET`). Your `CredentialField[]` defines what the admin form collects. Don't
read provider keys from ad-hoc env vars — go through the facade/config so resolution precedence and
governance apply.

## 4. Respect governance & the facade

- All calls should go through the facade so guardrails, budgets, telemetry, rate limiting, and
  idempotency apply. Don't bypass it with a direct SDK call from a feature.
- Make sure resolution still falls back to env OpenAI when nothing matches — don't break the
  backward-compatibility invariant. See [AI architecture](./ai-architecture.md).

## 5. Tests

Add an adapter spec (the existing `*.adapter.spec.ts` files are the pattern) covering
`createLanguageModel` / `createLangchainModel` and any optional methods you implement, plus the
registry registration. See [Testing](./testing.md).

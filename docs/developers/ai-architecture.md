# AI Architecture

The AI layer is a pluggable, admin-configurable, governed multi-provider system that replaces the
old single hardcoded OpenAI integration. This page is the developer view; for admin configuration
see [AI settings admin](../admin/ai-settings.md).

> **Verified against v3.5.9.** Code under `libraries/nestjs-libraries/src/ai`.

---

## The facade — `AIModelProvider`

A single injection point. Every AI surface resolves its model through it, parameterized by
`(scope, orgId?)`.

**Scopes** (`AIScope`): `utility` · `generator` · `agent` · `mcp`.

**Resolution precedence:**

```
per-org (BYOK)  →  per-scope model  →  global active provider  →  provider default  →  env OPENAI_API_KEY
```

**Public methods** (selected): `languageModel(scope, orgId?)`, `langchainModel(scope, orgId?)`,
`imageModel(scope, orgId?)`, `embeddingModel(scope, orgId?)`, plus convenience wrappers
`generateText(...)` and `generateObject<T>(...)`. Calls are wrapped in telemetry spans
(`ai.languageModel`, `ai.generateText`, …).

## The four surfaces (all re-pointed to the facade)

| Surface | Code | Scope it resolves |
|---------|------|-------------------|
| Utility AI (text/prompt/slides, image gen) | `OpenaiService` | `utility` |
| `/agents` generator (LangGraph) | `AgentGraphService` | `generator` |
| Chat agent (Mastra) | `LoadToolsService` | `agent` |
| Composer assistant (CopilotKit) | `copilot.controller.ts` | resolved creds from facade |

Because models are resolved per call, changing the admin-configured provider/model takes effect
without restarting services.

## Registry & adapters

`AIProviderRegistry` holds `AIProviderAdapter` implementations. Of the 25 supported providers, **16
have a bespoke adapter class** (OpenAI, Anthropic, Azure OpenAI, Vercel AI Gateway, Amazon Bedrock,
Google, Google Vertex AI, Groq, Cohere, Mistral, xAI Grok, DeepSeek, Together AI, Fireworks,
Perplexity, OpenRouter) and the remaining **9 are wired through the generic OpenAI-compatible
adapter**. (This is an *implementation* split — how each provider is wired — not the product
direct-vs-hub taxonomy used in the user-facing docs; e.g. MiniMax/Qwen are direct models served via
the generic adapter, while Bedrock/Vertex are hubs with bespoke adapters.)

The adapter contract (`AIProviderAdapter`):

```ts
createLanguageModel(creds, modelId, options?)      // required
createLangchainModel(creds, modelId, options?)     // required
createImageModel?(creds, modelId)                  // optional
createEmbeddingModel?(creds, modelId)              // optional
createSpeechModel?(creds, modelId)                 // optional
```

To add one, see [Adding an AI adapter](./adding-an-ai-adapter.md).

## Governance

Under `ai/governance/`:

- `guardrail.service.ts` — input/output guard chains (prompt-injection, PII, brand safety, NSFW)
  with `block | redact | warn` actions.
- `budget.service.ts` + `budget.middleware.ts` — per-scope/per-org caps, threshold alerts, spend
  logging to `AISpendLog`.
- `telemetry.service.ts` — OpenTelemetry GenAI spans (no-op when unconfigured).
- `provider-health.service.ts` — success/error counters, health, failover readiness.
- `ai-throttler.guard.ts` + `idempotency.factory.ts` — runtime-configurable rate limiting and
  Redis-backed idempotency for agent and MCP routes.
- `media.service.ts` / `rag.service.ts` — Phase-5 scaffolds (see below).

## Media & RAG (foundation)

`AiMediaService` does working image generation via the facade; video falls back to image, and
TTS/STT/upscale/bg-remove/inpaint are stubs. `RagService`/`HybridRag` plus `AIBrandProfile` and
`AIContentIndex` are a retrieval-augmented-generation foundation. See
[AI generation](../features/ai-generation.md).

## Backward compatibility (preserve this)

No admin AI config = byte-for-byte today's `OPENAI_API_KEY` behaviour. Setting the active provider to
none reverts all four surfaces to the env-OpenAI path. **Do not break this invariant.**

## Data model

10 Prisma models: `AIProviderConfig`, `AISystemSettings`, `AISpendLog`, `AIOrgProviderConfig`,
`AIBrandProfile`, `AIPromptTemplate`, `AISettingsAudit`, `AIMediaJob`, `AIPromptLibraryItem`,
`AIContentIndex`. See [Data model](../reference/data-model.md).

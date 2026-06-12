# AI Architecture

Postmill ships a pluggable, multi-provider AI layer. Every AI surface resolves its provider
through a single injection point (`AIModelProvider`) — there are no hardcoded provider calls, and
**no `OPENAI_API_KEY` env-var fallback** (removed in v3.6.0). If an org has no active provider, AI
is simply off.

> For the end-user view, see [AI Tools](../user-guide/ai-tools.md).

---

## Resolution Precedence

`AIModelProvider._resolveConfig(scope, orgId?)` walks this chain and stops at the first match:

| Priority | Source | Description |
|---|---|---|
| 1 | Per-org active provider | `AIOrgProviderConfig` with `isActive: true` for the org |
| 2 | Per-scope override | `scopeModels[scope]` in `AISystemSettings` |
| 3 | Global active | `AISystemSettings.activeProvider` |
| 4 | Surface default | Hardcoded `SURFACE_DEFAULTS` map (see below) |

There is **no Priority 5** — the pre-v3.6.0 `OPENAI_API_KEY` fallback was removed in v3.6.3.

When resolution fails (no active provider for the org), `resolveConfigForScope` returns `null`, the
caller surfaces "AI not configured," and the frontend routes the user to **Settings → AI** to
configure a provider. CopilotKit does not mount when AI is off.

---

## Four AI Scopes

| Scope | Surface defaults | Temperature | Used by |
|---|---|---|---|
| `utility` | `gpt-4.1` (text), `chatgpt-image-latest` (image) | — | `OpenaiService` — text generation, prompt help, slide generation |
| `generator` | `gpt-4.1` (text), `chatgpt-image-latest` (image) | `0.7` | `AgentGraphService` — `/agents` LangGraph generator |
| `agent` | `gpt-5.2` (text) | — | `LoadToolsService` — Mastra chat agent function-form model |
| `mcp` | `gpt-4.1` (text) | — | CopilotKit runtime (`CopilotController`) — `/copilot/chat` and `/copilot/agent` |

---

## Four AI Surfaces

1. **Utility AI** (`OpenaiService`) — text generation (`generateText`), structured output
   (`generateObject`), and image generation. Used for post drafts, prompt rewriting, slide content,
   and TTS/STT via `AiMediaService`.

2. **Agent Generator** (`AgentGraphService`) — LangGraph-based agent builder at `/agents`. Resolves
   its model per-call via `AIModelProvider.langchainModel('generator', orgId)`.

3. **Mastra Chat Agent** (`LoadToolsService`) — function-form `model: () =>
   facade.languageModel('agent')` so provider/credential changes apply without restarting the MCP
   server.

4. **CopilotKit Runtime** (`CopilotController`) — `/copilot/chat` builds an `OpenAIAdapter` from
   facade-resolved credentials. Policy-gated (`@CheckPolicies`), budget-gated
   (`BudgetService.checkBudget`), and short-circuits when the org has no active provider.

---

## Provider Registry & Adapters

The `AIProviderRegistry` holds all registered adapters. 25 providers total:

**16 bespoke adapters:** `openai`, `anthropic`, `google`, `bedrock`, `vertex`, `azure`, `groq`,
`fireworks`, `togetherai`, `deepseek`, `mistral`, `cohere`, `perplexity`, `xai`, `gateway`,
`openrouter`

**9 OpenAI-compatible adapters** via `OpenAICompatibleAdapter`: `siliconflow`, `deepinfra`,
`minimax`, `qwen`, `meta-llama`, `gmihub`, `bitdeer`, `lightning`, `vultr`

Each adapter lives under `libraries/nestjs-libraries/src/ai/adapters/` and implements the
`AIProviderAdapter` interface.

### `AIProviderAdapter` Interface

```ts
interface AIProviderAdapter {
  readonly identifier: string;
  readonly name: string;
  readonly type: 'hub' | 'direct';
  readonly credentialFields: CredentialField[];
  readonly capabilities: AICapabilities;
  readonly privacy?: PrivacyInfo;
  readonly health?: HealthInfo;

  listModels(creds: Record<string, string>): Promise<ModelInfo[]>;
  validateCredentials(creds: Record<string, string>): Promise<{ ok: boolean; error?: string }>;

  createLanguageModel(creds, modelId, opts?): LanguageModel;
  createLangchainModel(creds, modelId, opts?): BaseChatModel;
  createImageModel?(creds, modelId): ImageModel | undefined;
  createEmbeddingModel?(creds, modelId): EmbeddingModel | undefined;
  createSpeechModel?(creds, modelId): SpeechModel | undefined;
}
```

### Credential Fields

Each adapter declares required credential fields (API keys, region selectors, etc.). The system
validates credentials before use — if required fields are missing, the provider is rejected with a
message pointing the user to Settings → AI.

---

## Two-Step Config & Reasoning Split (v3.8.10)

Per-org provider configuration is a two-step flow, focused on **LLM text** use:

1. **Auth** — API credentials (encrypted at rest; OAuth where a provider offers it).
2. **Model defaults** — the tenant picks a **standard** default (`defaultModel`) and an optional
   **reasoning** default (`reasoningModel`, nullable on both `AIOrgProviderConfig` and
   `AIProviderConfig`).

Supporting pieces:

- **`ModelInfo.reasoning?: boolean`** (TS type, not a DB column) splits the model picker into
  *Standard* vs *Reasoning* groups. Known reasoning models are matched by prefix in
  `libraries/nestjs-libraries/src/ai/reasoning-models.ts` (`isReasoningModel`).
- **Resolution:** a call may request the reasoning axis; `AIModelProvider` resolves
  `reasoningModel || defaultModel || SURFACE_DEFAULTS[scope].textModel` — existing configs with a
  null `reasoningModel` behave exactly as before.
- **`imageModel` is gone** — the `AIOrgProviderConfig.imageModel`/`AIProviderConfig.imageModel`
  columns were dropped in v3.8.10. Image, video, audio, and avatar generation belong to the
  **Media provider system** (below), not the AI-provider config. Embeddings remain an internal
  capability for RAG only.
- Tenants may configure **all** providers at once (`enabled` per row); one row per org is
  `isActive` — the default everywhere, with per-scope overrides via `scopeModels`.

---

## Media Provider System (v3.8.10)

Media generation moved off the AI-provider surface onto a pluggable per-org system in
`libraries/nestjs-libraries/src/media/`, mirroring the AI and short-link patterns:

- **`MediaProviderAdapter`** interface — each adapter declares `identifier`, `name`, and a
  capability matrix (`image`/`video`/`audio`/`avatar`/`tts`/`stt`/`upscale`/`bgRemove`/`inpaint`)
  and implements generation per media type. All outbound HTTP goes through `safeFetch`.
- **Registered adapters** (`MediaModule` → `MediaProviderRegistry`): fal.ai, OpenAI, ElevenLabs,
  HeyGen, Runway, Black Forest Labs, Google Vertex AI, Replicate, Stability AI, Tavus, D-ID,
  Hedra, MiniMax, Deepgram, Luma.
- **Delivery semantics:** images are **synchronous** with a standardized result —
  `{ multi: false, image }` or `{ multi: true, images }`. Video/audio/avatar are **asynchronous**
  (`{ jobId }`), tracked in `AIMediaJob` (`pending → processing → completed/failed`) with
  webhook-preferred completion and a `pollJob` fallback; the completion handler lands the artifact
  in the tenant's storage and records extracted metadata on `Media.metadata`.
- **`MediaProviderConfig`** — per-org config row (encrypted credentials + storage binding:
  `storageProviderId` (null = LOCAL) and `storageRootFolderId`, the provider root under which the
  typed `documents/ audio/ images/ video/ other/` folder tree lives).
- **API:** `/settings/media` — `GET /providers`, `GET /config`, `PUT /config/:identifier` (auth),
  `PUT /config/:identifier/storage` (storage binding), `POST /config/:identifier/set-active`,
  `POST /config/:identifier/test`, `DELETE /config/:identifier` — every route gated with
  `@RequirePermission('media-config', 'manage')`, like the storage and shortlink surfaces.
- **Auto-config:** **OpenAI** and **MiniMax** credentials are live-linked between the AI provider
  config and the matching `MediaProviderConfig` — saving credentials on one surface upserts the
  other (best-effort, non-fatal).

---

## Governance Layer

All governance services live in `libraries/nestjs-libraries/src/ai/governance/`.

### GuardrailService

Input and output guardrails:

| Stage | Guardrails | Actions |
|---|---|---|
| Input | Prompt injection detection, PII scanning (email/phone/SSN/CC), moderation policies (hate speech, violence) | `block`, `redact`, `warn` |
| Output | Content policy, brand safety, NSFW detection | `block`, `redact`, `warn` |

Guardrails use `@reaatech/guardrail-chain` and a configurable `GuardrailSettingsConfig` from
`AISystemSettings`. Each guardrail has a `sensitivity` level, optional custom patterns, and
categories.

### BudgetService

Token/cost tracking with three cap levels:
- **Global** — instance-wide monthly/daily spend caps
- **Per-org** — per-tenant caps via `perOrgCaps`
- **Per-scope** — per-AI-scope caps via `scopeCaps`

Writes to `AISpendLog` for every AI call. Uses an in-memory accumulator with a 60s TTL to avoid
per-call DB queries. Fires threshold alerts at 80% (configurable via `alertThresholdPct`). Returns
429 when budget is exceeded for a surface.

### ProviderHealthService

In-memory health tracking for every provider. Records success/error counters, consecutive errors,
and timestamps. Exposed via `AIModelProvider.getProviderHealth()`.

### CircuitBreakerService

Per-provider state machine:

```
CLOSED ──(5 consecutive failures)──▶ OPEN
OPEN ──(30s cooldown)──▶ HALF_OPEN
HALF_OPEN ──(success)──▶ CLOSED
HALF_OPEN ──(failure)──▶ OPEN
```

While a breaker is OPEN, `AIModelProvider._withFallback` skips the primary provider and routes to
the configured `fallbackProvider`. Pure in-memory, process-local — no new infra required.

### SemanticCacheService (OPT-IN)

Two-tier caching:
1. **Exact hash** — deterministic match on prompt hash
2. **Embedding similarity** — vector-distance threshold

Per-org scoped. Off by default; enabled via `cacheSettings` in `AISystemSettings`.

### ModelRouterService (OPT-IN)

Budget-aware model routing, cheapest-first. Off by default; enabled via `routingSettings`.

### ToolFirewallService

Agent/MCP tool allow/deny lists. Enforces a 256 KB max input size for tool calls. Configured
through `mcpSettings`.

### RagService

pgvector-based RAG:
- Content chunking with configurable `chunkSize` (default 500) and `chunkOverlap` (default 100)
- Embedding computation via `AIModelProvider.embeddingModel()`
- HNSW ANN index on the side table
- Dual vector store: pgvector + Qdrant (configurable via `vectorStore` setting)
- Reciprocal-rank fusion for hybrid search
- Redis index queue for durable backfill
- Per-org scoped search + admin backfill
- Raw SQL confined to `AiRagRepository`
- Embedding side table created via raw SQL (NOT in `schema.prisma` — `db push` would drop it)

### AiThrottlerGuard

Dynamic rate limits read from `AISystemSettings.rateLimitSettings`. Applied as a NestJS guard.

### IdempotencyFactory

Redis-backed deduplication middleware with a 24-hour TTL. Prevents double-processing of identical
requests.

### TelemetryService

OpenTelemetry via OTLP. Structured GenAI spans with attributes (`gen_ai.system`,
`gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`). Configured
through `observability` settings in `AISystemSettings`.

---

## AiMediaService

`AiMediaService` (`libraries/nestjs-libraries/src/ai/governance/media.service.ts`) wraps the
media operations (`image`, `video`, `tts`, `stt`, `upscale`, `bg-remove`, `inpaint`). Since
v3.8.10 the provider resolution behind these operations goes through the per-org **Media provider
system** (see above — `OrgMediaProviderSettingsService` + `MediaProviderRegistry`) rather than
hardcoded MCP wrappers; each operation is gated on its provider being configured and enabled in
`MediaProviderConfig`.

Media operations are credit-gated: `image`/`upscale`/`bg-remove`/`inpaint` consume `ai_images`
credits; `video` consumes `ai_videos` credits; `tts`/`stt` have no legacy credit equivalent.

C2PA provenance signing is available for visual operations (`image`, `video`, `upscale`, `inpaint`,
`bg-remove`). A cost ledger records per-job USD estimates in `AIMediaJob.costUsd`.

---

## No-Provider Behaviour

`resolveConfigForScope` returns `null` → AI is **off** for the org across all four surfaces. The
frontend does not mount CopilotKit when AI is off and routes the user to **Settings → AI**. This is
the correct, intentional behaviour — a deployment's env key must never be silently used as a
tenant's AI provider.

---

## Admin API

`/admin/ai-settings` — super-admin-gated endpoints for:
- Provider management (CRUD, test connection, set active)
- Governance settings (guardrails, budget, rate limits, observability)
- Spend log and audit log
- Provider health dashboard

---

## Data Model

10 Prisma models under the AI domain:

| Model | Purpose |
|---|---|
| `AIOrgProviderConfig` | Per-org provider credentials (encrypted), active flag, `defaultModel` + `reasoningModel` (`imageModel` dropped v3.8.10) |
| `AISpendLog` | Cost ledger — input/output tokens, cost, provider, model, scope |
| `AIBrandProfile` | Brand voice instructions + language. Many per org since v3.8.10 (`name`/`isDefault`/`slug`), selectable per-post via `Post.brandId` |
| `AIPromptTemplate` | Editable prompt templates (org-scoped or global) |
| `AISettingsAudit` | Append-only audit log of AI-settings changes |
| `AIMediaJob` | Media pipeline job/artifact tracking + provenance |
| `AIPromptLibraryItem` | User-created reusable prompts |
| `AIContentIndex` | RAG index — chunk metadata + BM25 text (embeddings in side table) |
| `AIProviderConfig` | **DEPRECATED v3.6.0** — replaced by `AIOrgProviderConfig` |
| `AISystemSettings` | **DEPRECATED v3.6.0** — active provider moved to per-tenant; kept for scope models, fallback config, and governance toggles |

Two related models live outside the AI group since v3.8.10: `MediaProviderConfig` (per-org media
provider + storage binding) and `Post.brandId` (per-post brand selection). See
[Data Model](./data-model.md).

> Verified against v3.8.10

# CLAUDE.md

This project's agent guidance lives in [AGENTS.md](./AGENTS.md). See that file for the repository
layout, setup/commands, backend and frontend conventions, database notes, and architecture details.

@AGENTS.md

---

# Architecture notes

## AI Providers (v3.4.0)

The AI layer is a pluggable, admin-configurable, governed multi-provider system. The old single
hardcoded OpenAI integration is replaced by a facade that four surfaces now route through.

### Four AI surfaces
1. **Utility AI** (`OpenaiService`) — text/prompt/slides. Uses `AIModelProvider` for text; image
   gen via `AIModelProvider.imageModel()`, voice via `AIModelProvider.generateObject()`. See
   `AiMediaService` for media wrapping — image, video (Luma), TTS (ElevenLabs/OpenAI), STT
   (Deepgram/OpenAI), upscale/bg-remove/inpaint (Replicate) are all wired through
   `@reaatech/media-pipeline-mcp-*`, each gated on its provider being configured + enabled.
2. **`/agents` generator** (`AgentGraphService`) — LangGraph. Resolves model per-call via
   `AIModelProvider.langchainModel()`.
3. **Mastra chat agent** (`LoadToolsService`) — function-form `model: () =>
   facade.languageModel('agent')` so provider changes apply without restarting the MCP server.
4. **CopilotKit runtime** (`copilot.controller.ts`) — `/copilot/chat` and `/copilot/agent` build
   `OpenAIAdapter` from facade-resolved credentials; env guard short-circuits only when neither
   admin config nor `OPENAI_API_KEY` exists.

### Architecture
- **`AIModelProvider`** (`libraries/nestjs-libraries/src/ai/`) — single injection point,
  `(scope, orgId?)` resolution. Precedence: per-org (stub) → per-scope → global active → provider
  default → env-OpenAI fallback. Wrappers: `generateText`, `generateObject`, `imageModel`.
- **`AIProviderRegistry`** + **`AIProviderAdapter`** — 12 distinct adapters plus a generic
  `OpenAICompatibleAdapter` for 14 hub providers; each implements `createLanguageModel`,
  `createLangchainModel`, optional `createImageModel` / `createEmbeddingModel` / `createSpeechModel`.
- **Governance** (`libraries/nestjs-libraries/src/ai/governance/`): `guardrail.service.ts`,
  `budget.service.ts`, `telemetry.service.ts` (no-op when unconfigured),
  `provider-health.service.ts`, `media.service.ts` (multi-provider media pipeline — image/video/
  TTS/STT/upscale/bg-remove/inpaint via `@reaatech/media-pipeline-mcp-*`, C2PA provenance, cost
  ledger), `rag.service.ts` (real pgvector RAG — raw SQL confined to `AiRagRepository`, HNSW ANN,
  durable Redis index queue, org-scoped search + backfill), `semantic-cache.service.ts` +
  `model-router.service.ts` (both opt-in, off by default).
- **Admin API** at `/admin/ai-settings` (super-admin gated) — provider management, test connection,
  set active, governance settings, spend log, audit log, health.
- **MCP auth** — `start.mcp.ts` enforces `@reaatech/a2a-reference-auth` scopes on all 5 entrypoints.

### Backward compatibility
No admin AI config = byte-for-byte today's `OPENAI_API_KEY` behaviour. `activeProvider = null`
reverts all four surfaces to the env-OpenAI path. **Preserve this invariant.**

### Data model
10 Prisma models: `AIProviderConfig`, `AISystemSettings`, `AISpendLog`, `AIOrgProviderConfig`,
`AIBrandProfile`, `AIPromptTemplate`, `AISettingsAudit`, `AIMediaJob`, `AIPromptLibraryItem`,
`AIContentIndex`.

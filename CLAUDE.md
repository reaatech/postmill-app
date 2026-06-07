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

## Feature surfaces (v3.5.0)

New analytics/AI/social surfaces, all additive on existing infrastructure.

- **Provider capability matrix (3P)** — `provider-capabilities.ts` (`integrations/social/`) is the
  single source of truth (analytics, comments, first comment, polls, video, carousel, alt text,
  max media, link preview, refresh token), exposed via `provider-capabilities.controller.ts`.
  Composer/admin UI read it. **Foundation for 2F/3E/3F/2J — read it, don't reinvent gating.**
- **Comment expansion + inbox (3E/2I)** — `ISocialMediaComments` added to 8 more providers
  (Discord, Telegram, Slack, WordPress, dev.to, Hashnode, Medium, TikTok). Unified comment inbox
  (`/comments` route) over `SocialComment`/`PostCommentRead` with filters, sentiment/priority
  badges (2E), bulk mark-read, quick replies.
- **First comment (2F, workflow v1.0.6)** — auto-posts a first comment after a successful `post()`.
  Capability-gated (`providerCapabilities.firstComment`), **idempotent** (records comment id /
  `firstCommentPostedAt`, no double-post on retry/continueAsNew), **non-fatal** (post stays published).
- **Poll posts (3F)** — part of the post payload for X/LinkedIn when `settings.poll` is set;
  **validate before publish** (2-4 options, length, duration) in the 2J preflight and server-side;
  gated on `providerCapabilities.poll`.
- **Campaign folders (3O)** — additive `Campaign` model + nullable `Post.campaignId`; grouping for
  media/analytics/comments derives transitively through the post's `campaignId`.
- **Watchlist (3N)** — `WatchedAccount`/`WatchedAccountMetric`; lightweight public probes ride the
  existing collection sweep (`RUN_CRON=true`), capability-gated, auto-disable on probe failure
  (record `lastError`, never crash the sweep), probe via `safeFetch`.
- **Bulk import (2L)** — `POST /posts/bulk` via shared post-creation logic (3C) + 2J preflight,
  per-row results without failing the batch; can target a campaign (3O).
- **Best-time / recommendations (2G/2H)** — `GET /analytics/v2/best-time` (structured day×hour
  heatmap; coexists with the composer's LLM-text `ai.best-time.tsx`) and
  `GET /analytics/v2/recommendations` (prioritized actions deep-linking into the relevant view).

## Security, Observability & CI (v3.5.0)

### Sentry scrubbing
- **`beforeSend`/`beforeBreadcrumb`** in `initialize.sentry.ts` strips `Authorization`/`auth`/`cookie`/`showorg`/`impersonate` headers, `apiKey`, `pos_`/`pca_`/`pcs_` tokens, passwords, full prompt bodies, and request data from all sent events.
- **PII capture disabled**: OpenAI integration `recordInputs: false`, `recordOutputs: false`; frontend `sendDefaultPii: false`.
- **`consoleLoggingIntegration`** gated behind `allowLogs` flag; only `warn`/`error` levels when enabled.

### Helmet (main.ts)
- `helmet()` applied after CORS with HSTS (1 year, includeSubDomains, preload), `noSniff`, `referrerPolicy: strict-origin-when-cross-origin`, `frameguard: deny`, and a conservative CSP.
- `NOT_SECURED` env var skips helmet entirely (dev/local).

### CopilotKit /chat gating (3AM)
- `/copilot/chat` now requires `@CheckPolicies([AuthorizationActions.Create, Sections.AI])`.
- Per-request budget check via `BudgetService.checkBudget('agent', orgId)` before model resolution (429 on exceeded).
- Old un-gated behaviour behind `NOT_SECURED` (dev-only).

### Analytics Redis cache (3J)
- `getOverview()` results cached in Redis for 60s with key `analytics:overview:{orgId}:{sha256(params)}`.
- Cache skipped when `endDate` is today (data may still arrive via Temporal workflow).
- Uses `ioRedis` from `redis.service.ts`.

### CI vulnerability scanning (3AQ)
- `.github/workflows/security-audit.yml` runs `pnpm audit --audit-level=high` on PRs and weekly.
- Fails the check if any high/critical advisory is found.

### Key security invariants
- **Outbound HTTP on user-influenced URLs goes through `safeFetch`** (`dtos/webhooks/safe.fetch.ts`):
  validate + `ssrfSafeDispatcher` + per-hop redirect re-validation. Covers webhook dispatch (1D),
  provider fetches incl. `SocialAbstract.fetch()` (1H), and watchlist probes (3N). No bare
  `fetch(userUrl)`. `SSRF_ALLOWED_PRIVATE_CIDRS` opt-in for self-hosted instances.
- **Secrets at rest encrypted via `EncryptionService`** (AES-GCM, `v2:` prefix, read-fallback) —
  integration OAuth tokens (1I), Nostr keys (3AN), other secrets (3U). `ENCRYPTION_KEY` optional,
  falls back to `JWT_SECRET`. Never plaintext.
- **JWT** pins `algorithms: ['HS256']`, new tokens carry `exp` + sliding renewal (legacy exp-less
  tokens still verify) (1E); IDs/secrets use CSPRNG (1F).
- **CSRF** on cookie-auth mutating routes (3Z); global validation rejects unknown fields (3Y);
  user-return URLs allowlisted via `INTEGRATION_RETURN_URL_ALLOWLIST` (3AB), origin-validated on the
  frontend (3AI), `postMessage` to specific origins (3AH).
- **OAuth** enforces redirect-URI matching, PKCE, scopes, token expiry/hash (3AA). **Media** multipart/
  presigned ops are org-bound via an ownership ledger with size/presign bounds (3AD).
- **Throttling effective** after the guard fix (1G): AI (3Q) + auth/public (3AC) throttles apply;
  CopilotKit `/chat` policy- and budget-gated (3AM). **Frontend**: CSP (3AF), HttpOnly cookies (3AG),
  no prod source maps (3AJ), DOMPurify on `dangerouslySetInnerHTML` (3AE).
- No secrets/PII in Sentry events (scrubber is the backstop; 3AK disables raw capture at source).
- No secrets/PII in error storage (`PostsRepository.changeState` redacts before persist, 3AL).
- No raw API response bodies in logs (all `console.log(err)` replaced with `Logger.warn(message)`, 3AK).
- `NOT_SECURED` is the universal dev-toggle: HSTS, helmet, CSRF, CopilotKit policy gate all bypass when
  set (gated for dev, never exposes JWTs in headers, 3AR).

### New env vars (v3.5.0)
- `ENCRYPTION_KEY` — optional at-rest secret encryption key (3U); falls back to `JWT_SECRET`.
- `INTEGRATION_RETURN_URL_ALLOWLIST` — comma-separated allowed partner origins for return URLs (3AB).
- `SSRF_ALLOWED_PRIVATE_CIDRS` — opt-in private-CIDR allowlist for self-hosted provider instances (1H).

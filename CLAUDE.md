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
   `OpenAIAdapter` from facade-resolved credentials; short-circuits when the org has no active
   provider (no env-`OPENAI_API_KEY` fallback — removed v3.6.3). The frontend does not even mount
   CopilotKit when AI is off, and routes the user to Settings → AI.

### Architecture
- **`AIModelProvider`** (`libraries/nestjs-libraries/src/ai/`) — single injection point,
  `(scope, orgId?)` resolution. Precedence: per-org (stub) → per-scope → global active → provider
  default. **No env-OpenAI fallback** (removed v3.6.3). Wrappers: `generateText`, `generateObject`, `imageModel`.
- **`AIProviderRegistry`** + **`AIProviderAdapter`** — 25 providers: 16 with a bespoke adapter class
  plus 9 wired through the generic `OpenAICompatibleAdapter` (implementation split, not the product
  direct-vs-hub taxonomy); each implements `createLanguageModel`,
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

### No-provider behaviour (v3.6.3)
No active AI provider for an org = AI is **off** for that org across all four surfaces
(`resolveConfigForScope` returns null; surfaces report "AI not configured"). The pre-v3.6.0
env-`OPENAI_API_KEY` fallback was **removed**: a deployment's env key must never be silently used
as a tenant's AI. The frontend does not mount CopilotKit when AI is off and routes the user to
Settings → AI (`/settings?tab=ai`) to configure a provider. **Preserve this — do not reintroduce
an env-key fallback.**

### Data model
10 Prisma models: `AIProviderConfig`, `AISystemSettings`, `AISpendLog`, `AIOrgProviderConfig`,
`AIBrandProfile`, `AIPromptTemplate`, `AISettingsAudit`, `AIMediaJob`, `AIPromptLibraryItem`,
`AIContentIndex`.

## Short-link providers (v3.8.0)

The short-link system is a pluggable, per-org configurable multi-provider system replacing the old
env-based approach.

### Architecture
- **`ShortLinkAdapter` interface** in `libraries/nestjs-libraries/src/short-linking/` — all 19
  providers implement `createShortLink`, `validateCredentials`, and `resolveDomain`.
- **19 adapters**: Bitly, TinyURL, T.LY, Short.io, Rebrandly, Dub.co, Cutt.ly, Tiny.cc, is.gd,
  v.gd, BL.INK, T2M, Linkly, Replug, Switchy, PixelMe, Sniply, Ow.ly, CleanURI.
- **`OrgShortLinkSettingsService`** — resolves the active provider config per-org per-call on every
  short-link operation. No cached/stale provider.
- **`ShortLinkService`** — `@Injectable()` with constructor DI, orchestrates resolution → delegation
  → ledger recording. Returns the original URL (passthrough) when no provider is active (non-fatal
  — never fails a publish because of missing short-link config).
- **All adapter HTTP goes through `safeFetch`** — no bare `fetch()`.
- **Credentials are encrypted at rest** in `OrgShortLinkConfig` via `EncryptionService` (AES-GCM).
  Never read `process.env` for short-link credentials. Credentials never sent to the client — API
  keys stay server-side.

### Data model
3 Prisma models: `OrgShortLinkConfig` (per-org provider config with encrypted credentials and custom
domain), `ShortLink` (generated short link ledger — original URL, short URL, provider, optional post
reference), `ShortLinkSnapshot` (daily click-count snapshot collected by the analytics sweep).

### No-provider behaviour
No active short-link provider for an org = the `ShortLinkService` returns the original URL
unmodified (passthrough). Publishes never fail due to missing short-link config. The composer's
short-link toggle is hidden when no provider is configured, and the Settings → Shortlinks tab shows
an empty state guiding the admin to configure one.

### Analytics
Daily click-count snapshots collected in the analytics sweep (`ShortLinkSnapshot`, best-effort,
never throws). Dashboard includes a **Links** tab for click-count views.

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
  existing collection sweep, capability-gated, auto-disable on probe failure (record `lastError`,
  never crash the sweep), probe via `safeFetch`.
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
- Cached for today-ending ranges too (v3.8.9) — the dashboard default never cached before, so every
  view recomputed the overview (and its potential live provider fan-out) several times per render.
- Uses `ioRedis` from `redis.service.ts`. **Never run blocking Redis commands
  (BRPOP/BLPOP/BRPOPLPUSH) on the shared `ioRedis` client** — they stall every pipelined command,
  including the per-request throttler check; use `ioRedis.duplicate()` (see `rag.service.ts` worker).

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

# Amendments

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

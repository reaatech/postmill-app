# AGENTS.md

Guidance for AI coding agents working in this repository. Postmill is a tool to schedule social
media and chat posts to 28+ channels — schedule posts, calendar view, analytics, team management,
and a media library. Posts added to the calendar enter a workflow and are published at the right
time.

> **This system is in production with many users.** Before changing anything, be sure you are not
> breaking existing users — a data/schema change may need a migration story. Prefer
> backward-compatible changes.

## Repository layout

PNPM monorepo with a single root `package.json` for dependencies. Workspaces are driven by
`pnpm --filter`.

Apps (`apps/`):
- `backend` — NestJS REST API. Kept **thin**: controllers + module wiring. Real logic lives in libraries.
- `orchestrator` — NestJS + **Temporal**. Background jobs: workflows and activities.
- `frontend` — **Next.js (App Router) + React**. Runs on port `4200`. Tailwind 3, Sentry-instrumented.
- `extension` — browser extension.
- `commands` — CLI commands.
- `sdk` — published SDK.

Libraries (`libraries/`):
- `nestjs-libraries` — the bulk of shared server logic, Prisma schema, and repositories. **Most
  backend logic belongs here**, not in `apps/backend`.
- `helpers` — shared utilities, including the `useFetch` hook.
- `react-shared-libraries` — shared React components.

Docs & plans:
- `docs/` — the maintained documentation site (features, channels, api, reference, developers,
  self-hosting, admin). **Keep it in sync with code: any new feature, endpoint, env var, schema
  model, or security invariant must be reflected here in the same release**, and bump the relevant
  page's "Verified against vX.Y.Z" note. The release-level summary also lives in `CHANGELOG.md`,
  `README.md` (fork-notice block), and `docs/CHANGES_FROM_UPSTREAM.md`.
- `dev/` — release/implementation plans (e.g. `dev/RELEASE_v3.5.0.md`). Plans here drive a release;
  reconcile code against the plan, not the other way around.

## Setup & commands

Use **pnpm only** — never npm or yarn.

```bash
pnpm install              # also runs prisma-generate via postinstall

# Develop (all apps in parallel)
pnpm run dev              # extension + orchestrator + backend + frontend
pnpm run dev:backend      # backend only
pnpm run dev:frontend     # frontend only (port 4200)
pnpm run dev:orchestrator # orchestrator only

# Build
pnpm run build            # frontend + backend + orchestrator
pnpm run build:frontend   # single app variants also exist

# Test (Vitest, per package)
pnpm run test             # helpers → nestjs-libraries → backend → orchestrator → frontend
vitest run --root apps/backend            # run one package's tests

# Database (Prisma 6.5.0)
pnpm run prisma-generate  # regenerate client after editing schema.prisma
pnpm run prisma-db-push   # push schema to the DB (see Database below)
```

- **Tests run on Vitest** (`vitest run --root <pkg>`). The root `jest.config.ts` is vestigial — do
  not add jest-style configuration.
- **Lint runs from the repo root only**, via the flat `eslint.config.mjs` (eslint 8 +
  `eslint-config-next`). There is no per-package `lint` script.

## Backend conventions (NestJS)

Pass through every layer — **no shortcuts**:

```
Controller → Service → Repository
Controller → Manager → Service → Repository   (when a manager is involved)
```

- Only repositories (`*.repository.ts` under `nestjs-libraries/src/database/prisma/<domain>/`) touch
  Prisma. Controllers/services must not call Prisma directly.
- A service should go through another domain's **service**, not reach into its repository.
- The backend app is mostly controllers + wiring that import from `nestjs-libraries`.

## Frontend conventions (Next.js App Router)

- UI components live in `apps/frontend/src/components/ui`; other components in
  `apps/frontend/src/components`. Routing/pages are in `apps/frontend/src/app`.
- **Check existing components before building a new one** to match the established design.
- **Native components only** — never install a UI component from npmjs; write it natively.

### Data fetching — SWR via `useFetch`
Always fetch with **SWR** through the `useFetch` hook from
`libraries/helpers/src/utils/custom.fetch.tsx`. Each SWR call must be its **own hook** and comply
with `react-hooks/rules-of-hooks`. **Never** add `// eslint-disable-next-line` to a hook.

```tsx
// Valid — one hook per resource
const useCommunity = () => {
  return useSWR(/* ... */);
};

// Invalid — hooks created inside a returned object (breaks rules-of-hooks)
const useCommunity = () => {
  return {
    communities: () => useSWR<CommunitiesListResponse>('communities', getCommunities),
    providers:   () => useSWR<ProvidersListResponse>('providers', getProviders),
  };
};
```

### Styling — Tailwind 3
Before writing any component, look at:
- `apps/frontend/src/app/colors.scss`
- `apps/frontend/src/app/global.scss`
- `apps/frontend/tailwind.config.cjs`

All `--color-custom*` variables are **deprecated** — do not use them.

## Database

The single schema is `libraries/nestjs-libraries/src/database/prisma/schema.prisma`, applied with
**`prisma db push --accept-data-loss`** — there are **no SQL migration files**, and the schema is the
source of truth. Because pushes can force destructive diffs against the live production DB:

- Add columns as **nullable or defaulted**; a new required column without a default breaks the push.
- Renames/drops are destructive under `db push` — provide a manual backfill / expand-contract plan.
- Run `pnpm run prisma-generate` after schema edits to keep the client in sync.

---

# Architecture notes

## Analytics

Refactored from single-channel live-fetch to a persisted multi-channel dashboard.

- **Data models**: `AnalyticsSnapshot` and `PostAnalyticsSnapshot` (Prisma) — daily snapshots
  populated by a Temporal workflow.
- **Collection worker**: the Temporal workflow in `apps/orchestrator` requires `RUN_CRON=true` to
  activate. It runs one sweep then `continueAsNew`s every 24h — **do not reintroduce an unbounded
  `while(true)` loop**.
- **Retention/rollup**: `AnalyticsActivity.pruneAndRollupSnapshots()` (per-org each sweep) rolls
  daily `AnalyticsSnapshot` rows older than ~18 months into one weekly row per
  `(integration, metric, ISO week)` — flow metrics summed, stock metrics keep the week's latest —
  and prunes `PostAnalyticsSnapshot` beyond 90 days. Tunable via `ANALYTICS_DAILY_RETENTION_DAYS` /
  `ANALYTICS_POST_RETENTION_DAYS` (read per-run; invalid values fall back to 548/90-day defaults).
- **API**: new `/analytics/v2` endpoints in `AnalyticsV2Controller` replace the legacy single-channel
  `/analytics/:integration` and `/analytics/post/:postId`.
- **Legacy fallback**: `IntegrationService.checkAnalytics()` and `PostsService.checkPostAnalytics()`
  remain as fallback paths — used by `AnalyticsService` and the public API.
- **Metric normalization**: via `PROVIDER_METRIC_MAP` in `libraries/nestjs-libraries/src/analytics/`.
- **Public API**: the legacy analytics route (`public.integrations.controller.ts:478`) is kept as-is
  for n8n/Zapier compatibility — a parallel v2 public route was added in Phase 2. **Don't change the
  legacy route's response shape.**

## Calendar & Post Detail (v3.3.0)

Two feature tracks added to `/launches`.

### Track A — Calendar reshape (frontend-heavy)
- **PostDetailModal** — opened by clicking the card body (not the edit modal). KPI header from
  `/analytics/v2/post/:postId` (with a live-fallback in `getPostDetail` for un-snapshotted posts),
  full post thread from `getPostsRecursively`, and a capability-aware comments section.
- **Settings icon** on the card hover strip opens the edit modal (previously the whole card body did).
- **Scheduled/published pill** and **card stats footer** (views/likes/comments) sourced from
  `PostAnalyticsSnapshot`.

### Track B — Social comments (backend-heavy, behind capability flags)
- **`SocialComment` / `PostCommentRead`** Prisma models for synced platform comments and per-user
  read state.
- **`ISocialMediaComments`** interface in `social.integrations.interface.ts` with optional
  `fetchComments` / `replyToComment` / `likeComment`.
- Social comments **Controller → Service → Repository** layer.
- Temporal **`CommentsActivity` + `commentsCollectionWorkflow`** for periodic sync (gated by
  `RUN_CRON=true`).

## AI Providers (v3.4.0)

The AI layer is a pluggable, admin-configurable, governed multi-provider system (replacing the old
single hardcoded OpenAI integration).

### Four AI surfaces (all re-pointed to the facade)
1. **Utility AI** (`OpenaiService`) — text/prompt/slides. Uses `AIModelProvider` for text;
   `generateImage` uses `AIModelProvider.imageModel()` and `generateVoiceFromText` uses
   `AIModelProvider.generateObject()`. See `AiMediaService` for media wrapping — image, video
   (Luma), TTS (ElevenLabs/OpenAI), STT (Deepgram/OpenAI), and upscale/bg-remove/inpaint
   (Replicate) are wired via `@reaatech/media-pipeline-mcp-*`, each gated on its configured provider.
2. **`/agents` generator** (`AgentGraphService`) — LangGraph. Resolves model per-call via
   `AIModelProvider.langchainModel()`.
3. **Mastra chat agent** (`LoadToolsService`) — function-form `model: () =>
   facade.languageModel('agent')` so provider changes apply without restarting the MCP server.
4. **CopilotKit runtime** (`copilot.controller.ts`) — `/copilot/chat` and `/copilot/agent` build
   `OpenAIAdapter` from facade-resolved credentials; short-circuits when the org has no active
   provider (no env-`OPENAI_API_KEY` fallback — removed v3.6.3). The frontend does not mount
   CopilotKit when AI is off, and routes the user to Settings → AI.

### Architecture
- **`AIModelProvider`** (`libraries/nestjs-libraries/src/ai/`) — single injection point,
  `(scope, orgId?)` resolution. Precedence: per-org (stub) → per-scope → global active → provider
  default. **No env-OpenAI fallback** (removed v3.6.3). Wrappers: `generateText`, `generateObject`, `imageModel`.
- **`AIProviderRegistry`** + **`AIProviderAdapter`** — 25 providers: 16 with a bespoke adapter class
  plus 9 wired through the generic `OpenAICompatibleAdapter` (an implementation split, distinct from
  the product direct-vs-hub taxonomy); each implements
  `createLanguageModel`, `createLangchainModel`, optional `createImageModel` /
  `createEmbeddingModel` / `createSpeechModel`.
- **Governance** (`libraries/nestjs-libraries/src/ai/governance/`): `guardrail.service.ts`,
  `budget.service.ts`, `telemetry.service.ts` (no-op when unconfigured),
  `provider-health.service.ts`, `media.service.ts` (multi-provider media pipeline —
  image/video/TTS/STT/upscale/bg-remove/inpaint via `@reaatech/media-pipeline-mcp-*`, C2PA
  provenance, cost ledger), `rag.service.ts` (real pgvector RAG; all raw SQL confined to
  `AiRagRepository` per the layering rule, HNSW ANN index, durable Redis index queue, org-scoped
  search + admin backfill), and the opt-in `semantic-cache.service.ts` / `model-router.service.ts`
  (both off by default).
- **Admin API** at `/admin/ai-settings` (super-admin gated) — provider management, test connection,
  set active, governance settings, spend log, audit log, health.
- **MCP auth** — `start.mcp.ts` enforces `@reaatech/a2a-reference-auth` scopes on all 5 entrypoints.

### No-provider behaviour (v3.6.3)
No active AI provider for an org = AI is **off** for that org across all four surfaces
(`resolveConfigForScope` returns null; surfaces report "AI not configured"). The pre-v3.6.0
env-`OPENAI_API_KEY` fallback was **removed**: a deployment's env key must never be silently used
as a tenant's AI. The frontend does not mount CopilotKit when AI is off and routes the user to
Settings → AI (`/settings?tab=ai`). **Preserve this — do not reintroduce an env-key fallback.**

### Data model
10 Prisma models in `schema.prisma`: `AIProviderConfig`, `AISystemSettings`, `AISpendLog`,
`AIOrgProviderConfig`, `AIBrandProfile`, `AIPromptTemplate`, `AISettingsAudit`, `AIMediaJob`,
`AIPromptLibraryItem`, `AIContentIndex`.

## Feature surfaces (v3.5.0)

New analytics/AI/social surfaces, all additive on existing infrastructure.

### Provider capability matrix (3P)
- **`provider-capabilities.ts`** (`integrations/social/`) is the single source of truth for what each
  provider supports — analytics, comments, first comment, polls, video, carousel, alt text, max
  media, link preview, refresh token. Exposed via `provider-capabilities.controller.ts`.
- **Composer and admin UI read the matrix** so unsupported controls are hidden/disabled
  consistently. Built early as the foundation that 2F (first comment), 3E (comments), 3F (polls),
  and 2J (preflight) all gate on — **do not reinvent ad-hoc gating; read the matrix.**

### Comment expansion + cross-channel inbox (3E/2I)
- **3E** adds `ISocialMediaComments` (`fetchComments`/`replyToComment`/`likeComment` + a
  `commentsCapabilities` override) to 8 more providers: Discord, Telegram, Slack, WordPress,
  dev.to, Hashnode, Medium, TikTok. Follow the existing `bluesky`/`facebook` provider patterns.
- **2I** builds a unified **comment inbox** (`/comments` route, nav entry in `top.menu.tsx`) over
  the existing `SocialComment`/`PostCommentRead` models — unread/assigned/status filters,
  sentiment/priority badges (from 2E), bulk mark-read, quick replies. Additive to the post-detail
  comments view.

### First comment (2F, workflow v1.0.6)
- New `post.workflow.v1.0.6.ts` auto-posts a first comment after a successful `post()` when
  `settings.firstComment` is set. **Three invariants:** capability-gated on
  `providerCapabilities.firstComment`; **idempotent** (records the posted comment id /
  `firstCommentPostedAt` so a retry or `continueAsNew` can't double-post); **non-fatal** (a failed
  first comment warns + notifies, but the post stays published — never fail/roll back the post).

### Poll posts (3F)
- Polls are part of the post payload (not a follow-up step), wired through `post()` for X and
  LinkedIn (incl. page) when `settings.poll` is set. **Validate before publish** (2-4 options,
  option length, duration) in the 2J preflight and again server-side — never publish a plain post
  when a poll was requested. Gated independently on `providerCapabilities.poll`.

### Campaign folders (3O)
- Additive `Campaign` model + **nullable** `Post.campaignId` (existing rows stay `NULL` —
  db-push-safe). Service/repo/controller + page; grouping for media/analytics/comments derives
  **transitively through the post's `campaignId`** (no FK on those tables yet for v3.5.0).

### Competitor / watchlist tracking (3N)
- New `WatchedAccount` / `WatchedAccountMetric` models (additive). Lightweight public-metric probes
  ride the **existing analytics collection sweep** (`RUN_CRON=true`), one per enabled account,
  reusing snapshot retention/rollup. **Capability-gated and graceful:** a probe failure
  (403/unsupported) auto-disables the capability (records `lastError`) and logs — it never crashes
  a sweep. Watched-account handles are user input → probe via `safeFetch` (0F).

### Bulk import (2L)
- `POST /posts/bulk` (validated row DTO) creates many posts via the **shared** post-creation logic
  (3C) + the 2J preflight, returning per-row success/warnings/errors **without failing the batch**.
  Can target a campaign (3O).

### Analytics best-time / recommendations (2G/2H)
- **2G** `GET /analytics/v2/best-time` returns structured day×hour engagement for a heatmap tab;
  shares the timing/engagement query with the composer's LLM-text `ai.best-time.tsx` (a separate
  surface — they coexist).
- **2H** `GET /analytics/v2/recommendations` turns analytics into prioritized actions
  (underperforming channels, top patterns, best-time opportunities, missing coverage, comment
  backlog), each deep-linking into the relevant view.

## Security, Observability & CI (v3.5.0)

### Sentry scrubbing
- **`beforeSend`/`beforeBreadcrumb`** in `initialize.sentry.ts` strips `Authorization`/`auth`/`cookie`/`showorg`/`impersonate` headers, `apiKey`, `pos_`/`pca_`/`pcs_` tokens, passwords, full prompt bodies, and request data from all sent events.
- **PII capture disabled**: OpenAI integration `recordInputs: false`, `recordOutputs: false`; frontend `sendDefaultPii: false`.
- **`consoleLoggingIntegration`** gated behind `allowLogs` flag; only `warn`/`error` levels when enabled.

### Helmet (main.ts)
- `helmet()` applied after CORS with HSTS (1 year, includeSubDomains, preload), `noSniff`, `referrerPolicy: strict-origin-when-cross-origin`, `frameguard: deny`, and a conservative CSP (`default-src 'self'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `connect-src 'self' https://api.github.com`, etc.).
- `NOT_SECURED` env var skips helmet entirely (dev/local).
- `crossOriginEmbedderPolicy: false` to avoid breaking CopilotKit/Swagger CDN assets.

### CopilotKit /chat gating (3AM)
- `/copilot/chat` now requires `@CheckPolicies([AuthorizationActions.Create, Sections.AI])`.
- Per-request budget check via `BudgetService.checkBudget('agent', orgId)` before model resolution — returns 429 if exceeded.
- Old un-gated behaviour behind `NOT_SECURED` (dev-only).

### Analytics Redis cache (3J)
- `getOverview()` results cached in Redis for 60s with key `analytics:overview:{orgId}:{sha256(JSON params)}`.
- Cache skipped when `endDate` is today (data may still arrive via Temporal workflow).
- Uses `ioRedis` from `redis.service.ts`.

### CI vulnerability scanning (3AQ)
- `.github/workflows/security-audit.yml` runs `pnpm audit --audit-level=high` on PRs and weekly (Sunday midnight).
- Fails the check if any high/critical advisory is found.

### Key security invariants
- **Outbound HTTP on any user-influenced URL goes through `safeFetch`** (`dtos/webhooks/safe.fetch.ts`):
  `isSafePublicHttpsUrl` validation + `ssrfSafeDispatcher` + manual per-hop redirect re-validation.
  Covers webhook dispatch (1D), provider fetches (1H, incl. `SocialAbstract.fetch()` default
  dispatcher), and watchlist probes (3N). No bare `fetch(userUrl)` — DTO validation alone doesn't
  survive DNS rebinding or 30x redirects. `SSRF_ALLOWED_PRIVATE_CIDRS` opt-in for self-hosted instances.
- **Secrets at rest are encrypted via `EncryptionService`** (AES-GCM, `v2:` prefix, expand-contract
  read-fallback) — integration OAuth tokens (1I), Nostr keys (3AN), and other at-rest secrets (3U).
  `ENCRYPTION_KEY` is optional and falls back to deriving from `JWT_SECRET`. Never store secrets plaintext.
- **JWT** verification pins `algorithms: ['HS256']`; new tokens carry `exp` with sliding renewal
  (legacy exp-less tokens still verify — no forced re-auth) (1E). IDs/secrets use CSPRNG (1F).
- **CSRF** is required on cookie-authenticated mutating routes (3Z); header/API-key clients are
  unaffected. The global validation pipe rejects unknown fields (`whitelist`+`forbidNonWhitelisted`,
  3Y) — declare new optional fields on their DTO.
- **User-return URLs are allowlisted** via `INTEGRATION_RETURN_URL_ALLOWLIST` before persist/return
  (3AB); frontend `returnUrl` uses origin validation (3AI); `postMessage` targets specific origins (3AH).
- **OAuth** flows enforce redirect-URI matching, PKCE, scopes, and token expiry/hashing (3AA).
- **Media multipart/presigned ops are org-bound** via an ownership ledger with presign + size bounds
  (3AD) — never sign/list/complete by client-supplied `key`/`uploadId` alone.
- **Throttling is effective** — `ThrottlerBehindProxyGuard` throttles by default (1G), so AI (3Q) and
  auth/public abuse throttles (3AC) actually apply. CopilotKit `/chat` is policy- and budget-gated (3AM).
- **Frontend** ships a CSP (3AF), HttpOnly auth cookies (3AG), and no production source maps (3AJ);
  `dangerouslySetInnerHTML` is DOMPurify-sanitized (3AE).
- No secrets/PII in Sentry events (scrubber is the backstop; 3AK disables raw capture at source).
- No secrets/PII in error storage (`PostsRepository.changeState` redacts before persist, 3AL).
- No raw API response bodies in logs (all `console.log(err)` replaced with `Logger.warn(message)`, 3AK).
- `NOT_SECURED` is the universal dev-toggle: HSTS, helmet, CSRF, and the CopilotKit policy gate all bypass
  when set (gated for dev use, never exposes JWTs in response headers, 3AR).

### New env vars (v3.5.0)
- `ENCRYPTION_KEY` — optional 32-byte base64/hex key for at-rest secret encryption (3U); falls back
  to deriving from `JWT_SECRET`.
- `INTEGRATION_RETURN_URL_ALLOWLIST` — comma-separated allowed partner origins for
  integration/enterprise return URLs (3AB).
- `SSRF_ALLOWED_PRIVATE_CIDRS` — opt-in admin allowlist of private CIDRs for self-hosted provider
  instances (1H).

# AGENTS.md

Guidance for AI coding agents working in this repository. Postmill is a tool to schedule social
media and chat posts to 28+ channels — schedule posts, calendar view, analytics, team management,
and a media library. Posts added to the calendar enter a workflow and are published at the right
time.

> **This system is in production with many users.** Before changing anything, be sure you are not
> breaking existing users — a data/schema change may need a migration story. Prefer
> backward-compatible changes.

## Repository layout

PNPM monorepo. Workspaces are driven by `pnpm --filter`. Dependencies are split between the root
`package.json` (shared tooling and cross-cutting packages) and per-workspace `package.json` files in
`apps/*` and `libraries/*` (feature-specific packages). Do not add a backend-only or frontend-only
package to the root manifest unless it is genuinely shared across multiple workspaces.

Apps (`apps/`):
- `backend` — NestJS REST API. Kept **thin**: controllers + module wiring. Real logic lives in libraries. Serves the Inngest handler.
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
- `docs/` — the maintained VitePress documentation site, structured as three audience-specific
  guides (`user-guide/`, `developer-docs/`, `operations-guide/`) plus a cross-cutting `reference/`
  section. **Keep it in sync with code: any new feature, endpoint, env var, schema model, or
  security invariant must be reflected here in the same release**, and bump the relevant page's
  "Verified against vX.Y.Z" note. The release-level summary also lives in `CHANGELOG.md`,
  `README.md` (fork-notice block), and `docs/reference/changes-from-upstream.md`.
- `dev/` — release/implementation plans (e.g. `dev/RELEASE_v3.5.0.md`). Plans here drive a release;
  reconcile code against the plan, not the other way around.

## Setup & commands

Use **pnpm only** — never npm or yarn.

```bash
pnpm install              # also runs prisma-generate via postinstall

# Develop (all apps in parallel)
pnpm run dev              # extension + backend + frontend
pnpm run dev:minimal      # backend + frontend only (recommended for daily dev)
pnpm run dev:backend      # backend only
pnpm run dev:frontend     # frontend only (port 4200)

# Build
pnpm run build            # frontend + backend
pnpm run build:frontend   # single app variants also exist

# Test (Vitest, per package)
pnpm run test             # helpers → nestjs-libraries → backend → frontend
vitest run --root apps/backend            # run one package's tests

# Database (Prisma 6.5.0)
pnpm run prisma-generate  # regenerate client after editing schema.prisma
pnpm run prisma-db-push   # push schema to the DB (see Database below)
```

- **Tests run on Vitest** (`vitest run --root <pkg>`). The root `jest.config.ts` is vestigial — do
  not add jest-style configuration.
- **Lint runs from the repo root only**, via the flat `eslint.config.mjs` (eslint 8 +
  `eslint-config-next`). There is no per-package `lint` script.

## Local development performance

The stack is large; use the feature flags and lightweight commands below to keep your machine
responsive. Full details are in `docs/developer-docs/local-development.md`.

### Infrastructure (Docker)

```bash
# Required services only: postgres + redis
docker compose -f docker-compose.dev.yaml up -d

# Add background jobs (Inngest dev server)
docker compose -f docker-compose.dev.yaml --profile jobs up -d

# Add pgAdmin (convenience UI)
docker compose -f docker-compose.dev.yaml --profile tools up -d
```

### Lightweight app startup

```bash
# Skip heavy optional subsystems you are not working on
DEV_DISABLE_AI=true \
DEV_DISABLE_MCP=true \
DEV_DISABLE_MEDIA=true \
DEV_DISABLE_SHORTLINKS=true \
DEV_DISABLE_EMAIL=true \
pnpm run dev:minimal
```

Available flags (all default to **enabled**):

- `DEV_DISABLE_AI` — skip AI adapter registration.
- `DEV_DISABLE_MCP` — skip Mastra/MCP/A2A server startup.
- `DEV_DISABLE_MEDIA` — skip media-generation adapter registration.
- `DEV_DISABLE_SHORTLINKS` — skip short-link adapter registration.
- `DEV_DISABLE_EMAIL` — skip email-provider adapter registration.
- `DEV_DISABLE_VIDEO` — skip video-generation adapter registration.
- `DEV_DISABLE_AGENT` — skip agent-graph services.
- `DEV_DISABLE_CRON` — skip `ScheduleModule.forRoot()`.
- `DEV_DISABLE_SENTRY` — skip Sentry initialization.
- `DEV_DISABLE_OPENTELEMETRY` — skip OpenTelemetry exporter setup.

### Frontend dev variants

- `pnpm run dev:frontend` — default Turbopack dev.
- `pnpm run dev:webpack` — webpack fallback if Turbopack exhausts memory.
- `pnpm run analyze` — generate webpack bundle report in `.next/analyze/`.
- Sentry source-map upload is disabled in dev unless `SENTRY_AUTH_TOKEN` and
  `NEXT_PUBLIC_SENTRY_DSN` are set.
- Browser profiling (`Document-Policy: js-profiling`) is disabled in dev unless
  `FRONTEND_PROFILING=1` is set.

### Backend memory cap

The backend dev script sets `--max-old-space-size=2048`. If you still hit the cap, lower it further
or disable more feature flags.

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

## Channel credentials

All channel provider credentials live exclusively in the database via `OrgProviderConfiguration`,
encrypted at rest through `EncryptionService` (AES-GCM). There is **no env var fallback** — the
`getEnvOr()` function and `ChannelEnvMigrationService` were removed in v3.7.1. Each provider
receives credentials through `clientInformation` (passed from `OrgProviderConfiguration`) or via
`getOrgCredential(orgId, identifier, key)`. Never read `process.env` for channel credentials.

AI provider credentials follow the same pattern: stored in `AIOrgProviderConfig`, encrypted at rest,
with no `OPENAI_API_KEY` or other env var fallback.

Short-link provider credentials follow the same pattern: stored in `OrgShortLinkConfig`, encrypted
at rest through `EncryptionService` (AES-GCM), with no `process.env` fallback.

---

# Architecture notes

## Background jobs (Inngest)

All scheduled/async work runs on **Inngest** (the Temporal orchestrator was removed — commit #39).
The backend serves the Inngest handler at **`/api/inngest`**; functions live in
`apps/backend/src/inngest/functions/`, with the heavier domain logic in
`libraries/nestjs-libraries/src/inngest/activities/`. **There is no `while(true)` poll loop and no
`continueAsNew`** — jobs are either cron-triggered or event-triggered, and durable steps
(`step.run`, `step.sleepUntil`) provide retries/idempotency.

- **Toggle**: events are only sent when `USE_INNGEST=true` (`isInngestEnabled()` gates every
  `inngest.send(...)`). Locally, run the Inngest dev server (`--profile jobs`) with `INNGEST_DEV=1`;
  in Cloud, set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`. See `.env.example` for the full set.
- **Event-triggered**: `post/publish` (`post-publish.ts` — sleeps until the publish date, posts,
  posts thread items as comments, then first comment / webhooks / plugins; per-`taskQueue`
  concurrency cap), `autopost/process`, `integration/refresh-token`, `email/send` (global 1/sec),
  `email/digest`, `analytics/backfill`, `streak/start`.
- **Cron-triggered**: `comments-collection.ts` (every minute — sync comments, dispatch webhooks,
  prune, notify), `analytics-collection.ts` (daily 02:00 UTC — the snapshot sweep below),
  `media-jobs-poll.ts` (every minute — poll pending media jobs + FFmpeg video renders),
  `missing-post-finder.ts` (hourly — recover posts that should have published).

## Analytics

Refactored from single-channel live-fetch to a persisted multi-channel dashboard.

- **Data models**: `AnalyticsSnapshot` and `PostAnalyticsSnapshot` (Prisma) — daily snapshots
  populated by an Inngest scheduled function.
- **Collection worker**: the Inngest function in the backend (`/api/inngest`) requires `USE_INNGEST=true`
  and valid Inngest credentials (or `INNGEST_DEV=1` locally). It runs one sweep on a daily cron —
  **do not reintroduce an unbounded `while(true)` loop**.
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
- Inngest **`comments-collection.ts` cron** (backed by `CommentsActivity`) for periodic sync — gated
  on `USE_INNGEST`. See **Background jobs (Inngest)** above.

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

## Short-link providers (v3.8.0)

The short-link system is a pluggable, per-org configurable multi-provider system replacing the old
env-based approach (Dub, Short.io, Kutt, LinkDrip).

### Architecture
- **`ShortLinkAdapter` interface** in `libraries/nestjs-libraries/src/short-linking/` — all 19
  providers implement `createShortLink`, `getClickCount`, and `healthCheck`.
- **19 adapters**: Bitly, TinyURL, T.LY, Short.io, Rebrandly, Dub.co, Cutt.ly, Tiny.cc, is.gd,
  v.gd, BL.INK, T2M, Linkly, Replug, Switchy, PixelMe, Sniply, Ow.ly, CleanURI.
- **`OrgShortLinkSettingsService`** — resolves the active provider config per-org per-call on every
  short-link operation. No cached/stale provider.
- **`ShortLinkService`** — `@Injectable()` with constructor DI, orchestrates resolution → delegation
  → ledger recording. Returns the original URL (passthrough) when no provider is active (non-fatal
  Empty behaviour — never fails a publish because of missing short-link config).
- **All adapter HTTP goes through `safeFetch`** — no bare `fetch()`. See security invariants.
- **Credentials are encrypted at rest** in `OrgShortLinkConfig` via `EncryptionService` (AES-GCM).
  Never read `process.env` for short-link credentials.
- **Credentials never sent to the client** — the provider selection UI only displays names and
  status (configured / active / inactive); API keys stay server-side.

### Data model
3 Prisma models: `OrgShortLinkConfig` (per-org provider config with encrypted credentials and custom
domain), `ShortLink` (generated short link ledger — original URL, short URL, provider, optional post
reference), `ShortLinkSnapshot` (daily click-count snapshot collected by the analytics sweep).

### No-provider behaviour
No active short-link provider for an org = the `ShortLinkService` returns the original URL
unmodified (passthrough). Publishes never fail due to missing short-link config. The composer's
short-link toggle is hidden when no provider is configured, and the Settings → Shortlinks tab shows
an empty state guiding the admin to configure one.

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

### First comment (2F)
- The `post-publish.ts` Inngest function auto-posts a first comment after a successful `post()` when
  `settings.firstComment` is set. **Three invariants:** capability-gated on
  `providerCapabilities.firstComment`; **idempotent** (records `firstCommentId` /
  `firstCommentPostedAt` back into the post's `settings` JSON so a retry can't double-post);
  **non-fatal** (a failed first comment warns + notifies, but the post stays published — never
  fail/roll back the post).

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
  ride the **existing analytics collection sweep**, one per enabled account, reusing snapshot
  retention/rollup. **Capability-gated and graceful:** a probe failure (403/unsupported) auto-disables
  the capability (records `lastError`) and logs — it never crashes a sweep. Watched-account handles
  are user input → probe via `safeFetch` (0F).

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
- Cached for today-ending ranges too (v3.8.9) — the dashboard default never cached before, so every
  view recomputed the overview (and its potential live provider fan-out) several times per render.
- Uses `ioRedis` from `redis.service.ts`. **Never run blocking Redis commands
  (BRPOP/BLPOP/BRPOPLPUSH) on the shared `ioRedis` client** — they stall every pipelined command,
  including the per-request throttler check; use `ioRedis.duplicate()` (see `rag.service.ts` worker).

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

## Identity-vs-profile split (v3.8.10)

User model keeps identity/auth columns (email, password, providerName, providerId, isSuperAdmin, activated, lastOnline, ip, agent, lastReadNotifications). Profile fields (name, lastName, bio, pictureId, timezone, notification prefs) moved to `UserProfile` (1:1). See `schema.prisma:1356-1376`.

## RBAC model (v3.8.10)

- `AppRole` — org-scoped roles (NULL org = system template). `key` is stable machine name (owner/admin/editor/member/viewer). `isSystem` = seeded, non-deletable.
- `Permission` — fine-grained `(resource, action)` catalog. 16 resources × 5 actions = 80 seeded permissions.
- `AppRolePermission` — join table linking roles to permissions.
- `OrgRbacGuard` + `@RequirePermission(resource, action)` — decorator-based gating at the controller level. Orthogonal to billing `@CheckPolicies`.

## Two orthogonal access gates

- **Billing gate** (`@CheckPolicies` + `PoliciesGuard`): "Has this org paid for this feature?" → HTTP 402.
- **RBAC gate** (`@RequirePermission` + `OrgRbacGuard`): "Is this member allowed to do this?" → HTTP 403.
- A route may carry both; they are independent.
- `User.isSuperAdmin` (platform operator) bypasses RBAC (but not billing).

## Sessions & refresh tokens (v3.8.10)

`Session` model backs refresh-token rotation: login creates a session, refresh rotates `tokenHash`, reuse of a rotated hash revokes the session, logout sets `revokedAt`. `/user/sessions` lists active devices with per-session revoke. JWT access token is unchanged (HS256, sliding renewal).

## Platform admin & auth providers (v3.8.10)

`AuthProviderConfig` stores platform-wide login provider configs (encrypted at rest). Managed in `/admin` (super-admin only). `getLoginEnv()` env vars serve as bootstrap fallback when DB has no enabled config. `LOCAL` auth is always available regardless of DB config (unless `DISABLE_REGISTRATION` is set). OIDC SSO via `Provider.GENERIC` with user-configurable endpoints.

## Shared provider-surface foundation (v3.8.10)

AI, Media, Storage, and Shortlinks settings surfaces share:
- `ProviderIcon` component (`apps/frontend/src/components/shared/provider-icon.tsx`) — brand SVG icons for all providers across all four surfaces.
- `accountFingerprint` util (`libraries/nestjs-libraries/src/utils/account-fingerprint.ts`) — stable SHA-256 fingerprint for unique-account constraints.
- `ProviderConfigDto` type (`libraries/nestjs-libraries/src/types/provider-config.types.ts`) — shared config response shape.
- `ProviderListShell` component (`apps/frontend/src/components/settings/shared/provider-list-shell.tsx`) — reusable provider-list layout.

## Dropped Gitroom subsystems (v3.8.10)

Dead marketplace/GitHub-stars models and code removed: `SocialMediaAgency`, `MessagesGroup`, `Orders`, `OrderItems`, `PayoutProblems`, `ItemUser`, `GitHub`, `Star`, `Trending`, `TrendingLog`, `Messages` + associated enums (`OrderStatus`, `From`, `APPROVED_SUBMIT_FOR_ORDER`) and their relations on `User`, `Post`, `Organization`, `Media`, `Integration`. Code-only removal in step 6, schema drops in step 7. The legacy `Role` enum and its `UserOrganization.role` column were also dropped — superseded by `AppRole`-based RBAC (`UserOrganization.roleId`).

**Legacy `/third-party` integration platform — removed.** The Gitroom-era third-party provider
subsystem (the `/third-party` route, `@ThirdParty` decorator + `ThirdPartyManager`, the HeyGen and
ReelFarm providers, and the composer's "insert third-party media" path) was deleted, along with the
`ThirdParty` Prisma model + its `Organization.thirdParty` relation. AI avatar video now lives only in
the modern **HeyGen Studio** (above).

## Media surface, Stock & Content Packs (v3.8.10+)

### `/media` vs `/files`
- **`/files` is the asset library** — uploads plus anything a tool saved out. It is both the input
  source and the output destination for the tools.
- **`/media` is tools only** (no library inside it). Each tool: pick/produce media → **save to
  `/files`** (or send straight to the composer). The nav lives in
  `apps/frontend/src/app/(app)/(site)/media/layout.tsx`, grouped (alphabetised within each section):
  - **Platform** — Designer (header-less; the default landing for `/media`).
  - **Providers** — HeyGen, Kling, Luma, MiniMax, Replicate, Runway.
  - **Content Pack** — Stock Photos, Stock Videos, Vectors, Stickers, Stock Audio, Icons.

### Designer (Konva)
- The Designer (`apps/frontend/src/components/media-tools/designer/`) is **Konva/react-konva**, not
  Polotno (fully removed). Two modes: a **static canvas** (images/text/shapes) and a **video
  timeline** (`video-timeline.tsx` — video/image/text/caption/audio/sticker tracks, canvas-decoded
  audio waveforms; renders via headless Chromium + FFmpeg).
- Opens from a single asset (`?url=&type=&w=&h=…`) or a bulk handoff (Files → bulk **Open all in
  Designer**, which stashes the selection in `sessionStorage` and navigates to `?bulk=1`). Animated
  GIF/WebP export only exists in **video** mode — static mode never offers it (Konva flattens to
  frame 1).

### Canvas-app (studio) UI conventions
A **studio** is a full-height `/media/*` canvas tool (Designer, Replicate, HeyGen — more coming).
They share a deliberate visual language; **follow it when building a new one** rather than inventing
per-tool styling. Reference implementation: `apps/frontend/src/components/media-tools/heygen/heygen-studio.tsx`.

- **Shell:** a full-height flex column. Header bar (`h-[52px]`, `border-b border-studioBorder`) with —
  left: the Postmill **`Logo`** (`components/new-layout/logo.tsx`, `size={20–22}`) + the studio title;
  right: tool tabs + a **`FullscreenButton`**. Body below fills the rest.
- **Theme tokens (light + dark, defined in `app/colors.scss`, mapped in `tailwind.config.cjs`):**
  - `bg-studioBg` — the studio backdrop. Light `#d4e0f0` (soft blue-gray), dark `#0a0f1f` (near-black navy).
  - `border-studioBorder` — **use this for every studio border** (cards, inputs, tabs, dividers). Light
    `#aebdd4`, dark `#2a3450`. It is tuned to contrast with `studioBg` in both modes.
  - **Do not** use `newBorder`/`newColColor` for studio borders — they are near-white in light mode
    (`#eaecee`/`#eff1f3`) and vanish on `studioBg` ("whitewashed"). `newSep` is also too close to the bg.
  - Accent is `#2B5CD3` (a.k.a. `designerAccent`); active item = `bg-[#2B5CD3]/20 text-textColor`.
- **Light-mode contrast rules (this codebase is dark-mode-first — these break in light otherwise):**
  - Never hard-code `text-white` for active/selected state or titles; use **`text-textColor`** (adapts).
    `text-white` is only for text on a solid accent fill (e.g. a `bg-[#2B5CD3]` button).
  - Warning/validation text uses **`text-amber-600`**, not `text-yellow-400` (pale and unreadable on light).
- **Rounded corners:** when **not** full-screen, the studio root is `rounded-[12px] overflow-hidden`
  (matches the app layout/menu card radius). Full-screen drops the radius (full-bleed).
- **Full-screen = the canvas, not the page.** Use the shared `useFullscreen()` hook
  (`media-tools/use-fullscreen.ts`) + `FullscreenButton`. It requests fullscreen on
  `document.documentElement` (hides browser chrome **and** keeps modals, which mount at the app root,
  visible) and the studio root goes immersive — `fixed inset-0 z-[100]` — to cover the app nav/sidebar
  so the canvas fills the screen. **`z-[100]` is deliberate: above app chrome, below modals (`z 200+`).**
  Never element-scope the Fullscreen API to the studio root — modals would be hidden by the top-layer.
- **Input + output:** pick source assets from `/files` via **`MediaSelectorModal`** (returns
  `{source,url,fileId,type,…}`). Long-running generation goes through the **media-job pipeline**
  (`MediaJobLifecycleService.createPendingJob` → poll/webhook → land in `/files`); a live **render
  queue** polls the jobs endpoint. Finished artifacts offer **Edit in Designer** (`/media/designer?url=&type=`)
  and **Post** (composer `AddEditModal` with `onlyValues:[{image:[{id,path}]}]`). Reuse
  **`SaveToFilesModal`** and the **`AudioPlayer`** (`media-tools/audio-player.tsx`) rather than rebuilding.
- **SWR:** one hook per resource via `useFetch` (e.g. `use-heygen.ts`); the render queue uses a
  `refreshInterval` that polls only while a job is pending.

### HeyGen Studio (AI avatar video)
- A bespoke tool at **`/media/heygen`** built on the **AI Media provider** stack (`HeyGenAdapter`,
  per-org `MediaProviderConfig` `'heygen'`, `AIMediaJob` async spine) — **not** the legacy
  `/third-party` HeyGen (that whole Gitroom-era subsystem was removed; see below). Configure the key
  at **Settings → Media** (no env fallback). Frontend lives in
  `apps/frontend/src/components/media-tools/heygen/`; logic in
  `libraries/nestjs-libraries/src/media/heygen/heygen.service.ts` (controller `/media/heygen`).
- Four tabs + a live **Render queue** (polls `GET /media/heygen/jobs`): **Storyboard** (multi-scene
  avatar video via `video_inputs[]` — each scene = avatar + voice + script + color/file background),
  **Talking Photo** (upload a `/files` image → `talking_photo_id`), **Voiceover** (TTS → audio
  folder), **Translate** (one `AIMediaJob` per target language; source must be a HeyGen-reachable URL).
- Every render lands in `/files` via the existing `MediaJobLifecycleService` → cron/webhook pipeline,
  then offers **Edit in Designer** (`?url=&type=video`) and **Post** (composer `AddEditModal`).
- **Operation-namespaced poll routing:** `HeyGenService` stores the provider ref as `<op>:<id>`
  (`video:` / `tts:` / `translate:`); `HeyGenAdapter.pollJob` branches on the prefix to hit the right
  HeyGen status endpoint. A bare id (no prefix) = avatar video — preserves the generic
  governance/grid path, which stores the raw id.

### Studio Kit (descriptor-driven provider studios)
A reusable scaffold so a new provider studio is mostly a **descriptor**, not a from-scratch build.
It extracts HeyGen's shell + the three handoffs and generalizes Replicate's form engine into a
provider-neutral package: `apps/frontend/src/components/media-tools/studio-kit/`
(`studio-shell.tsx`, `studio-form.tsx`, `render-queue.tsx`, `types.ts`, `hooks.ts`). A studio =
`<StudioShell descriptor={...} />`.
- **Descriptor** (`StudioDescriptor`): `{ provider, title, tabs[] }`. Each tab has an `operation`
  (`video`/`image`/`audio` → backend routing + Designer handoff type), an optional fixed `model` (or a
  `select` field named `model`), and `fields[]`. Field types: `prompt`/`text`/`select`/`number`/
  `toggle`/`media`. **Field names are the provider's native API params** — they ride straight into the
  adapter request body, so the descriptor IS the full feature surface (no lowest-common-denominator
  cap). A tab may instead supply a `custom` React component (escape hatch for HeyGen-style structured
  tools).
- **Generic backend** — one endpoint serves every simple "prompt → job" provider (no per-provider
  controller): `GET /media/studio/:provider/status`, `GET /media/studio/:provider/jobs`,
  `POST /media/studio/:provider/generate` (`MediaStudioController` →
  `libraries/nestjs-libraries/src/media/studio/media-studio.service.ts`). It resolves credentials,
  creates the `AIMediaJob`, dispatches to the registry adapter by `operation`, and tracks completion
  through the shared `MediaJobLifecycleService` (**webhook-first**, poll-cron fallback). `mediaInputs`
  (`field → fileId`) is resolved server-side to a provider-reachable URL (handles local storage).
  **Keep it dumb — no `if (provider === …)`; every provider difference lives in its adapter +
  descriptor.**
- **Current studios on the kit:**
  - **Video** — Runway, Luma, MiniMax, Kling (via the `fal` adapter), Vertex (Google **Veo**).
  - **Image** — Black Forest Labs (FLUX), Stability AI (Stable Image core/ultra/sd3), OpenAI
    (gpt-image-1 + DALL·E 3 as two fixed-model tabs), Vertex (Google **Imagen**, a second tab on the
    Vertex studio). `operation: 'image'` completes **synchronously**
    inside `MediaStudioService.generate` (the adapter returns the artifact inline / via its own
    bounded poll — no webhook), and base64 `data:` URLs are decoded by `completeJob`.
  - **Audio (TTS)** — ElevenLabs, OpenAI (a third `Text → Speech` tab on the OpenAI studio).
    `operation: 'audio'` also completes **synchronously**: the adapter returns the voiced clip inline
    as a `data:audio/…;base64,` URL (mime derived from the chosen `response_format`), decoded by
    `completeJob` into the org's audio files — no webhook.
  - **Avatar / character video** — D-ID (talking-head from a portrait), Hedra (character video from a
    keyframe), Tavus (replica video). `operation: 'video'`, completed **webhook-first** (poll-cron
    fallback). The portrait/keyframe media field is resolved server-side to a provider-reachable URL
    (same LOCAL-storage caveat as HeyGen translate). These overlap HeyGen's avatar surface by design —
    HeyGen keeps its bespoke studio.
  - Each is a `media-tools/<provider>/descriptor.ts` + a 3-line studio + a route page. Adapters merge
  `options.input` into the provider body (fal already did; Runway/Luma/MiniMax, the three image
  adapters, and the audio/avatar adapters — ElevenLabs/OpenAI TTS + D-ID/Hedra/Tavus — enriched with
  native param passthrough; `model` is lifted out by the service and selects the endpoint/variant,
  everything else in `input` rides into the body). The passthrough is back-compatible: when `input`
  is absent the legacy `AiMediaService` defaults apply unchanged. **Vertex (Veo video + Imagen
  image)** uses GCP credentials, **not** a single API key: the `vertex-media.adapter.ts` declares a
  `credentialFields` schema (`project` + `location` + service-account `googleCredentials` JSON, same
  keys as the AI Vertex adapter) and mints a **short-lived access token per call** via
  `google-auth-library` — a stored static `accessToken` would expire in ~1h. The Settings → Media
  modal renders `adapter.credentialFields` dynamically (multi-field), falling back to the single
  `apiKey` input for every other provider. Veo has no completion webhook → it relies on the
  `media-jobs-poll` cron (like Runway). **Deepgram is a bespoke studio, not a kit studio** — its real
  capability is STT (text output), which doesn't fit the kit's "prompt → media artifact in `/files`"
  model, so it uses the StudioShell chrome with a `custom` panel over a dedicated `/media/deepgram`
  backend (see **Deepgram Studio** below). HeyGen and Replicate are also intentionally **not**
  retrofitted onto the kit (they keep their bespoke implementations).

### Deepgram Studio (transcription / captions)
- A bespoke tool at **`/media/deepgram`** — every media adapter now has a studio. It reuses the
  Studio Kit's `StudioShell` (header/tabs/fullscreen/render-queue chrome) via a single `custom` tab
  (`media-tools/deepgram/deepgram-panel.tsx`), because STT returns **text**, not a `/files` artifact,
  so it can't ride the generic kit form/`MediaStudioService` job pipeline. Configure the key at
  **Settings → Media** (no env fallback); the unconfigured state shows the shell's "isn't configured"
  empty state.
- **Backend** is a dedicated `DeepgramController` (`/media/deepgram`) → `DeepgramService`
  (`libraries/nestjs-libraries/src/media/deepgram/deepgram.service.ts`), **not** the generic studio
  service. It reads the source file's **bytes directly from storage** (`IStorageAdapter.readFile` —
  works for local + cloud, no outbound HTTP/SSRF surface), calls the `deepgram` registry adapter's
  `speechToTextWords`, and returns `{ text, words, segments }` (segments are phrase-chunked for
  captions). `POST /transcribe` (gated on the org's Deepgram key) and `POST /save-transcript`
  (persists the transcript as a text document via `MediaJobLifecycleService.storeTranscript`, which
  bypasses the `/files` import content-type allowlist).
- The panel exports captions **client-side** — `.srt` / `.vtt` / `.txt` Blob downloads (no `/files`
  write, so no allowlist change), plus copy, Save-to-Files, and a Send-to-composer handoff
  (`AddEditModal` with the transcript as content). The adapter's `speechToTextWords` gained an
  **opt-in** `input.smartFormat` (→ `smart_format`+`punctuate`) and `input.language` passthrough; the
  Designer timeline's existing auto-caption call passes neither, so its request is unchanged.

### Stock providers (free)
`StockMediaService` (`libraries/nestjs-libraries/src/media/stock/`), exposed via
`GET /media/stock/{photos|videos|vectors|stickers|icons|audio}`. Each capability is backed by one
free provider, keyed by env (results carry `source`/`license`/`attribution` through preview, Designer
open, and `/files/import`):

| Capability | Provider | Env key |
|---|---|---|
| Photos | Unsplash | `UNSPLASH_ACCESS_KEY` |
| Videos | Pexels | `PEXELS_API_KEY` |
| Vectors / illustrations | Pixabay | `PIXABAY_API_KEY` |
| Stickers | GIPHY | `GIPHY_API_KEY` |
| Audio | Jamendo | `JAMENDO_CLIENT_ID` |
| Icons | Iconify | *(public API — no key)* |

Redis caches free stock search results globally for 60s (incl. negative-cache for missing-key /
empty configs).

### Content Packs (premium, BYOK)
- Per-org packs configured at **Settings → Content Packs**, resolved per-org-per-capability by
  `OrgContentPackSettingsService` (`database/prisma/content-packs/`). Backed by `ContentPackConfig`
  (encrypted credentials + provider `extraConfig`) and a pointer `Organization.activeContentPackIdentifier`.
- **Magnific** is the first pack (photos, vectors, icons, videos). When a pack is active it takes
  precedence over the matching free catalog for that capability; saving uses a **mint-then-ingest**
  step (`resolveMagnificDownload` resolves a licensed URL before `/files/import`). Credentials are
  encrypted at rest and never returned to the client.

### Saving into `/files`
- All saves go through **`POST /files/import`** → `FileService.importFromUrl`
  (`database/prisma/file/file.service.ts`): `safeFetch` the URL, enforce a 512 MB cap, validate the
  **real** content-type against an allowlist (image/* + `video/mp4` + audio mp3/mp4/wav/ogg),
  sniffing bytes via the `file-type.compat` shim when a source mislabels the MIME (e.g. Jamendo
  serves an MP3 as `text/html`). Stores `source`/`attribution` in file metadata.
- Shared frontend pieces under `apps/frontend/src/components/`: a native canvas **audio player**
  (`media-tools/audio-player.tsx`, lazy waveform decode, one-at-a-time playback — used in stock
  audio, Files grid/details, and the file preview modal), the **Save to Files** modal
  (`media-tools/save-to-files-modal.tsx`, with an `allowPost` flag), the stock **preview modal**, and
  the Files **preview modal** (`files/file-preview-modal.tsx`).

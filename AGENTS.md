# AGENTS.md

Guidance for AI coding agents working in this repository. Postiz is a tool to schedule social
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
   `OpenAIAdapter` from facade-resolved credentials; env guard short-circuits only when neither admin
   config nor `OPENAI_API_KEY` exists.

### Architecture
- **`AIModelProvider`** (`libraries/nestjs-libraries/src/ai/`) — single injection point,
  `(scope, orgId?)` resolution. Precedence: per-org (stub) → per-scope → global active → provider
  default → env-OpenAI fallback. Wrappers: `generateText`, `generateObject`, `imageModel`.
- **`AIProviderRegistry`** + **`AIProviderAdapter`** — 12 distinct adapters plus a generic
  `OpenAICompatibleAdapter` registered for 14 hub providers; each implements
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

### Backward compatibility
No admin AI config = byte-for-byte today's `OPENAI_API_KEY` behaviour. `activeProvider = null`
reverts all four surfaces to the env-OpenAI path. **Preserve this invariant.**

### Data model
10 Prisma models in `schema.prisma`: `AIProviderConfig`, `AISystemSettings`, `AISpendLog`,
`AIOrgProviderConfig`, `AIBrandProfile`, `AIPromptTemplate`, `AISettingsAudit`, `AIMediaJob`,
`AIPromptLibraryItem`, `AIContentIndex`.

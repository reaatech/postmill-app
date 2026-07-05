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

## Unified provider framework (v4.0.0)

All provider domains (AI, Media, Storage, Short-link, Social, VPN, Content Packs, Email, Auth)
resolve through a single **`ProviderKernel`** (`libraries/providers/kernel`).

- **Package-per-provider:** every provider is a workspace package under `libraries/providers/<id>`;
  each version is an internal module (`src/v1`, `src/v2`, …). The kernel registers them by
  `(domain, providerId, version)`.
- **Identity triple:** a provider is addressed as `domain/providerId@version` (e.g. `ai/openai@v1`).
  Config and ledger rows pin the version at write time (`version` columns on every provider table).
- **Resolution:** domain services use `ProviderResolutionService`
  (`libraries/nestjs-libraries/src/providers/provider-resolution.service.ts`). It resolves the
  kernel module — the kernel is the **sole** resolution path; the legacy in-memory registries and the
  `PROVIDER_KERNEL=legacy` kill switch have been removed.
- **Catalog & health:** `GET /providers/catalog?domain=` returns the provider catalog (**requires
  auth** — it sits in the authenticated group behind `AuthMiddleware`/`CsrfMiddleware`, and an
  unknown `?domain=` returns **400**); `GET /admin/providers/health?domain=` (super-admin) returns
  per-version health counters.
- **Stock providers** (free, env-keyed) are intentionally outside the versioning framework.

See `docs/developer-docs/provider-framework.md` for the full playbook and
`docs/reference/provider-versions.md` for the catalog.

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
- **Sanctioned exception:** seeders/migration steps under `database/seeds/**` — notably
  `BackfillService` and `RbacSeeder` — intentionally use `PrismaService` + `$transaction` directly
  (cross-table backfills/seeds), and are exempt from the repository-only rule by design.
- **Sanctioned exception (cross-domain leaf-reads):** a service may read another domain's
  **repository** directly where the owning service depends back on the caller, so routing "up"
  through the service would create a Nest DI cycle. These are deliberate, behaviour-neutral
  leaf-reads — keep them and do **not** "fix" them into a service call: `PostsService` →
  `AnalyticsRepository` / `CampaignsRepository` (the analytics/campaigns services depend on
  `PostsService`), and `OrgMediaProviderSettingsService` → `@Optional() OrgAiSettingsRepository` (the
  Qwen/Google universal-credential read; `OrgAiSettingsService` depends on this package's
  `ProviderCredentialLinkService`). Each carries a `// layering: sanctioned leaf-read` comment at the
  call site.

## Frontend conventions (Next.js App Router)

- UI components live in `apps/frontend/src/components/ui`; other components in
  `apps/frontend/src/components`. Routing/pages are in `apps/frontend/src/app`.
- **Check existing components before building a new one** to match the established design.

### Component / design-system policy

The real policy (reconciled with what's installed — the older "native components only, never install a
UI component from npmjs" rule was aspirational and contradicted by reality):

- **Default to the shared bespoke primitives.** They are the canonical building blocks — use them
  rather than re-rolling or pulling a new npm widget:
  - **Button** → `Button` from `@gitroom/react/form/button` (~70 call sites). Native, supports
    `secondary`/`danger`/`loading`.
  - **Input / form fields** → `Input` from `@gitroom/react/form/input` (~40 call sites). Native,
    `react-hook-form`-integrated.
  - **Modals** → the bespoke `useModals()` / `ModalManager` from
    `@gitroom/frontend/components/layout/new-modal` (~80 call sites). This — **not** `@mantine/modals`
    — is the canonical modal system; `@mantine/modals` is a vestigial dependency that is no longer
    imported in `src/` (tracked follow-up: drop the unused dep).
- **Mantine is the sanctioned base for the few primitives where bespoke would be wasteful**, and stays:
  `@mantine/core` (e.g. `Autocomplete` — 2 files), `@mantine/dates` (the date picker — 1 file), and
  `@mantine/hooks` (utility hooks like `useClickOutside` — a handful of files). Reach for an existing
  Mantine primitive before hand-rolling one of these; do **not** rip Mantine out.
- **Write bespoke (native) only when no shared or Mantine primitive fits.** Match the design tokens
  (`colors.scss` / `tailwind.config.cjs`); don't introduce a new npm UI kit (shadcn, MUI, Chakra, etc.).
- **Deprecate ad-hoc duplicates.** Don't add a new one-off button/input/modal that overlaps the
  canonical ones — consolidate onto them. (Larger de-duplication of existing one-offs is a tracked
  follow-up.)

### Error boundaries

- App Router segment boundaries: each main route group ships `error.tsx` + `not-found.tsx`
  (`(app)`, `(app)/(site)`, `(app)/(site)/media`, `(provider)`), rendering the shared
  `RouteError` / `RouteNotFound` (`components/errors/`). `error.tsx` is a `'use client'` component
  receiving `{ error, reset }`.
- The `/media/*` canvas studios (Designer, HeyGen, Replicate, Deepgram, every Studio Kit `StudioShell`)
  are wrapped at the **media layout** level in `StudioErrorBoundary`
  (`components/media-tools/studio-error-boundary.tsx`) so a studio crash shows a themed fallback with a
  reset instead of a blank screen. Reuse this pattern (mirrors the analytics-v2 `ErrorBoundary`) for
  new canvas tools rather than adding ad-hoc try/catch.

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

The schema is authored in `libraries/nestjs-libraries/src/database/prisma/schema.prisma`, and changes
are applied through **committed Prisma migrations** (`migrations/` next to the schema, starting from
the `0_init` baseline). The canonical apply path is **`prisma migrate deploy`** — what CI, the backend
boot (`pm2-run`), and production use; `db push` is **local-prototyping/reset only** (a quick scratch
diff that produces no migration — never the apply path for a shared/production DB). Because migrations
still run against the live production DB:

- Add columns as **nullable or defaulted**; a new required column without a default breaks the apply.
- Renames/drops are destructive — provide a manual backfill / expand-contract plan (contract step in a
  later migration).
- Run `pnpm run prisma-generate` after schema edits to keep the client in sync (`migrate dev` does
  this for you).

**Schema-change workflow:** edit schema → `pnpm run prisma-migrate-dev` (authors + commits the
migration under `migrations/`) → `pnpm run prisma-schema-diff` (forward SQL under `dev/schema-changes/`
for review) → `pnpm run prisma-schema-check` (destructive guard) → apply elsewhere via
`pnpm run prisma-migrate-deploy`. Destructive changes (`DROP`, in-place rename, new required column)
need an expand/contract plan and an explicit `ALLOW_DESTRUCTIVE_SCHEMA=true` to pass the guard.
**CI drift gate (`test.yml`):** `migrate deploy` applies the committed migrations to an empty CI DB,
then `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel <schema> --exit-code` must
exit 0 — a schema edit committed **without** a matching migration fails the job; CI also re-runs the
destructive guard against `origin/main`. To onboard a DB created before migrations, baseline it once
with `pnpm run prisma-migrate-resolve --applied 0_init`. Rolling back is forward-only — author a new
contract/down migration (see `docs/operations-guide/schema-rollback.md`). For a quick local reset use
`pnpm run prisma-db-push` / `pnpm run prisma-reset` (`db push --accept-data-loss` / `--force-reset`).
Connection-pool size is env-tunable via `DATABASE_CONNECTION_LIMIT` / `DATABASE_POOL_TIMEOUT` (unset =
default behaviour, byte-for-byte). Full details in `docs/developer-docs/database.md`.

---

## Channel credentials

Channel (social) OAuth-app credentials resolve along **two paths**, "click-connect primary, keys as
fallback":

1. **Per-org `OrgProviderConfiguration`** (Settings → Channels) — named credential sets, encrypted at
   rest through `EncryptionService` (AES-GCM). This is the **override**: when an org has its own app
   for a provider it always wins.
2. **Platform OAuth app from deployment env** (`channel-env-credentials.ts`) — when the operator sets
   a provider's app keys in the environment, every org gets one-click "Connect" with no key entry.
   Resolution is **live, per-request, presence-based, and never persisted to a tenant row** (unlike
   the pre-v3.7.1 `ChannelEnvMigrationService`, which seeded env into the DB and was removed). If the
   env var is unset, behaviour is per-org-only — no change.

Resolution funnels through `IntegrationManager.getClientInformation(integration, orgId, configId?)`:
explicit `configId` → org-by-id; else org primary config; else **env platform app**
(`getEnvClientInfo`); else (no org context) global `ProviderConfiguration` → env. The add-channel
list and `isEnabled`/`getSocialIntegration` gates union `getEnvEnabledIdentifiers()` so env-backed
providers always stay connectable. This restores a deliberately-removed (v3.7.1) env path **for
channels only** — the operator owns the OAuth apps, which is the normal multi-tenant social model.

AI provider credentials do **not** follow this: stored in `AIOrgProviderConfig`, encrypted at rest,
with **no** `OPENAI_API_KEY` or other env var fallback (a deployment's AI key must never be silently
billed/leaked as a tenant's — preserve this).

Short-link provider credentials follow the same pattern: stored in `OrgShortLinkConfig`, encrypted
at rest through `EncryptionService` (AES-GCM), with no `process.env` fallback.

### Per-channel VPN egress

A channel config (`OrgProviderConfiguration`) can opt into routing **all of its outbound posting
requests through a VPN region's proxy**. Stored as the non-secret `vpnSelection` JSON column
(`{ enabled, identifier, regionId }`); selectable only from the org's **enabled** VPN provider×region
combinations. VPN providers (`OrgVpnConfig`, encrypted creds, Settings → VPN) that expose a public
proxy declare a `proxyRegions` catalog + `resolveProxyAuth` on their adapter; the org enables a subset
of regions (`OrgVpnConfig.regions` JSON). Only **SOCKS5 / HTTP-CONNECT** providers route — WireGuard/
OpenVPN tunnels are out of scope (can't be applied per-request in Node).

Routing chokepoint: `PostActivity.postSocial` resolves the selection → `VpnDispatcherService.get`
(pooled undici dispatcher: SOCKS5 via `socks`, HTTP-CONNECT via undici `ProxyAgent`) → wraps the
provider's `post()` in `runWithVpnDispatcher` (AsyncLocalStorage, because providers are singletons).
`SocialAbstract.fetch()` reads `getVpnDispatcher()` and uses it in place of `ssrfSafeDispatcher`.
**SSRF posture when proxied:** the proxy host is validated public, the proxy-connect leg keeps the
private-IP DNS pin, and the destination is re-checked `isSafePublicHttpsUrl` before dispatch.
Dispatchers are keyed by `(org, provider, region, creds-fingerprint)` and invalidated on any VPN
config change. **Known gap:** providers that bypass `this.fetch()` (raw `fetch`/`axios` — Medium,
parts of LinkedIn auth, Bluesky) are not proxied.

VPN adapters expose regions one of two ways: a **static `proxyRegions`** catalog (consumer VPNs the
user ticks region-by-region), or **dynamic `resolveRegions(config)`** that derives the region(s) from
the org's own stored config — used by the generic **`custom`** ("Custom VPN / Proxy") adapter where
the user supplies their own host/port/protocol/auth (e.g. an office proxy). Dynamic providers have a
single derived region, auto-enabled (no per-region toggle; UI hides the checklist via
`isDynamicRegions`). The custom proxy host is still SSRF-validated — private addresses need
`SSRF_ALLOWED_PRIVATE_CIDRS` on a self-hosted instance.

---

## Unified provider framework (v4.0.0)

All provider domains — AI, Media, Storage, Short-link, Social, VPN, Content Packs, Email, and Auth —
resolve through a single **`ProviderKernel`** (`libraries/providers/kernel`) with one workspace
package per provider (`libraries/providers/<id>`).

- A provider is addressed as `domain/providerId@version` (e.g. `ai/openai@v1`).
- Every config/ledger row carries a non-null `version` column and keeps using that version until an
  explicit upgrade. New `v2` adapters cannot silently change existing behavior.
- Version lifecycle statuses: `preview → active → deprecated → retired`. Deprecated versions reject
  new writes; retired versions return `410 Gone`.
- Runtime resolution goes through `ProviderResolutionService`
  (`libraries/nestjs-libraries/src/providers/provider-resolution.service.ts`). The kernel is the
  **sole** resolution path; the legacy in-memory registries and the `PROVIDER_KERNEL=legacy` kill
  switch have been removed.
- Telemetry: every resolved capability is wrapped so that provider calls log a `keyString` and feed
  per-version health counters in the kernel.
- API: `GET /providers/catalog?domain=` returns the live catalog (**authenticated** — no longer
  anonymous; unknown `?domain=` returns **400**); `GET /admin/providers/health?domain=`
  (super-admin) returns health counters.
- Free stock providers (Unsplash, Pexels, Pixabay, GIPHY, Jamendo, Iconify) are intentionally
  excluded from versioning — they have no stored config row.
- Email/Auth resolve through the kernel like every other domain; their former legacy registries have
  been removed along with the kill switch.

See `docs/developer-docs/provider-framework.md` and `docs/reference/provider-versions.md`.

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
  `email/digest`, `analytics/backfill`, `streak/start`, `media/render` (`media-render.ts` — local
  video renders: Designer timeline + clip-merge, `concurrency.limit = VIDEO_RENDER_CONCURRENCY`
  (default 3), each optionally in a resource-capped Podman container — see **Video rendering** below).
- **Cron-triggered**: `comments-collection.ts` (every minute — sync comments, dispatch webhooks,
  prune, notify), `analytics-collection.ts` (daily 02:00 UTC — the snapshot sweep below),
  `media-jobs-poll.ts` (every minute — poll pending external media jobs; **re-enqueues** stuck
  local renders to `media/render`, no longer renders inline),
  `missing-post-finder.ts` (hourly — recover posts that should have published).

## Video rendering (queue + Podman workers)

Local video compute — the Designer timeline render (headless Chromium + FFmpeg) and the clip-merge
(FFmpeg) — is queued through the `media/render` Inngest function and capped to
`VIDEO_RENDER_CONCURRENCY` (default 3). With `VIDEO_RENDER_PODMAN_ENABLED=true`, each render runs in
a `postmill-render` Podman container (the backend shells out to the local `podman` CLI); all render
containers join **one pod** whose cgroup caps the **aggregate** `VIDEO_RENDER_CPUS`/`VIDEO_RENDER_MEMORY`
across all of them (a lone render may burst to the whole pool). Storage/clip resolution stays
host-side (no creds in the container); the worker is the app build + distro Chromium/FFmpeg with
`media-render-worker.ts` as ENTRYPOINT (reads `/work/job.json` → writes `/work/out`). Podman is
**opt-in**; off (default) = the existing in-process renderer (dev/CI + graceful degradation), with
the 3-concurrent cap still applied via a host semaphore when `USE_INNGEST` is off. Requires cgroup v2
for the aggregate pool (else a logged per-container even-split fallback). See
`docs/operations-guide/video-rendering.md`.

## Notifications (V2)

`NotificationService` (`libraries/nestjs-libraries/src/database/prisma/notifications/`) is the
**single chokepoint** for every user-facing email + in-app/push notification. **Do not call
`EmailService` directly** from feature code — the only exceptions are `digest.activity.ts` (the
daily/weekly digest flush) and the `email/send` Inngest relay.

- **Two dispatch modes.** `notify({ orgId, category, ... })` fans out to org members and is gated by
  each member's per-category, per-channel preferences (with digest routing). `sendEmail(to, subject,
  html, replyTo?)` is the **always-on transactional** path for single/arbitrary recipients
  (activation, password reset, team invite, billing-cancel) — no preference gate, no in-app row.
- **Eight categories**, derived from real triggers, each toggleable per channel (email/push/in-app)
  at `/user/me` → Notifications: `post_published`, `post_failed`, `channels`, `comments`, `budget`,
  `media`, `announcements`, `streak`. The set is hardcoded in three lockstep places — the DTO
  (`dtos/notifications/notification-preference.dto.ts`: union + `NOTIFICATION_CATEGORIES` +
  `NotificationPreferenceCategoriesDto`, whose `whitelist`/`forbidNonWhitelisted` requires the
  frontend to send exactly these keys), `DEFAULT_CATEGORY_TOGGLES`
  (`notification-preference.service.ts`), and the frontend panel
  (`settings/notifications/notification-preferences.panel.tsx`).
- **No schema migration to change the set.** Categories persist as plain `String`/JSON columns;
  `ensureDefaults` writes explicit defaults and `toData()` backfills new keys / drops orphaned ones
  on read, so renames/adds are code-only (the Prisma `@default` JSON is cosmetic). `_channelEnabled`
  tolerates an unknown category (gates on the master channel only) so stale strings never throw.
- **Admin broadcast** (`/admin/notifications/broadcast`, `notifications:manage`) sends category
  `announcements` with `override: true`. The **bell** (`components/notifications/notification.component.tsx`)
  reads the V2 `/notifications` routes and renders `type` opaquely.

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

## AI Model Defaults & Media Defaults

Default model resolution is now **per-organization and category-driven** instead of the legacy
scope/model hardcoding.

- **Model categories (AI):** `low-reasoning`, `high-reasoning`, `vision`, `workflow`. The legacy AI
  scopes `utility`, `generator`, `agent`, `mcp` map to these categories (`utility` → `low-reasoning`;
  the rest → `high-reasoning`). `reasoning:true` now resolves the `high-reasoning` category.
- **Media categories (Content):** 16 categories covering image, video, audio, and slide/caption
  operations (e.g. `text-to-image`, `text-to-video`, `image-upscale`, `video-caption`). Each maps to
  a base media operation (`image`, `video`, `audio`, `tts`, `upscale`, etc.).
- **Storage:** `OrgDefaultModel` rows (`domain`, `category`, `providerId`, `version`, `model`,
  `settings`) keyed by `(organizationId, domain, category)`.
- **Resolution:** `DefaultsResolutionService` reads the stored row; if none, it auto-picks from the
  org's enabled providers using provider `metadata.ts` category/capability flags and a hint list that
  targets the historical default models. Auto-picks are deterministic but **may differ** from the old
  hardcoded defaults when the active provider is not the historical one.
- **API:** `GET /settings/ai/defaults`, `PUT/DELETE /settings/ai/defaults/:category`,
  `GET /settings/ai/defaults/catalog?category=`. Media mirror under `/settings/content/media-defaults`.
- **UI:** Settings → AI → **Model Defaults**; Settings → Content → **Media Defaults**.
- **Kill switch:** `AI_MODEL_DEFAULTS_ENABLED=false` (default `true`) reverts AI model resolution to
  the legacy `orgActive`/`SURFACE_DEFAULTS` chain. Media defaults have no kill switch — they are new
  functionality, not a behavior change.
- **Legacy deleted:** `VideoManager`, `@Video` registry, `ImagesSlides`, `Veo3`,
  `AiMediaGenerationService`, and the `generate.video.options` chat tool. All media/text callers now
  route through `AiDefaultsService` / `AiMediaService`.

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

## Campaign Hub (v3.9.0+)

A campaign is an org-scoped command center for posts, channels, brands, files, and planning notes.
It supports tagged items, draft approvals, UTM tagging, goals, copy/clone, shareable public reports,
and a dashboard of KPIs.

### Data model
- `Campaign` — org-scoped folder; `shareToken` / `shareEnabled` control public reports; `utmEnabled`
  toggles automatic UTM query-string append; `goals` stores a JSON array of `{ metric, target }`.
  Optional metadata: `client` / `project` (free-text) and `tags` (JSON `string[]`) — collected in the
  create/edit modal, shown read-only on the dashboard header. **Internal-only:** these (and the
  resolved `createdBy`) are **not** in `CampaignReportService.toPublicJson`'s whitelist, so they never
  leak on the public client report.
- `CampaignEntityType` enum — `POST`, `INTEGRATION`, `ORG_VPN_CONFIG`, `AI_ORG_PROVIDER_CONFIG`,
  `AI_BRAND_PROFILE`, `STORAGE_PROVIDER_CONFIG`, `FILE`, `SETS`, `SIGNATURES`.
- `CampaignItem` — polymorphic tag table (`campaignId`, `entityType`, `entityId`) for the 8 non-post
  types. Posts remain single-campaign via the existing `Post.campaignId` FK.
- `CampaignItemResolverRepository` resolves batches of `CampaignItem` ids to display names/icons per
  type, skipping orphans (deleted source rows).
- `Post.approvalStatus` / `approvedById` / `approvedAt` — draft approval state; only `approved`
  drafts can be promoted to scheduled.
- `CampaignNote` / `CampaignNoteReaction` — the internal **Discussion** thread (see below). Additive
  tables; `CampaignNote.content` is sanitized rich HTML, `parentId` gives one-level threading,
  `mentions` is a JSON `string[]` of userIds, plus `pinned` / `resolvedAt` / `editedAt` / soft
  `deletedAt`. `CampaignNoteReaction` is unique on `(noteId, userId, emoji)` (toggle).

### Discussion (internal collaborative thread)
- **`dashboard/campaign-discussion-section.tsx`** renders a Jira-style **Discussion** thread **below
  the tabbed content** (always visible, not a tab) where org members talk about the campaign — this is
  **distinct from the synced social `Comments`** feature (`SocialComment`). Notes are rich HTML with
  **embedded image/video**, **@mentions**, **emoji reactions**, one-level **threaded replies**, and
  **pin/resolve**; authors show avatar + relative time; edit/delete is own-only (super-admin bypass).
- **Editor** (`dashboard/discussion-editor.tsx`) is a lightweight **TipTap** editor — `StarterKit`
  (which already bundles Link+Underline in v3; do **not** re-add them) + `Mention` (reusing the
  composer's exported `suggestion(loadList)` from `composer/mention.component.tsx`) + two tiny custom
  atom nodes (`image`/`video`) so picked media embeds inline. Media is inserted via the shared
  `MediaSelectorModal`; emoji via `emoji-picker-react`.
- **Rendering** goes through `SafeContent` (DOMPurify allowlist — extended to cover StarterKit output:
  `em`/`s`/`ol`/`code`/`pre`/`blockquote`). Note HTML is **also sanitized server-side on write**
  (`campaign-note.sanitize.ts`, allowlist kept in lockstep with `SafeContent`) — sanitize-on-write AND
  on-render.
- **Backend**: `campaign-note.repository.ts` + `campaign-note.service.ts` (validates the campaign is in
  the org, rejects >1-level replies, intersects `mentions` with real org member ids before notifying,
  fires `NotificationService.notify` with `category:'comments'` + `targetUserIds`, non-fatal). Routes
  live on `CampaignsController`: `GET/POST /campaigns/:id/notes`, `PUT/DELETE
  /campaigns/:id/notes/:noteId`, `POST …/:noteId/{pin,resolve,reactions}` — all org-scoped, billing
  `POSTS_PER_MONTH`, RBAC `posts:update` for writes. Frontend hooks `useCampaignNotes` /
  `useTeamMembers` in `campaign.hooks.ts`.

### Architecture
- Backend: `CampaignsController` + `CampaignTagService` (apps/backend) and `CampaignsService`,
  `CampaignReportService`, `CampaignItemRepository`, `CampaignItemResolverRepository`,
  `CampaignActivity` in `libraries/nestjs-libraries/src/database/prisma/campaigns/`.
  `PostsService` appends UTM parameters before short-linking when a post belongs to a campaign with
  `utmEnabled`.
- Frontend: `apps/frontend/src/components/campaigns/` — index, dashboard, planning workspace,
  copy modal, report view, public share page. Uses existing `useFetch`/`useSWR` conventions.
- Cron: `campaign-tag-purge` runs daily 03:00 UTC and deletes `CampaignItem` rows for campaigns whose
  `endDate` is more than `CAMPAIGN_PURGE_DAYS` (default 30) ago; ongoing campaigns (`endDate: null`)
  are never purged.
- **Comments section** (`dashboard/campaign-comments-section.tsx`): a full view/reply surface over
  the campaign's posts' synced comments. It reuses the existing **`/posts/inbox`** endpoint — which
  gained optional **`campaignId`** + **`integrationId`** filters (`SocialCommentsRepository.getInbox`
  adds a `post: { campaignId }` relation filter; campaign id is a **uuid**, validated with `isUUID`,
  not `isCuid`) — plus the per-post reply/like/status/assign/bulk-read routes and the shared
  `CommentCard` + `CommentComposer`. The dashboard's **"Comments" KPI and `comments` goal now reflect
  the synced `SocialComment` count** (`SocialCommentsService.countCampaignComments`), not the
  platform-reported `lastComments` sum — `CampaignsService.getDashboard` and
  `CampaignReportService.buildReport` both override `engagement.totalComments` with that count, so the
  KPI, goal, section, and public report all agree.
- **Channels section** (`dashboard/campaign-channels-section.tsx`): the dashboard's
  `getDashboard` returns a `channels` array = **union of** channels the campaign's posts publish to
  **and** explicitly-tagged `INTEGRATION` items, deduped by integration id with a `postCount`
  (rendered with the shared `ProviderIcon`). Because this dedicated section owns channels, `channel`
  was removed from `tagged-items-panels.tsx` (`ENTITY_ORDER` + default add-type) to avoid a double
  render. Its **Add Channel** / **Invite Client** buttons reuse `useAddProvider(update, invite,
  campaignId)` — an optional `campaignId` now threads through `AddProviderComponent` →
  `GET /integrations/social/:integration?campaign=` → `ioRedis` `campaign:<state>`; the OAuth callback
  (`no.auth.integrations.controller.ts`) reads it and auto-tags the new channel onto the campaign
  (non-fatal; covers both direct connect and the invite link).
- **Files section** (`dashboard/campaign-files-section.tsx`): a first-class **Files** tab (after
  Channels) that owns the campaign's tagged files, reading `getDashboard`'s `itemPanels.file`. Like
  channels, `file` was removed from `tagged-items-panels.tsx` `ENTITY_ORDER` to avoid a double render;
  the section reuses the exported `PanelItem` grid and the generalized `AddItemsModal`
  (`types={['file']}`, which hides the type dropdown when a single type is passed).
- **Creator + profile**: `getDashboard` resolves `campaign.createdById` into
  `createdBy { id, name, email, avatarUrl }` (via `UsersService.getPublicProfilesByIds`); the header
  links "Created by" to a read-only, tenant-guarded member-profile page at `/profile/[id]`
  (`GET /user/profile/:userId` → `OrganizationService.getMemberProfile`, which returns null for a
  non-member so cross-org lookup is blocked).

### Public share
`GET /public/campaign-report/:token` returns a read-only, stripped JSON report when `shareEnabled`
is true. The token is a random 64-character hex string minted by `CampaignsService.mintShareToken()`;
`POST /campaigns/:id/share` mints/rotates it, and `DELETE /campaigns/:id/share` disables sharing.

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
  **Single-key model:** one deployment-wide key encrypts every secret — there is **no per-org crypto
  key**. "Org-scoped" means DB-column-scoped (storage), not cryptographically isolated; cross-org
  isolation is enforced by query scoping. `EncryptionService` (per-org domain rows) and
  `AuthService.fixedEncryption` (global rows) are the same key behind two routes — in fact
  `EncryptionService.encrypt/decrypt` now **delegates directly to** `AuthService.fixedEncryption`
  (one shared `getEncryptionKey()`), so the routes do **not** diverge even when a dedicated
  `ENCRYPTION_KEY` is set — behavior is unchanged and old rows still decrypt. Still, never mix the
  decrypt route for a given row (keep per-org reads on `EncryptionService`, global reads on
  `AuthService.fixedEncryption`) so the convention stays legible.
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
  Designer**, which stashes the selection in `sessionStorage` and navigates to `?bulk=1`), or a
  **caption handoff** (`?captions=1` + `sessionStorage['designer:caption-handoff']`) from the Deepgram
  studio — the one path that loads a **video onto the timeline** (`setMode('video')` + a caption track
  built from word timings); the single-asset `?type=video` open only drops a static thumbnail. Animated
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
  - **Video** — Runway, Luma, MiniMax, Kling and **Pika** (both via the `fal` adapter — config
    identifier `fal`, but the descriptor's `provider: 'fal'` + `title` give each its own branded
    studio; the `model` field carries the full fal endpoint id and the adapter spreads `input` into
    the body, so they reuse the org's fal key — Pika's official API is fal-hosted per pika.art/api.
    Pika's studio has Text→Video + Image→Video (`fal-ai/pika/v2.2/*`) and a **Pikaffects** tab
    (`fal-ai/pika/v1.5/pikaffects`, 16 one-click VFX). Frontend-only — no new adapter/registry id),
    Vertex (Google **Veo**), Qwen (Alibaba **Wan2.x** text→video + image→video).
  - **Image** — Black Forest Labs (FLUX), Stability AI (Stable Image core/ultra/sd3), Qwen
    (Alibaba **Qwen-Image**, a third tab on the Qwen studio), OpenAI
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
- **Qwen (Alibaba DashScope)** is a single-key kit studio with three tabs — Text→Image (`qwen-image*`),
  Text→Video and Image→Video (`wan2.x`). Both surfaces are DashScope **async task APIs** (POST with
  `X-DashScope-Async: enable` → `task_id`, then poll `GET /tasks/{id}`): image keeps the synchronous
  contract via bounded internal polling (like BFL/Runway); video has **no webhook** → poll-cron
  completion (like Runway/Veo). The `qwen-media.adapter.ts` routes `prompt`/`negative_prompt`/`img_url`
  into DashScope's `input` and every other native param into `parameters`. **Credential is shared with
  the Qwen LLM provider** (`ai.module.ts`): Qwen is a *universal-credential* provider, so when no
  dedicated media credential exists `OrgMediaProviderSettingsService.getConfigForProvider` falls back
  to the org's **AIOrgProviderConfig** Qwen key (read via `OrgAiSettingsRepository`, decrypted with the
  media `EncryptionService` — per-org AI configs use AES-GCM, **not** the global config's
  `AuthService.fixedEncryption`). Configure the DashScope key once at Settings → AI **or** Settings →
  Media and both work. (openai/minimax instead write-mirror both ways via `ProviderCredentialLinkService`;
  Qwen has no media-side settings flow, so a read-fallback is the lighter path — extend
  `UNIVERSAL_AI_CREDENTIAL` to add more such providers.)
- **Wan (Alibaba Model Studio)** is a dedicated, Wan-branded kit studio (`/media/wan`) with three tabs
  — Text→Image (`wan2.2-t2i*` / `wanx2.1-t2i*` via `…/text2image/image-synthesis`), Text→Video and
  Image→Video (`wan2.x-t2v*` / `wan2.x-i2v*` via `…/video-generation/video-synthesis`). It is the **same
  DashScope async-task protocol as Qwen** (`X-DashScope-Async` → `task_id`, poll `GET /tasks/{id}`,
  `output.video_url`/`output.results[].url`; image bounded-poll-synchronous, video poll-cron with no
  webhook) but pointed at the **international host** `dashscope-intl.aliyuncs.com` (clicking "API" on
  wan.video lands on `modelstudio.alibabacloud.com` — wan.video IS Model Studio, with Wan as the model
  family). Unlike Qwen, Wan is an **own-key** provider configured at Settings → Media — it is
  intentionally **NOT** in `UNIVERSAL_AI_CREDENTIAL` (a Wan key need not be the Qwen LLM key), so it
  surfaces purely by adapter registration. `wan.adapter.ts` reuses Qwen's `INPUT_KEYS` routing
  (`negative_prompt`/`img_url`/`audio_url` → `input`, all else → `parameters`). Model lists are curated
  in the descriptor (DashScope has no clean per-modality catalog for the task API). **Built without a
  live key** — endpoints/model ids are grounded in Alibaba's public Model Studio API reference; the
  exact intl host/region may need a live smoke test.
- **Higgsfield** (`platform.higgsfield.ai`) is an **own-key** kit studio (`/media/higgsfield`) with a
  **two-part credential** — `keyId` + `keySecret` (declared via `credentialFields`, rendered as the
  multi-field Settings → Media modal like Vertex), sent as the single header
  `Authorization: Key <id>:<secret>` (the official `higgsfield-js` V2 scheme). Every generation is
  **submit-and-poll**: POST the input fields **directly** (not wrapped) to the model endpoint →
  `{ request_id, status }`, then poll `GET /requests/{id}/status` until `completed` (or `nsfw`/`failed`)
  — image bounded-poll-synchronous, video poll-cron (no webhook). Three model surfaces, routed by
  operation + the `model` value: **Soul** text→image (`/v1/text2image/soul`, optional `image_reference`
  for image-to-image), **DoP** image→video (`/v1/image2video/dop`, `model=dop-lite|dop-turbo|dop-standard`),
  and **Speak** audio→talking-video (`/v1/speak/higgsfield`, `model='speak'` as a routing marker only).
  `higgsfield.adapter.ts` wraps the flat media-field URLs into Higgsfield's nested input objects
  (`input_images[]` / `input_image` / `input_audio` / `image_reference`); `result.video.url` or
  `result.images[].url` (Soul `batch_size: 4` returns multiple). **Built without a live key** —
  endpoints/shapes are grounded in the official higgsfield-js SDK source; Soul `width_and_height`
  presets may need a live smoke test.
- **LTX Studio** (Lightricks, `api.ltx.video`) is an **own-key** kit studio (`/media/ltx`) configured at
  Settings → Media — single Bearer key, **video-only** (LTX-2 / LTX-2.3 family). Three tabs, all
  `operation: 'video'`: **Text→Video** (`POST /v2/text-to-video`), **Image→Video** (`/v2/image-to-video`,
  `image_uri` + optional `last_frame_uri`), **Audio→Video** (`/v2/audio-to-video`, `audio_uri` + optional
  `image_uri`; Pro models only). Every generation is **async submit-and-poll**: POST → `{ id }`, then poll
  `GET /v2/<op>/{id}` until `status: completed`, reading `result.video_url` (no webhook → poll-cron, like
  Runway/Wan). The sub-operation is **routed by the media inputs present** (audio → audio-to-video, else
  image → image-to-video, else text-to-video), and because the poll path mirrors the submit path the
  `ltx.adapter.ts` **namespaces the job id as `<op>:<id>`** (the HeyGen pattern) so `pollJob` hits the
  right status endpoint. Native params (`model`/`resolution`/`duration`/`fps`/`generate_audio`/
  `camera_motion`/`last_frame_uri`) ride flat into the body — LTX is not DashScope-split. **Built without a
  live key** — endpoints/params are grounded in the official `docs.ltx.video` reference; resolution-string
  vs. named-preset formatting may need a live smoke test.
- **Suno** (`api.sunoapi.org`) is an **own-key** AI-**music** kit studio (`/media/suno`) configured at
  Settings → Media — single Bearer key, **audio-only**. Two tabs (**Song** / **Instrumental**), both
  `operation: 'audio'`. **Async submit-and-poll**: `POST /api/v1/generate` → `{ data: { taskId } }`, then
  poll `GET /api/v1/generate/record-info?taskId=` until `data.status === 'SUCCESS'`, reading
  `data.response.sunoData[].audioUrl` (public MP3s, re-downloadable; no webhook → poll-cron like
  Runway/LTX). The adapter sets `customMode` only when both `style` **and** `title` are filled (else a
  non-custom prompt-only generation) and always sends `callBackUrl: ''` (polling-only). **Two clips per
  generation:** Suno returns 2 takes, so `pollJob` returns the first as the artifact and the rest via the
  generic **`extraArtifactUrls`** field on `MediaPollResult` — `MediaJobLifecycleService.processJob` lands
  each extra as a **sibling completed job** (one render-queue card / audio file per take; provider-agnostic,
  no Suno branch). **Built without a live key** — endpoints/status strings grounded in the `docs.sunoapi.org`
  reference; the status set + `sunoData[].audioUrl` path + 2-clip array need a live smoke test.
- **Reel.Farm** (`reel.farm`) and **Genviral** (`genviral.io`) are two **own-key** faceless/short-form
  **video** kit studios configured at Settings → Media — each a `<provider>.adapter.ts` + descriptor +
  3-line studio + route + nav entry (`/media/reelfarm`, `/media/genviral`), `operation: 'video'`, single
  Bearer key. Both are **async submit-and-poll**, no webhook → poll-cron (like Runway/LTX). **Reel.Farm**
  renders an AI TikTok slideshow from a prompt: `POST /api/v1/slideshows/generate` → `{ slideshow_id }`,
  poll `GET /slideshows/{id}/status`; the status response carries **no mp4 URL**, so `pollJob` fetches
  `GET /videos/{video_id}` once a `video_id` exists and reads `video_url`. The prompt is sent as
  `additional_context`; optional `image_N` media fields are collected into the `images[]` background array.
  **Genviral** Studio AI: `POST /studio/videos` (required `model_id` from a **live `/studio/models`** catalog
  → the descriptor's dynamic `source: 'models'` field) → poll `GET /studio/videos/{id}` until
  `data.status: succeeded` (`data.output_url`); the adapter routes `resolution`/`duration_seconds`/`fps`/
  `aspect_ratio`/`generate_audio` into the nested `params` object and everything else (incl. resolved
  `image_url`/`audio_url`) flat. These are the resolved survivors of a 6-provider ask — Superscale AI,
  NullFace AI, SendShort, and Vireel were **dropped: no public API exists** (don't re-add without one).
  **Built without a live key** — Reel.Farm's slideshow `video_url` field and Genviral's `/studio/models`
  shape (mapped defensively) need a live smoke test.
- **Sora** (OpenAI) is a branded kit studio (`/media/sora`) that **reuses the `openai` provider/key** —
  `descriptor.provider: 'openai'`, like Pika rides `fal` — so no separate credential: the org's existing
  Settings → AI / Media OpenAI key drives it. Video-only, two tabs (Text→Video, Image→Video). Sora lives
  on the **async Videos API** (`POST /v1/videos` → `{ id }`, poll `GET /v1/videos/{id}` until
  `completed`; no webhook → poll-cron). The wrinkle: the finished MP4 is **auth-only bytes** at
  `GET /v1/videos/{id}/content` (no public URL), so `openai-media.adapter.ts` `pollJob` downloads it with
  the key and returns it **inline as a `data:video/mp4;base64,…` URL** — the lifecycle `_download`
  decodes data URLs (512 MB cap), whereas the default unauthenticated re-download of a provider URL would
  401. Image-to-video uploads the source frame as the multipart `input_reference` field (the adapter
  fetches the resolved media URL → bytes); text-to-video sends a plain JSON body. `generateVideo` +
  `pollJob` were added to the existing OpenAI media adapter (capabilities flipped `video: true`); the
  existing OpenAI image/TTS studio is unchanged (separate descriptor, no video tab). **Built without a
  live key** — grounded in the official OpenAI Videos API reference. (Note: OpenAI lists the Sora-2 Videos
  API as deprecated with a 2026-09-24 shutdown.)
- **Google AI Studio** (`/media/google-ai`, registry id `google`) is the **Gemini Developer API**
  (`generativelanguage.googleapis.com`) — keyed by a single Gemini API key (`AIza…`), the **same key**
  the org sets at Settings → AI → "Google Gemini". So `google` is a **universal-credential** media
  provider (added to `UNIVERSAL_AI_CREDENTIAL` alongside Qwen): configure the Gemini key once and it
  drives both the LLM and the media studio; no Settings → Media config needed (registering the adapter
  auto-surfaces it, marked configured when the AI key exists). This is **distinct from `vertex`**, which
  is the enterprise GCP path (service-account `project`/`location`/`googleCredentials`, short-lived
  minted token) — the media adapter `name` was renamed `Google Vertex AI` → **Google Vertex** (AI +
  media surfaces, studio title, nav) to disambiguate the two Google surfaces. `google-ai-media.adapter.ts`
  serves **image** (synchronous): **Nano Banana** (`gemini-2.5-flash-image` via `:generateContent` →
  inline `candidates[].content.parts[].inlineData` base64) and **Imagen** (`imagen-*` via `:predict` →
  `predictions[].bytesBase64Encoded`), routed by the chosen model id; and **video**: **Veo**
  (`veo-*` via `:predictLongRunning` → operation name as `jobId`, polled at `GET /v1beta/{name}`; no
  webhook → media-jobs poll-cron, like Vertex Veo). Veo's finished MP4 is **auth-only bytes** at the
  returned file `uri`, so `pollJob` downloads it **with the key** and returns a `data:video/mp4;base64,…`
  URL (the Sora pattern — the lifecycle's unauthenticated re-download would 401). The key rides as the
  `x-goog-api-key` header. **Built without a live key** — endpoints grounded in the official
  `ai.google.dev` Gemini API reference (Imagen `:predict`, Gemini-image `:generateContent`, Veo
  `:predictLongRunning`); image `aspectRatio`/`sampleCount` shaping and the Veo file-download header may
  need a live smoke test. (Note: Imagen `:predict` is slated for shutdown 2026-08-17 in favour of Nano
  Banana — both remain selectable model options.)
- **Recraft** (`/media/recraft`), **Ideogram** (`/media/ideogram`), and **Leonardo.ai**
  (`/media/leonardo`) are three **own-key image** kit studios configured at Settings → Media. Each is a
  `<hub>-media.adapter.ts` (image-only capability) + descriptor + 3-line studio + route + nav entry.
  **Recraft** (`external.api.recraft.ai`, Bearer) — raster + vector/SVG + icons; one synchronous POST
  → hosted URL; native params (style/substyle/size/n) ride via `options.input`. **Ideogram**
  (`api.ideogram.ai/v1/ideogram-v3/generate`) — accurate in-image text; the key rides as the **`Api-Key`
  header** (not Bearer) and the body is **multipart/form-data** (the adapter builds a `FormData`, no
  Content-Type so fetch sets the boundary), single endpoint with **no model param**; synchronous.
  **Leonardo.ai** (`cloud.leonardo.ai/api/rest/v1`, Bearer) — its API is async (create → `generationId`
  → poll `GET /generations/{id}` until `COMPLETE`), but image must be synchronous, so the adapter
  **polls internally** (the BFL/Qwen bounded-poll pattern) to keep the contract; the `model` select
  carries a Leonardo model **UUID** (→ `modelId`), width/height/num_images ride via `options.input`. All
  three return hosted public URLs (re-downloaded by the lifecycle via `safeFetch`). **Built without a
  live key** — endpoints grounded in the official Recraft / Ideogram / Leonardo API references; param
  names and Leonardo model UUIDs may need a live smoke test.

### AI-hub media studios (image/video/audio, credential-reuse)

The AI **hub/aggregator** LLM providers also serve large media catalogs, exposed as kit studios that
**reuse the org's existing Settings → AI key** (the Qwen `UNIVERSAL_AI_CREDENTIAL` pattern, now a
10-entry set: `qwen`, `togetherai`, `siliconflow`, `groq`, `openrouter`, `fireworks`, `deepinfra`,
`gateway`, `bedrock`, `azure`). Each is a `<hub>-media.adapter.ts` + `media-tools/<hub>/descriptor.ts`
+ a 3-line studio + route page + nav entry — no Settings → Media config needed (registering the
adapter auto-surfaces it, marked configured/enabled when the AI key exists).

- **Mechanism per (hub, modality):** native REST dominates; AI-SDK delegation is the narrow exception
  for hard auth and experimental video.
  - **Native REST** (Qwen pattern, `safeFetch`, native-param passthrough via `options.input`):
    Together (image `/v1/images/generations`, video `/v1/videos` async+poll, TTS `/v1/audio/speech`),
    SiliconFlow (image + Wan2.x video `/v1/video/submit`+`/video/status` + TTS), Groq (TTS only,
    `/openai/v1/audio/speech`), OpenRouter (image only, dedicated `/api/v1/images` → `b64_json`),
    Fireworks (image only, `…/{model}/text_to_image`, `Accept: application/json` → `base64[]`),
    DeepInfra (image/video/TTS via native `/v1/inference/{model}`). Together + SiliconFlow share the
    OpenAI-compatible image+audio shape via `openai-compatible-media.adapter.ts` (abstract base —
    subclasses add their own async video).
  - **AI-SDK delegation** (`ai-sdk-media.adapter.ts` + `ai-sdk-media.helper.ts`): Bedrock + Azure
    image generation runs through the matching **AI** adapter's `createImageModel` (so SigV4 / Azure
    deployment auth is handled by `@ai-sdk/amazon-bedrock` / `@ai-sdk/azure`, never hand-rolled). The
    media adapters are dependency-free `new`'d objects, so `MediaModule.onModuleInit` static-injects
    the `AIProviderRegistry` into the helper (`setAiRegistry`) — `MediaStudioService` stays provider-
    agnostic. Image-only this batch (Bedrock Nova Reel video / Azure Speech deferred).
  - **Gateway** (`gateway-media.adapter.ts`): image via AI-SDK delegation; **video via AI SDK v6
    `experimental_generateVideo`** (`createGateway({apiKey}).video(modelId)`), which is inherently
    synchronous (one long await) — we extend the Undici dispatcher timeout to 15 min and complete the
    job inline (no poll/webhook). Audio is omitted (no gateway speech model in the AI adapter).
- **Dynamic model discovery (the "many models" surface):** a new optional
  `listModels(operation, options)` on `MediaProviderAdapter` hits the hub's `/v1/models` (filtered by
  modality) or reuses the AI adapter's catalog; served by `GET /media/studio/:provider/models?operation=`
  (`MediaStudioService.listModels`, Redis-cached ~60s). The Studio Kit `select` field gains
  `source: 'models'` → a **searchable combobox** (`studio-kit/model-select.tsx`) populated live, with
  the descriptor's static `options` as fallback. The combobox **accepts a typed model id** too, so an
  incomplete catalog (hubs don't tag every modality) never blocks a render.
- **Risk:** these were built source-grounded but **without live keys** — per-hub request/response
  bodies (esp. DeepInfra's native `/inference` keys, Together/SiliconFlow video model ids) may need
  adjustment against a real key; structure keeps each (hub, modality) independently verifiable.

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
  captions). `POST /transcribe` (gated on the org's Deepgram key) and `POST /save-transcript`.
- **Transcript history rides the render queue.** `save-transcript` persists the transcript as a
  **completed `stt` `AIMediaJob`** via `MediaJobLifecycleService.completeJobWithBuffer` (the text lands
  in the media tree, bypassing the `/files` import content-type allowlist), so it surfaces through the
  existing `GET /media/studio/:provider/jobs`. `stt` is created already-complete, so it never enters
  the async poll path (`'stt'` added to the lifecycle `AsyncOperation` union). The shared studio-kit
  `RenderQueue` gained an **additive `stt` branch** — a text card with **Copy** / **To composer**
  (no AV preview, no Edit-in-Designer/Post); other studios never emit `stt`, so they're unchanged.
- The panel exports captions **client-side** — `.srt` / `.vtt` / `.txt` Blob downloads (no `/files`
  write, so no allowlist change), plus copy, Save-to-Files (→ render queue), and a Send-to-composer
  handoff. The adapter's `speechToTextWords` gained an **opt-in** `input.smartFormat`
  (→ `smart_format`+`punctuate`) and `input.language` passthrough; the Designer timeline's existing
  auto-caption call passes neither, so its request is unchanged.
- **Edit in Designer (captions burned, no re-transcribe).** For a video source, the panel stashes
  `{ url, fileId, width, height, words }` in `sessionStorage` (`designer:caption-handoff`) and opens
  `/media/designer?captions=1`. The Designer reads it (new `initialCaptionVideo` prop on the `Designer`
  component) and **builds a video project**: `setMode('video')`, loads the clip's duration via a
  metadata probe (`onloadedmetadata` → real duration, `onerror`/5s-timeout → 10s fallback so a
  hanging source can't block), adds the video clip, then a **caption track** phrase-grouped from the
  word timings (same grouping as the timeline's auto-caption). This is the **only** path that loads a
  video onto the Designer timeline from a URL (the `?url=&type=video` open still drops a static
  thumbnail).

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
- **A `ContentPack` registry is the single source of truth** (`media/stock/content-packs/
  content-pack.registry.ts`): each entry declares `{ name, capabilities, credentialFields, factory }`.
  Adding a pack there surfaces it in the settings list, the credential form, and per-capability
  resolution — no other wiring. Every pack implements the shared `ContentPack` interface
  (`content-pack.interface.ts`: `search(capability, …)` + `resolveDownload(id, capability)`); all
  outbound HTTP goes through `safeFetch`; a provider 429 throws `ContentPackDailyCapError` → the import
  controller maps it to a 402.
- **Four packs**: **Magnific** (photos/vectors/icons/videos), **Vecteezy** (photos/vectors/videos),
  **Adobe Stock** (photos/vectors/videos — the user's "Adobe Firefly" ask resolved to the licensable
  Adobe *Stock* library, not Firefly generative), **Envato Elements** (photos/vectors/videos/audio).
  Only ONE pack is active per org. When the active pack covers a capability it takes precedence over
  the matching free catalog; **anything it does NOT declare falls back to the free provider** for that
  capability (`StockMediaService.resolveSearch` → `getActiveForCapability` returns null → free). Saving
  uses a **mint-then-ingest** step (`resolveContentPackDownload` → the pack's `resolveDownload` mints a
  licensed URL before `/files/import`; the import gate fires for any `source` in the registry).
  Credentials are encrypted at rest and never returned to the client.
- **Risk**: Vecteezy and Envato were built source-grounded but **without live keys** (Vecteezy's
  content API is partner-gated; Envato's download entitlement differs between Market and Elements), and
  Adobe Stock's full *licensed* download needs an OAuth entitlement (search + comp URL work with a key
  alone). Per-pack request/response shapes may need a live smoke test; each pack is independently
  verifiable behind its own adapter.

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

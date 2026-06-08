# Architecture

A developer's tour of the monorepo and how the pieces fit. For the user-facing overview see
[Overview](../getting-started/overview.md); for agent-specific guidance the repo also ships
`AGENTS.md` at the root.

> **Verified against v3.5.9.**

---

## Monorepo layout

PNPM monorepo with a single root `package.json`. Workspaces are driven by `pnpm --filter`.

### Apps (`apps/`)

| App | Stack | Role |
|-----|-------|------|
| `backend` | NestJS REST API | Kept **thin** — controllers + module wiring. Real logic lives in libraries. |
| `orchestrator` | NestJS + Temporal | Background jobs: workflows and activities. |
| `frontend` | Next.js (App Router) + React | Web UI on port `4200`, Tailwind 3, Sentry-instrumented. |
| `extension` | Browser extension | Cookie-based integrations. |
| `commands` | CLI | Maintenance commands. |
| `sdk` | Published SDK | Programmatic access. |

### Libraries (`libraries/`)

| Library | Role |
|---------|------|
| `nestjs-libraries` | The bulk of shared server logic, the Prisma schema, and repositories. **Most backend logic belongs here.** |
| `helpers` | Shared utilities, including the `useFetch` hook. |
| `react-shared-libraries` | Shared React components. |

## Backend layering — no shortcuts

```
Controller → Service → Repository
Controller → Manager → Service → Repository   (when a manager is involved)
```

- Only repositories (`*.repository.ts` under `nestjs-libraries/src/database/prisma/<domain>/`) touch
  Prisma. Controllers and services never call Prisma directly.
- A service that needs another domain calls that domain's **service**, not its repository.
- `apps/backend` is mostly controllers + wiring that import from `nestjs-libraries`.

See [Backend conventions](./backend.md).

## Frontend

Next.js App Router. UI components in `apps/frontend/src/components/ui`, other components in
`apps/frontend/src/components`, routes/pages in `apps/frontend/src/app`. Data fetching is SWR via the
`useFetch` hook. See [Frontend conventions](./frontend.md).

## Background jobs

Temporal workflows/activities in `apps/orchestrator`. Scheduled publishing, token refresh, email,
analytics collection, and comment sync. Recurring collection sweeps require `RUN_CRON=true`. See
[Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## The AI layer

A pluggable multi-provider system centered on the `AIModelProvider` facade in
`libraries/nestjs-libraries/src/ai`, with provider adapters, governance, and admin configuration.
See [AI architecture](./ai-architecture.md).

## Data

A single Prisma schema is the source of truth, applied with `prisma db push` (no SQL migration
files). See [Database](./database.md) and [Data model](../reference/data-model.md).

## Fork-specific subsystems

| Subsystem | Where | Docs |
|-----------|-------|------|
| DB-backed provider config | `ProviderConfig*` + `/admin/channel-configs` | [Channels admin](../admin/channels.md) |
| Persisted analytics | `analytics/*`, `/analytics/v2`, Temporal | [Analytics](../features/analytics.md) |
| Social comments | `social-comments.*`, Temporal | [Social comments](../features/social-comments.md) |
| AI provider system | `ai/*`, `/admin/ai-settings` | [AI architecture](./ai-architecture.md) |

## Cross-cutting infrastructure (v3.5.0)

The v3.5.0 hardening pass added several cross-cutting primitives that new code must use:

| Primitive | Where | What it does |
|-----------|-------|--------------|
| **`safeFetch`** | `nestjs-libraries/src/dtos/webhooks/safe.fetch.ts` | SSRF-safe outbound dispatcher: validates the URL with `isSafePublicHttpsUrl`, issues the request with `redirect: 'manual'` and the `ssrfSafeDispatcher`, and re-validates every redirect hop (cap 5). All webhook dispatch and user-influenced provider fetches route through it. Mirrors the `/stream` redirect loop. |
| **`EncryptionService`** | `nestjs-libraries/src/encryption/encryption.service.ts` (wrapping the AES-GCM helpers in `helpers/src/auth/auth.service.ts`) | Versioned authenticated encryption. New ciphertext carries a `v2:` prefix (AES-256-GCM); legacy plaintext / CBC values read back transparently. Key from `ENCRYPTION_KEY` (32-byte base64/hex) or derived from `JWT_SECRET`. `encryptDeterministic` exists for lookup-by-ciphertext cases. `Integration.token`/`refreshToken` are now encrypted at rest. |
| **CSRF middleware** | `apps/backend/src/services/auth/csrf.middleware.ts` | Protects cookie-authenticated mutating routes. Header/API-key clients are unaffected. |
| **Helmet + Sentry scrubbing** | `apps/backend/src/main.ts`, `initialize.sentry.ts` | Helmet (HSTS, CSP, noSniff, frameguard) after CORS; Sentry `beforeSend`/`beforeBreadcrumb` strip auth headers/cookies/tokens/PII. Both bypass under `NOT_SECURED`. |
| **Throttle guard fix** | `nestjs-libraries/src/throttler/throttler.provider.ts` | `ThrottlerBehindProxyGuard` now applies the default throttle to **all** routes (previously most routes bypassed it), with `@Throttle` overriding per-route. This is what makes the new AI/auth route throttles actually take effect. |
| **Provider capability matrix** | `nestjs-libraries/src/integrations/social/provider-capabilities.ts` (`PROVIDER_CAPABILITIES`) | Single source of truth for per-provider comments / first-comment / poll / analytics support, served at `/provider-capabilities`. Features gate on it. |
| **`AnalyticsRepository`** | `nestjs-libraries/src/database/prisma/analytics/analytics.repository.ts` | Moves the direct `this.prisma.*` calls out of `AnalyticsService` to satisfy the repository-only-touches-Prisma rule. |
| **`RedisService`** | `nestjs-libraries/src/redis/redis.service.ts` | The `ioRedis` module singleton is now wrapped in an injectable (old export kept as a deprecated alias). Backs the analytics overview cache. |

See [Backend conventions](./backend.md) and [Database](./database.md).

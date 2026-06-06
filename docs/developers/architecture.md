# Architecture

A developer's tour of the monorepo and how the pieces fit. For the user-facing overview see
[Overview](../getting-started/overview.md); for agent-specific guidance the repo also ships
`AGENTS.md` at the root.

> **Verified against v3.4.0.**

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

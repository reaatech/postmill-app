# Overview & Architecture

Postmill REAA Flavor is a self-hosted tool to schedule social media and chat posts across **36
channels**. You add posts to a calendar; they enter a workflow and publish at the scheduled time.
Alongside scheduling it provides a persisted analytics dashboard, team management, a media library,
and a pluggable AI layer.

> **Verified against v3.5.9.** For how this fork differs from the original project, see
> [What's different from upstream](../CHANGES_FROM_UPSTREAM.md).

---

## The stack

- **PNPM monorepo** — a single root `package.json`; workspaces driven by `pnpm --filter`.
- **PostgreSQL** — primary database, accessed through Prisma 6.5.0.
- **Redis** — caching, queues, rate limiting / idempotency.
- **Temporal** — durable background jobs (publishing, analytics collection, token refresh, email,
  comment sync).

## Applications (`apps/`)

| App | Stack | Role |
|-----|-------|------|
| `backend` | NestJS REST API | Thin controllers + wiring; real logic lives in libraries. |
| `orchestrator` | NestJS + Temporal | Background workflows and activities. |
| `frontend` | Next.js (App Router) + React | Web UI, runs on port `4200` in dev. |
| `extension` | Browser extension | Cookie-based integrations. |
| `commands` | CLI | Maintenance commands. |
| `sdk` | Published SDK | Programmatic access. |

## Libraries (`libraries/`)

| Library | Role |
|---------|------|
| `nestjs-libraries` | The bulk of shared server logic, the Prisma schema, and repositories. **Most backend logic lives here**, not in `apps/backend`. |
| `helpers` | Shared utilities, including the `useFetch` hook. |
| `react-shared-libraries` | Shared React components. |

## How a request flows

The backend passes through every layer with no shortcuts:

```
Controller → Service → Repository
Controller → Manager → Service → Repository   (when a manager is involved)
```

Only repositories touch Prisma; controllers and services never call it directly. A service that
needs another domain calls that domain's **service**, not its repository.

## How a post gets published

1. A user schedules a post on the calendar (frontend → backend API).
2. The post is persisted and a Temporal workflow is scheduled for its publish time.
3. At publish time the orchestrator runs the post workflow, which calls the relevant social
   provider's integration to publish.
4. Background workflows later collect analytics snapshots and (where supported) sync comments.

## Key feature areas (and where they're documented)

- **Channels / providers** — connect and publish to 36 platforms. Configure per-tenant credentials in
  **Settings → Channels**. See [Per-provider setup](../channels/setup-per-provider.md).
- **Analytics** — persisted multi-channel dashboard from daily snapshots, served via `/analytics/v2`.
  Collection: [Temporal & background jobs](../self-hosting/temporal-and-cron.md).
- **AI** — pluggable multi-provider system powering text/image generation and assistants. Configure
  in **Settings → AI**. See [AI features](../features/ai-features.md).

## Next steps

- New to running it? → [Quickstart](./quickstart.md)
- Deploying for real? → [Docker](../self-hosting/docker.md) and
  [Configuration](../self-hosting/configuration.md)

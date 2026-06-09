# Requirements

What you need to build and run Postmill REAA Flavor.

> **Verified against v3.6.0.**

---

## Services

| Service | Notes |
|---------|-------|
| **PostgreSQL** | Primary database. The compose files use Postgres 17. |
| **Redis** | Cache, queues, rate limiting / idempotency. Compose uses Redis 7. |
| **Temporal** | Durable background jobs. The bundled stack uses `temporalio/auto-setup` 1.28.1 with Elasticsearch 7.17 for visibility. |
| **Object storage** | Per-tenant storage adapters (S3, R2, B2, IDrive e2, or local disk). Configured in-app via **Settings → Storage**. See [Configuration](./configuration.md). |
| **SMTP/email (optional)** | Resend, for activation/notifications. Without it, users auto-activate. |

For how these fit together see [Architecture](../developers/architecture.md). For running them all
from one file see [Docker](./docker.md).

## Build / development toolchain

Only needed if you build from source rather than running the prebuilt image.

| Tool | Version | Source of truth |
|------|---------|-----------------|
| **Node.js** | `>=22.12.0 <23` | `package.json` `engines`. |
| **pnpm** | `10.6.1` | `package.json` `packageManager`. Use pnpm only — never npm or yarn. |
| **Prisma** | `6.5.0` | Invoked via `pnpm dlx prisma@6.5.0` in the scripts. |

> CI builds and tests on Node `22.12.0` / pnpm 10 — match that locally to avoid surprises. See
> [Testing](../developers/testing.md).

## Sizing notes

- The Temporal stack (server + its own Postgres + Elasticsearch) is the heaviest part. Elasticsearch
  in particular wants memory headroom; the bundled config sets conservative `ES_JAVA_OPTS`.
- Run the recurring analytics/comment collection on **one** orchestrator instance only
  (`RUN_CRON=true`). See [Temporal & background jobs](./temporal-and-cron.md).

## Network / URLs

Set these to the URL users actually reach Postmill on (behind your reverse proxy/TLS):

- `FRONTEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `BACKEND_INTERNAL_URL`.

OAuth redirect URLs for channels are derived from `FRONTEND_URL` — see
[Per-provider setup](../channels/setup-per-provider.md).

## Container images

The fork publishes to `ghcr.io/reaatech/postiz-app`. The bundled compose file references the
upstream image by default — repoint it to the fork image. See [Docker](./docker.md).

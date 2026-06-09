# Quickstart

The fastest path to a running instance. For a production-style single-container deployment, use
[Docker](../self-hosting/docker.md) instead.

> **Verified against v3.6.0.**

---

## Option A — Docker Compose (recommended to try it)

Brings up the app plus PostgreSQL, Redis, and a full Temporal stack.

```bash
docker compose up -d
```

Then open **http://localhost:4007** and register the first account.

The bundled `docker-compose.yaml` is self-contained — Postgres, Redis, Temporal (with
Elasticsearch), and the app. For what each service does and how to point it at the fork image
(`ghcr.io/reaatech/postiz-app`) and external storage, see [Docker](../self-hosting/docker.md).

---

## Option B — Local development

Run the apps directly from source for development.

### Prerequisites

- **Node.js** `>=22.12.0 <23` (the repo pins this in `package.json` `engines`).
- **pnpm** `10.6.1` (the repo's `packageManager`). Use pnpm only — never npm or yarn.
- **PostgreSQL** and **Redis** reachable locally.
- **Temporal** running locally if you need background jobs (publishing, analytics, etc.). The
  quickest way is the dev compose file: `pnpm run dev:docker`.

### 1. Install dependencies

```bash
pnpm install
```

`postinstall` automatically runs `prisma-generate`.

### 2. Configure environment

```bash
cp .env.example .env
```

At minimum set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `FRONTEND_URL`,
`NEXT_PUBLIC_BACKEND_URL`, and `BACKEND_INTERNAL_URL`. The defaults in `.env.example` assume the
frontend on `:4200` and the backend on `:3000`. See
[Configuration](../self-hosting/configuration.md) for the full reference.

### 3. Push the schema

```bash
pnpm run prisma-db-push
```

> **Note:** the project uses `prisma db push --accept-data-loss` — there are no SQL migration
> files; `schema.prisma` is the source of truth. This is safe on a fresh local database; be
> careful pointing it at an existing one.

### 4. Run

```bash
pnpm run dev               # extension + orchestrator + backend + frontend
# or individually:
pnpm run dev:backend       # backend only
pnpm run dev:frontend      # frontend only (port 4200)
pnpm run dev:orchestrator  # orchestrator only
```

Open **http://localhost:4200** and register the first account.

---

## After it's up

- **Connect channels** — channel OAuth credentials are configured per-tenant in **Settings → Channels**.
  See [Per-provider setup](../channels/setup-per-provider.md).
- **Configure AI** — set up your AI provider in **Settings → AI** (required; no env fallback).
  See [AI settings admin](../admin/ai-settings.md).
- **Enable background collection** — analytics and comment sync run in Temporal and require
  `RUN_CRON=true` on exactly one orchestrator instance. See
  [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## Common commands

```bash
pnpm run build             # build frontend + backend + orchestrator
pnpm run test              # full Vitest suite, per package
pnpm run prisma-generate   # regenerate the Prisma client after schema edits
pnpm run prisma-db-push    # push schema changes to the database
```

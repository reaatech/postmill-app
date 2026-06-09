# Run With Docker Compose

The repo ships a self-contained [`docker-compose.yaml`](../../docker-compose.yaml) that runs the
app together with PostgreSQL, Redis, and a full Temporal stack.

> **Verified against v3.6.0.**

---

## Quick start

```bash
docker compose up -d
```

Open **http://localhost:4007** and register the first account.

## Services in the compose file

| Service | Image | Role |
|---------|-------|------|
| `postiz` | `ghcr.io/gitroomhq/postiz-app:latest` | The app (backend + frontend + orchestrator). |
| `postiz-postgres` | `postgres:17-alpine` | Application database. |
| `postiz-redis` | `redis:7.2` | Cache, queues, rate limiting/idempotency. |
| `temporal` | `temporalio/auto-setup:1.28.1` | Temporal server (background jobs). |
| `temporal-postgresql` | `postgres:16` | Temporal's own database. |
| `temporal-elasticsearch` | `elasticsearch:7.17.27` | Temporal visibility store. |
| `temporal-ui` | `temporalio/ui:2.34.0` | Temporal web UI on `:8080`. |
| `temporal-admin-tools` | `temporalio/admin-tools` | `tctl`/CLI for Temporal admin. |
| `spotlight` | `ghcr.io/getsentry/spotlight` | Local error/trace viewer on `:8969`. |

Ports of note: the app is published on **`4007`** (container port `5000`); Temporal UI on `8080`;
Temporal frontend on `7233`.

## Use the fork image

The default compose file references the **upstream** image. To run this fork, point the `postiz`
service at the published fork image:

```yaml
services:
  postiz:
    image: ghcr.io/reaatech/postiz-app:latest
```

## Configuration

Environment is set inline under the `postiz` service's `environment:` block. The required values
are already present (`MAIN_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `JWT_SECRET`,
`DATABASE_URL`, `REDIS_URL`, `BACKEND_INTERNAL_URL`, `TEMPORAL_ADDRESS`).

> **Warning:** change `JWT_SECRET` to a unique random value before exposing the instance. It signs
> JWTs and encrypts stored channel/AI credentials.

Most provider and feature settings can be left blank and configured later in the admin UI rather
than as environment variables — see [Channels admin](../admin/channels.md) and
[AI settings admin](../admin/ai-settings.md). For the full variable reference see
[Configuration](./configuration.md).

### Storage

The compose file uses a local `/uploads` volume. Storage is configured per-tenant in-app via
**Settings → Storage** (S3, R2, B2, IDrive e2, or local disk). The global `STORAGE_PROVIDER` and
`CLOUDFLARE_*` env vars are removed in v3.6.0.

### Persistent volumes

`postiz-config`, `postiz-uploads`, `postgres-volume`, and `postiz-redis-data` persist config,
uploads, the database, and Redis respectively.

## Background jobs (RUN_CRON)

Scheduled publishing works out of the box, but the **daily analytics collection** and **comment
sync** workflows only run when `RUN_CRON=true` is set on the orchestrator. In the single-container
compose setup, add `RUN_CRON: 'true'` to the `postiz` service's environment. If you ever scale to
multiple instances, set it on **exactly one**. See
[Temporal & background jobs](./temporal-and-cron.md).

## Production notes

- Put the app behind a TLS-terminating reverse proxy and set `FRONTEND_URL` /
  `NEXT_PUBLIC_BACKEND_URL` to the public HTTPS URL.
- Back up `postgres-volume` (the app database) and your uploads.
- The schema is applied with `prisma db push` — see
  [Configuration](./configuration.md) for the implications.

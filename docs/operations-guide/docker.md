# Docker Deployment

The `docker-compose.yaml` at the repository root defines the full production stack in 9 services
across two bridge networks. This file is the canonical deployment reference and is used as-is or
adapted to Coolify, Portainer, Kubernetes, or a raw `docker compose up`.

## Quick start

```bash
# Clone the repository
git clone https://github.com/reaatech/postmill-app.git
cd postmill-app

# Copy and edit environment
cp .env.example .env
# Edit .env with your values (see Configuration)

# Start everything
docker compose up -d
```

The application will be available at `http://localhost:4007`. Temporal UI will be at
`http://localhost:8080`.

## Service inventory

### Application stack (postmill-network)

| Service            | Image                                  | Port            | Purpose |
|--------------------|----------------------------------------|-----------------|---------|
| `postmill`         | `ghcr.io/reaatech/postmill-app:latest` | `4007:5000`     | API + frontend (Next.js server on port 5000 internally) |
| `postmill-postgres`| `postgres:17-alpine`                   | —               | Application database |
| `postmill-redis`   | `redis:7.2`                            | —               | Session cache, throttle, analytics cache |
| `spotlight`        | `ghcr.io/getsentry/spotlight:latest`   | `8969:8969`     | Sentry debug proxy (dev/monitoring) |

**Postmill container environment** (the minimum required):

```yaml
MAIN_URL: 'http://localhost:4007'
FRONTEND_URL: 'http://localhost:4007'
NEXT_PUBLIC_BACKEND_URL: 'http://localhost:4007/api'
JWT_SECRET: 'your-random-secret-here'
DATABASE_URL: 'postgresql://postmill-user:postmill-password@postmill-postgres:5432/postmill-db-local'
REDIS_URL: 'redis://postmill-redis:6379'
BACKEND_INTERNAL_URL: 'http://localhost:3000'
TEMPORAL_ADDRESS: 'temporal:7233'
IS_GENERAL: 'true'
DISABLE_REGISTRATION: 'false'
STORAGE_PROVIDER: 'local'
UPLOAD_DIRECTORY: '/uploads'
API_LIMIT: 600
```

### Temporal stack (temporal-network)

| Service                  | Image                                  | Port       | Purpose |
|--------------------------|----------------------------------------|------------|---------|
| `temporal`               | `temporalio/auto-setup:1.28.1`         | `7233:7233`| Temporal server (gRPC) |
| `temporal-postgresql`    | `postgres:16`                          | —          | Temporal persistence (user `temporal`, db `temporal`) |
| `temporal-elasticsearch` | `elasticsearch:7.17.27`                | —          | Visibility store (single-node, 256 MB heap) |
| `temporal-admin-tools`   | `temporalio/admin-tools:1.28.1-tctl-1.18.4-cli-1.4.1` | — | tctl + tcli |
| `temporal-ui`            | `temporalio/ui:2.34.0`                 | `8080:8080`| Web UI to inspect workflows |

### Networks

| Network            | Type   | Services |
|--------------------|--------|----------|
| `postmill-network` | bridge | postmill, postmill-postgres, postmill-redis, spotlight |
| `temporal-network` | bridge (named) | All Temporal services; the postmill container attaches here for gRPC |

### Volumes

| Volume               | Mount point             | Purpose |
|----------------------|-------------------------|---------|
| `postgres-volume`    | `/var/lib/postgresql/data` | Application Postgres data |
| `postmill-redis-data`| `/data`                 | Redis AOF/RDB persistence |
| `postmill-config`    | `/config/`              | Application runtime config |
| `postmill-uploads`   | `/uploads/`             | Uploaded media (when `STORAGE_PROVIDER=local`) |
| ephemeral (ES)       | `/var/lib/elasticsearch/data` | Temporal ES indices |
| ephemeral (Temporal PG) | `/var/lib/postgresql/data` | Temporal Postgres data |

> The Temporal Postgres and Elasticsearch volumes are **ephemeral** (not named volumes) — they
> are lost on `docker compose down -v`. For production, convert them to named volumes and
> configure regular backups.

The `:latest` tag shown above is suitable for quick-start. In production, pin a specific
version tag (e.g., `ghcr.io/reaatech/postmill-app:v3.7.0`) to get a known rollback target.

## RUN_CRON

The orchestrator runs inside the `postmill` container. To activate the three perpetual background
workflows, set `RUN_CRON=true` on **exactly one** instance:

```yaml
environment:
  RUN_CRON: 'true'
```

The perpetual workflows are:
- **Analytics collection** — daily sweep per org (channel snapshots, post snapshots, rollup/prune, watchlist probes)
- **Comments collection** — per-org comment sync (fetch, reply, prune, notify)
- **Missing post scanner** — hourly scan for stuck posts

If you run multiple replicas, **only one should have `RUN_CRON=true`** to avoid duplicate workflow
executions. See [Temporal & Cron](./temporal-and-cron.md) for details.

## Production hardening

### TLS reverse proxy

The `postmill` service listens on port 5000 (HTTP). In production, place it behind a reverse
proxy with TLS termination (nginx, Caddy, Traefik, or your cloud load balancer).

```nginx
# Example nginx
server {
    listen 443 ssl;
    server_name postmill.example.com;

    location / {
        proxy_pass http://127.0.0.1:4007;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

### Secrets management

Never commit `.env` to version control. Use Docker secrets, a `.env` file with restricted
permissions, or your orchestrator's secret store.

### Backups

At minimum, back up the `postgres-volume` volume and the `postmill-uploads` volume. See
[Backup & Retention](./backup-and-retention.md).

### Resource limits

Add resource constraints to the compose file for production:

```yaml
services:
  temporal-elasticsearch:
    deploy:
      resources:
        limits:
          memory: 512M
  postmill:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Temporal production config

The compose file uses `development-sql.yaml` for Temporal's dynamic config. For production,
replace with `development-cass.yaml` tuned for persistence and history retention. See
[Temporal's production deployment guide](https://docs.temporal.io/production-deployment).

## Migrating from a Postiz-branded deployment

If you previously ran the upstream Postiz-branded compose file, the v3.7.0 rename changed Docker
identifiers. The Postgres **data** volume (`postgres-volume`) was deliberately not renamed, so
your data persists. However:

1. The Postgres role changed from `postiz-user` to `postmill-user` and the database from
   `postiz-db-local` to `postmill-db-local`. If your Postgres volume was already initialised,
   you must create the new role/database manually or continue using the old names.
2. All `POSTIZ_*` env vars must be renamed to `POSTMILL_*`.
3. The container image changed to `ghcr.io/reaatech/postmill-app`.
4. The uploads volume was renamed `postiz-uploads` -> `postmill-uploads` — migrate your files
   or create a fresh volume.

See [Upgrading](./upgrading.md) for the full migration procedure.

> Verified against v3.7.0

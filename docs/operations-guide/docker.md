# Docker Deployment

The `docker-compose.yaml` at the repository root defines the full production stack. PostgreSQL and
Spotlight run in containers; Redis is expected as an external endpoint (e.g. Upstash). This file is
the canonical deployment reference and is used as-is or adapted to Coolify, Portainer, Kubernetes,
or a raw `docker compose up`.

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

The application will be available at `http://localhost:4007`.

## Service inventory

### Application stack (postmill-network)

| Service            | Image                                  | Port            | Purpose |
|--------------------|----------------------------------------|-----------------|---------|
| `postmill`         | `ghcr.io/reaatech/postmill-app:latest` | `4007:5000`     | API + frontend (Next.js server on port 5000 internally) |
| `postmill-postgres`| `postgres:17-alpine`                   | —               | Application database |
| `spotlight`        | `ghcr.io/getsentry/spotlight:latest`   | `8969:8969`     | Sentry debug proxy (dev/monitoring) |

**Postmill container environment** (the minimum required):

```yaml
MAIN_URL: 'http://localhost:4007'
FRONTEND_URL: 'http://localhost:4007'
NEXT_PUBLIC_BACKEND_URL: 'http://localhost:4007/api'
JWT_SECRET: 'your-random-secret-here'
DATABASE_URL: 'postgresql://postmill-user:postmill-password@postmill-postgres:5432/postmill-db-local'
# Redis is an external endpoint (e.g. Upstash). Provide a redis:// or rediss:// URL.
REDIS_URL: '${REDIS_URL}'
BACKEND_INTERNAL_URL: 'http://localhost:3000'
IS_GENERAL: 'true'
DISABLE_REGISTRATION: 'false'
UPLOAD_DIRECTORY: '/uploads'
MEDIA_UPLOAD_MAX_BYTES: '1073741824'
API_LIMIT: 600
```

### Networks

| Network            | Type   | Services |
|--------------------|--------|----------|
| `postmill-network` | bridge | postmill, postmill-postgres, spotlight |

### Volumes

| Volume               | Mount point             | Purpose |
|----------------------|-------------------------|---------|
| `postgres-volume`    | `/var/lib/postgresql/data` | Application Postgres data |
| `postmill-config`    | `/config/`              | Application runtime config |
| `postmill-uploads`   | `/uploads/`             | Uploaded media (always local) |

The `:latest` tag shown above is suitable for quick-start. In production, pin a specific
version tag (e.g., `ghcr.io/reaatech/postmill-app:v3.7.0`) to get a known rollback target.

## Background jobs

Background jobs are handled by Inngest. Set the required environment variables on the `postmill`
service:

```yaml
environment:
  USE_INNGEST: 'true'
  INNGEST_EVENT_KEY: '...'
  INNGEST_SIGNING_KEY: '...'
  INNGEST_SERVE_ORIGIN: 'https://postmill.example.com'
```

For local development, use the Inngest dev server instead:

```yaml
environment:
  INNGEST_DEV: '1'
  INNGEST_BASE_URL: 'http://localhost:8288'
```

The main scheduled functions are:
- **Analytics collection** — daily sweep per org (channel snapshots, post snapshots, rollup/prune, watchlist probes)
- **Comments collection** — per-org comment sync (fetch, reply, prune, notify)
- **Missing post scanner** — hourly scan for stuck posts

See [Inngest & Cron](./inngest-and-cron.md) for details.

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
permissions, or your orchestration platform's secret store.

### Backups

At minimum, back up the `postgres-volume` volume and the `postmill-uploads` volume. See
[Backup & Retention](./backup-and-retention.md).

### Resource limits

Add resource constraints to the compose file for production:

```yaml
services:
  postmill:
    deploy:
      resources:
        limits:
          memory: 2G
```

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

> Verified against v3.8.2

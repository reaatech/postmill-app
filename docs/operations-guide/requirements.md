# Requirements

## Hardware sizing

Postmill is a Node.js application backed by Postgres and Redis. The resource-intensive components are
**Temporal** and its **Elasticsearch** dependency.

| Tier      | Users  | CPU  | RAM    | Disk   | Notes |
|-----------|--------|------|--------|--------|-------|
| Minimum   | 1-5    | 2 vCPU | 4 GB  | 20 GB  | Temporal+ES need ~1.5 GB on their own |
| Small     | 5-50   | 4 vCPU | 8 GB  | 50 GB  | Comfortable for most self-hosters |
| Medium    | 50-200 | 8 vCPU | 16 GB | 100 GB | Add more RAM for ES |
| Large     | 200+   | 16 vCPU+ | 32 GB+ | 200 GB+ | Scale ES and Postgres independently |

The heavy pieces:
- **Elasticsearch 7.17.27** — Temporal's visibility store needs at least 256 MB heap; with many
  workflows this grows. A 512 MB heap is comfortable for moderate use.
- **PostgreSQL 17** — the application database is typically modest (< 5 GB for small instances),
  but grows with analytics snapshots and media metadata. Temporal's Postgres 16 instance grows
  with workflow history; configure retention policies in Temporal's dynamic config.
- **Redis 7** — negligible memory (< 100 MB) unless analytics cache loads dozens of orgs.

## Software prerequisites

### Build toolchain

| Tool      | Required version    | Notes |
|-----------|---------------------|-------|
| Node.js   | `>=22.12.0 <23.0.0` | See `engines` in `package.json` |
| pnpm      | `10.6.1`            | Specified in `packageManager`; other versions may silently break |
| Docker    | Recent stable       | Only needed for Docker Compose deployment |
| git       | Any                 | For cloning the repository |

### Runtime dependencies

| Software              | Version     | Role |
|-----------------------|-------------|------|
| PostgreSQL            | 17 (app), 16 (Temporal) | Application data + Temporal persistence |
| Redis                 | 7.2         | Session cache, throttle store, analytics cache |
| Temporal              | 1.28.1      | Workflow engine |
| Elasticsearch         | 7.17.27     | Temporal visibility store |
| Resend (optional)     | —           | Transactional email; account if using email features |

### Object storage (optional)

For production use with large media, choose one:

| Provider            | Notes |
|---------------------|-------|
| Local disk          | Default; 5 GB quota per org. Simple but not redundant. |
| Cloudflare R2       | S3-compatible, no egress fees |
| AWS S3              | S3-native API |
| Backblaze B2        | S3-compatible, low storage cost |
| IDrive e2           | S3-compatible |

Storage providers are configured **per-organization** via the Settings UI, not environment
variables. See [Storage Setup](./storage.md) and [Configuration](./configuration.md).

## Network and URL requirements

- The application must be reachable at the URL you set in `FRONTEND_URL`. OAuth redirects from
  social providers resolve against this URL.
- The `BACKEND_INTERNAL_URL` must be reachable from within the container for Temporal activity
  callbacks and internal API calls. In Docker Compose, this is `http://localhost:3000`; behind a
  reverse proxy, set it to the internal backend address.
- **Outbound HTTPS** is required — all provider API calls and webhook dispatches go through
  `safeFetch`, which enforces HTTPS and blocks private/internal IPs (unless explicitly allowlisted
  via `SSRF_ALLOWED_PRIVATE_CIDRS` for self-hosted provider instances).
- Ensure your public IP is in the allow-list for any API tokens you create via the Public API
  settings.

## CLI commands

The `apps/commands` package provides NestJS CLI commands for operator tasks:

```bash
# Build the CLI
pnpm run commands:build:development

# Check configuration for issues
npx nestjs-command config:check

# Refresh all OAuth tokens
npx nestjs-command refresh

# Run the AI agent
npx nestjs-command run:agent
```

Run these inside the application container or with the same environment variables as the backend.

> Verified against v3.7.0

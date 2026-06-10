# Upgrading

## Clean upgrade path

The recommended upgrade process follows the immutable-infrastructure model: new container image,
same data volumes.

```
1. Read CHANGELOG -> 2. Back up -> 3. Bump image tag -> 4. Redeploy -> 5. Set new env vars
```

### 1. Read the CHANGELOG

Before every upgrade, read `CHANGELOG.md` at the new version tag. Note:

- **Breaking changes** — env var renames, Docker identifier changes, config relocation
- **New required env vars** — boot will fail if missing
- **Schema changes** — additive columns are safe; renames/drops need a manual plan
- **Deprecations** — removed env vars that must be migrated to in-app settings

### 2. Back up

Take a full backup before every upgrade. See [Backup & Retention](./backup-and-retention.md).

```bash
docker exec postmill-postgres pg_dump -U postmill-user postmill-db-local > pre_upgrade_$(date +%Y%m%d).sql
```

### 3. Bump the image tag

```yaml
# docker-compose.yaml or your deployment config
services:
  postmill:
    image: ghcr.io/reaatech/postmill-app:v3.7.0  # pin a specific tag, not :latest
```

Pinning specific tags gives you a known rollback target. Using `:latest` means every restart may
pull an untested version.

### 4. Redeploy

```bash
# Docker Compose
docker compose pull postmill
docker compose up -d postmill

# Coolify / Portainer / K8s
# Trigger a redeploy of the postmill service with the new image tag
```

The container runs `prisma-generate` on boot (via `postinstall`), regenerating the Prisma client
to match the schema baked into the new image. If the schema has new nullable/defaulted columns,
they are applied by the next manual `prisma-db-push`.

### 5. Set new env vars

Check the CHANGELOG for any new env vars required by the release. Add them to your `.env` file,
Docker Compose environment, or deployment config, then redeploy if needed.

## Postiz -> Postmill rename migration (v3.7.0)

If you're upgrading from a Postiz-branded deployment, the v3.7.0 rename introduced several
breaking changes.

### Env var renames

All `POSTIZ_*` variables are now `POSTMILL_*`. The old names are **not** read.

| Old name | New name |
|----------|----------|
| `POSTIZ_GENERIC_OAUTH` | `POSTMILL_GENERIC_OAUTH` |
| `POSTIZ_OAUTH_*` | `POSTMILL_OAUTH_*` |
| `POSTIZ_API_KEY` | `POSTMILL_API_KEY` |
| `POSTIZ_CONTAINER` | `POSTMILL_CONTAINER` |
| `NEXT_PUBLIC_POSTIZ_OAUTH_*` | `NEXT_PUBLIC_POSTMILL_OAUTH_*` |

### Docker identifiers

| Item | Old | New |
|------|-----|-----|
| Image | `ghcr.io/gitroomhq/postiz-app` | `ghcr.io/reaatech/postmill-app` |
| Container | `postiz` | `postmill` |
| Postgres role | `postiz-user` | `postmill-user` |
| Postgres DB | `postiz-db-local` | `postmill-db-local` |
| Volume (config) | `postiz-config` | `postmill-config` |
| Volume (uploads) | `postiz-uploads` | `postmill-uploads` |

The Postgres **data** volume (`postgres-volume`) was kept unchanged, so data inside it persists.
However, if your Postgres volume was already initialized with the old role/database, the new
compose file will create new ones. You have two options:

**Option A: Keep old names.** Edit the compose file's `DATABASE_URL`, `POSTGRES_USER`, and
`POSTGRES_DB` back to the old values.

**Option B: Migrate to new names.** Create the new role and database on the existing volume:

```bash
docker exec postmill-postgres psql -U postmill-user -d postmill-db-local -c "CREATE ROLE \"postmill-user\" WITH LOGIN PASSWORD 'postmill-password';" 2>/dev/null || true
docker exec postmill-postgres psql -U postmill-user -d postmill-db-local -c "CREATE DATABASE \"postmill-db-local\" OWNER \"postmill-user\";" 2>/dev/null || true
```

### Migrate uploads

If you were using local storage, the volume was renamed. Migrate the data:

```bash
# Create the new volume
docker volume create postmill-uploads

# Copy from old to new
docker run --rm -v postiz-uploads:/old -v postmill-uploads:/new alpine cp -a /old/. /new/
```

### Chat memory

The Mastra chat agent ID and memory store were renamed (`postiz` -> `postmill`). This orphans
persisted chat memory — a one-time reset for existing users. No data loss outside of chat history.

## Manual schema sync

The container runs `prisma-generate` on boot but does **not** run `prisma-db-push`. If a release
includes schema changes, you must apply them:

```bash
# Option 1: Use the helper script
./scripts/postmill-migrate.sh

# Option 2: Run directly in the container
docker exec postmill pnpm dlx prisma@6.5.0 db push --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma

# Option 3: With --accept-data-loss (DESTRUCTIVE — back up first!)
./scripts/postmill-migrate.sh --accept-data-loss
```

> **Always back up before `--accept-data-loss`.** See [Backup & Retention](./backup-and-retention.md)
> and [Database schema safety](../developer-docs/database.md).

### Schema change rules

Releases follow additive-schema-only rules so `prisma db push` against a live database usually
works without `--accept-data-loss`:

- New tables are always safe
- New columns are nullable or defaulted — safe
- Renames/drops are destructive and uncommon — noted prominently in the CHANGELOG when they occur

## Building from source

If you prefer to build the container image locally:

```bash
# Build the image
./var/docker/docker-build.sh

# Or with the docker-compose.dev.yaml for local development
docker compose -f docker-compose.dev.yaml up -d

# Build all apps from source
pnpm run build
```

## Per-release notes

### v3.7.0 -> v3.7.1

v3.7.1 removes the last `process.env` credential fallbacks and the env-migration services. All
channel and AI credentials now come **only** from the database (Settings -> Channels, Settings ->
AI), encrypted at rest.

**Seed-then-upgrade (if you still rely on channel/AI env vars).** On v3.7.0 the env-migration
services seed each org's database config from your env vars on every boot. So the safe path is:

1. Boot **once on v3.7.0** with your existing channel/AI env vars set — this seeds them into the
   database for every org.
2. Upgrade to v3.7.1. It reads only the database; the env vars are now ignored.
3. Remove the deprecated channel/AI env vars from your deployment config.

> Keep `ENCRYPTION_KEY` (or `JWT_SECRET`, if you never set `ENCRYPTION_KEY`) **stable** across the
> two boots — the seeded secrets are encrypted with it and won't decrypt if it changes.

**Google My Business credential change.** Before v3.7.1, GMB fell back to `YOUTUBE_CLIENT_ID` /
`YOUTUBE_CLIENT_SECRET` when `GOOGLE_GMB_CLIENT_ID` was not set. That implicit fallback is **gone** —
GMB now resolves only its own `gmb` channel config. If you ran GMB off the YouTube credentials
(without ever setting `GOOGLE_GMB_CLIENT_ID`), the seed step above won't create a `gmb` row, and GMB
connect/publish will return a "provider not configured" error after upgrade. Fix: enter Google My
Business credentials explicitly under Settings -> Channels (you can reuse the same Google Cloud
OAuth client you used for YouTube).

### Pre-v3.7.0 -> v3.7.0

See the Postiz -> Postmill rename migration section above.

### Pre-v3.6.0 -> v3.6.0

- `OPENAI_API_KEY` is no longer read by the AI layer; configure AI providers in Settings -> AI.
- Per-provider OAuth env vars (`LINKEDIN_CLIENT_ID`, `FACEBOOK_APP_ID`, etc.) deprecated; migrate
  to Settings -> Channels.
- Per-tenant storage replaces global `STORAGE_PROVIDER`/`CLOUDFLARE_*` vars; migrate to Settings
  -> Storage.

## Rollback

If an upgrade causes issues:

1. Set the image tag back to the previous version
2. Redeploy
3. Restore the database from the pre-upgrade backup if the upgrade applied destructive schema
   changes

## Related

- [Backup & Retention](./backup-and-retention.md) — backup before upgrade
- [Developer Docs: Database](../developer-docs/database.md) — schema management and safety

> Verified against v3.7.0

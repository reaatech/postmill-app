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

## Schema changes & rollback

The schema is applied with `prisma db push --accept-data-loss` — there are **no SQL migration
files and no down-migrations**. The schema file is the only source of truth, so the operational
discipline below replaces what a migration tool would otherwise give you (a backup, an
expand-contract path, and a drift check).

### Always back up first

Take a `pg_dump` **immediately before** any `db push`. This is your only rollback path — there is
no generated down-migration to reverse a push.

```bash
docker exec postmill-postgres pg_dump -U postmill-user postmill-db-local \
  > pre_push_$(date +%Y%m%d_%H%M%S).sql
```

### Adding a column

A new column must be **nullable** or carry a **default**. A required column without a default
breaks the push because existing rows have no value for it. New tables are always safe.

### Renames and drops — expand-contract

Under `db push` an in-place rename or drop is a `DROP + CREATE`, which loses data. Never rename or
drop a column or table in the same release that stops using it. Instead, spread the change across
releases:

1. **Expand** — add the new nullable column alongside the old one and deploy.
2. **Backfill** — copy data from the old column to the new one (add a one-time step to
   `BackfillService`, `libraries/nestjs-libraries/src/database/seeds/backfill.service.ts`).
3. **Switch** — point all reads and writes at the new column and deploy.
4. **Contract** — only once nothing references the old column (prove it with a grep) drop it in a
   later release, after taking the pre-push `pg_dump` above.

### Rollback

There is no down-migration. To roll back a destructive push, restore the pre-push `pg_dump`:

```bash
# Stop the app first so nothing writes during the restore
cat pre_push_YYYYMMDD_HHMMSS.sql | docker exec -i postmill-postgres \
  psql -U postmill-user postmill-db-local
```

Then redeploy the previous image tag (see [Rollback](#rollback) below for the full image rollback
flow).

### Drift check

After deploying, confirm the live database matches the committed schema. `prisma migrate diff`
exits `2` when there is a difference, `0` when there is none:

```bash
pnpm exec prisma migrate diff \
  --from-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma \
  --to-url "$DATABASE_URL" \
  --exit-code
```

The `mastra_*` tables are created at runtime by the Mastra chat agent, outside the Prisma schema,
so they always appear as out-of-schema drift — that is **expected noise**, not a real diff.

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

### v3.8.10 -> v3.9.0

v3.9.0 replaces the Temporal orchestrator with Inngest. The orchestrator app,
Temporal Server, Temporal PostgreSQL, and Temporal Elasticsearch are removed from
the stack. Background jobs (post publishing, analytics collection, comment sync,
email, autopost, token refresh, streaks) now run as Inngest functions served by
the backend at `/api/inngest`.

**No schema migration is required.** This release only removes code,
infrastructure, and environment variables.

**Removed environment variables:** Remove these from `.env`, `docker-compose.yaml`,
and any deployment config:

- `TEMPORAL_ADDRESS`
- `TEMPORAL_TLS`
- `TEMPORAL_API_KEY`
- `TEMPORAL_NAMESPACE`
- `RUN_CRON`
- `ORCHESTRATOR_PORT`
- `ENABLE_ES`
- `ES_SEEDS`
- `ES_VERSION`

**Added environment variables:**

| Variable | Required? | Notes |
|----------|-----------|-------|
| `INNGEST_EVENT_KEY` | Required for Inngest Cloud | Omit when running the local dev server (`INNGEST_DEV=1`) |
| `INNGEST_SIGNING_KEY` | Required for Inngest Cloud | Omit when running the local dev server |
| `INNGEST_SIGNING_KEY_FALLBACK` | Optional | Zero-downtime signing-key rotation |
| `INNGEST_ENV` | Optional | Branch environment name, e.g. `staging` |
| `INNGEST_DEV` | Local only | Set to `1` when using `npx inngest-cli@latest dev` |
| `INNGEST_BASE_URL` | Local only | Dev server URL, usually `http://localhost:8288` |
| `INNGEST_SERVE_ORIGIN` | Optional | Public backend origin if behind a reverse proxy |
| `INNGEST_SERVE_PATH` | Optional | Defaults to `/api/inngest` |
| `USE_INNGEST` | Cutover flag | Set to `true` to route background work to Inngest |

**Upgrade steps:**

1. Read the CHANGELOG for any additional v3.9.0 changes.
2. Back up your database.
3. Remove Temporal/Elasticsearch containers from `docker-compose.yaml`.
4. Replace the removed env vars with the Inngest variables above.
5. Set `USE_INNGEST="true"` after you have stopped the old orchestrator/Temporal
   stack to avoid double execution.
6. Bump the image tag and redeploy.
7. Verify the backend serves `/api/inngest` (HTTP 200) and that functions appear
   in the Inngest Cloud dashboard (or local dev server).

**Rollback:** If jobs fail after cutover:

1. Unset `USE_INNGEST`.
2. Redeploy the previous image tag and re-start the orchestrator/Temporal stack.
3. Cancel any in-flight Inngest runs from the Inngest Cloud dashboard or dev
   server, then re-dispatch affected posts manually if needed.

### v3.8.9 -> v3.8.10

v3.8.10 restructures identity, roles, and the provider-surface settings, and — unusually for this
fork — includes a **destructive schema push** that drops dead tables and migrated columns.

**Take a database snapshot before pushing the schema.** This is not optional:

```bash
docker exec postmill-postgres pg_dump -U postmill-user postmill-db-local > pre_3810_$(date +%Y%m%d).sql
pnpm run prisma-db-push   # applies the schema, including the drops below
```

**Dropped tables** (dead upstream marketplace/GitHub-stars subsystems, no reachable entrypoints):
`SocialMediaAgency`, `SocialMediaAgencyNiche`, `MessagesGroup`, `Messages`, `Orders`,
`OrderItems`, `PayoutProblems`, `ItemUser`, `GitHub`, `Star`, `Trending`, `TrendingLog`.

**Dropped columns/enums:**

- `User` profile/notification columns (`name`, `lastName`, `bio`, `pictureId`, `timezone`,
  `sendSuccessEmails`, `sendFailureEmails`, `sendStreakEmails`) — moved to the new `UserProfile`
  table (1:1), backfilled automatically.
- `User` marketplace columns (`audience`, `account`, `connectedAccount`) and `Post` marketplace
  fields (`submittedForOrderId`, `submittedForOrganizationId`, `approvedSubmitForOrder`).
- `UserOrganization.role` and the `Role` enum — replaced by `roleId` → `AppRole` (RBAC).
- `AIOrgProviderConfig.imageModel` / `AIProviderConfig.imageModel` — image generation moved to
  the Media provider system.
- Enums `OrderStatus`, `From`.
- The old `OrgShortLinkConfig` `@@unique([organizationId, identifier])` constraint (replaced by
  the per-account unique, enabling multiple accounts per provider).

**Automatic seed + backfill:** on first boot the backend idempotently seeds the RBAC catalog
(5 system roles, 80 permissions) and backfills `UserProfile` rows, `UserOrganization.roleId`
(legacy `SUPERADMIN → owner`, `ADMIN → admin`, `USER → member`), one default brand per org,
storage/short-link account fingerprints, and media provider configs from the old
`ragSettings.mediaProviders` blob. No manual data migration is required.

**New env vars:**

- `LOCAL_STORAGE_QUOTA_GB` (default `5`) — default soft quota for each org's local storage.

**Behaviour changes to verify after upgrading:**

- Login providers are now managed in `/admin` (super-admin) — env vars remain the bootstrap
  fallback, so existing env-configured logins keep working.
- Login now issues a refresh token backed by the `Session` table; users get a device list with
  per-session revoke under Profile → Security. Existing JWTs keep verifying (no forced re-auth).
- The post composer moved to `/schedule/post` and `/schedule/post/<id>` (was a modal).
- Local uploads are partitioned per tenant under `<UPLOAD_DIRECTORY>/<tenantId>/`; existing files
  remain readable at their recorded paths.

### v3.8.3 -> v3.8.4

**No schema changes.** v3.8.4 is a remediation release addressing bugs introduced in v3.8.3.

**If you use Amazon SES for email:** Re-test webhook delivery. SNS subscription confirmation
and bounce/complaint/delivery event processing were fixed in this release.

**No env var or config changes required.** A simple redeploy with the new image tag is sufficient.

### v3.8.2 -> v3.8.3

**Destructive schema change:** The `StorageProviderConfig.isDefault` column was dropped
(`prisma db push --accept-data-loss` required). The `POST /settings/storage/:id/set-default`
API route was deleted. LOCAL is now the implicit always-on base storage; all other providers
(S3/R2/B2/IDriveE2) mount onto it.

**Required actions:**
1. Run `pnpm run prisma-db-push` with `--accept-data-loss` to apply the column drop.
2. Remove any scripts or tooling that call the deleted `set-default` endpoint.
3. All other changes (Schedule rename, settings sort, profile in avatar menu) are additive
   — no env var changes needed.

**No env var changes.** Calendar → Schedule routing is a permanent redirect; no config needed.

### v3.8.1 -> v3.8.2

**What changed:**
- Avatars and all app-internal image writes now always use the org's LOCAL storage (not Cloudflare R2
  via env vars). The global-env `STORAGE_PROVIDER` and `CLOUDFLARE_*` vars are **removed**.
- Large media uploads stream through `/files/upload-server` (formerly `/media/upload-server`) with a configurable limit
  (`MEDIA_UPLOAD_MAX_BYTES`, default 1 GB). The presigned multipart Cloudflare R2 path is removed.
- Cloud providers (S3/R2/B2/IDrive e2) remain configurable per-organization in Settings → Storage,
  but they are **write-inert** for avatars and app-internal writes. Media-library uploads also go
  through local storage (see the §4.3 opt-out in the release notes if cloud writes are desired for
  media-library uploads).

**Required actions:**
1. Remove the following env vars from your `.env` and `docker-compose.yaml`:
   - `STORAGE_PROVIDER`
   - `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_KEY`, `CLOUDFLARE_SECRET_ACCESS_KEY`
   - `CLOUDFLARE_BUCKETNAME`, `CLOUDFLARE_BUCKET_URL`, `CLOUDFLARE_REGION`
2. Ensure `UPLOAD_DIRECTORY` is set and writable.
3. Optionally set `MEDIA_UPLOAD_MAX_BYTES` (default 1 GB).
4. The configuration checker still prints deprecation warnings for these vars if they remain in
   the environment — that is intentional and harmless; clean them up at your convenience.

**No data migration needed.** Existing `Integration.picture` URLs that point at the old
`CLOUDFLARE_BUCKET_URL` are left as-is; avatars are re-fetched and stored locally on the next token
refresh / reconnect.

### v3.8.0 -> v3.8.1

Email configuration moves from the old 2-provider env scheme (Resend / nodemailer) to a
standardized 6-provider system.

**Breaking changes:**

- **`RESEND_API_KEY` is removed.** Set `EMAIL_PROVIDER=resend` and `EMAIL_API_KEY` with your
  Resend API key.
- **`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS` are removed.**
  Set `EMAIL_PROVIDER=smtp` and use `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_SECURE`,
  `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`.
- **New `EMAIL_WEBHOOK_SECRET`** — required for delivery tracking on webhook-capable providers
  (Resend, SendGrid, Mailgun, Postmark, SES). See the Configuration reference for per-provider
  signing-secret locations.

**Impact:** Stale pre-v3.8.1 env vars (`RESEND_API_KEY`, `EMAIL_HOST`, etc.) are silently ignored.
The `EmptyAdapter` activates when no recognized `EMAIL_PROVIDER` is set, which means
activation/reset/invite/billing emails **stop sending**. After upgrading, verify `EMAIL_PROVIDER`
and the corresponding API key are configured.

**No schema migration required.** The new `EmailLog` Prisma model is additive.

### v3.7.1 -> v3.8.0

Short-link provider configuration moves from environment variables to per-org in-app settings.

**Breaking changes:**

- **Short-link env vars removed.** All 10 short-link env vars (`DUB_TOKEN`, `DUB_API_ENDPOINT`, `DUB_SHORT_LINK_DOMAIN`, `SHORT_IO_SECRET_KEY`, `KUTT_API_KEY`, `KUTT_API_ENDPOINT`, `KUTT_SHORT_LINK_DOMAIN`, `LINK_DRIP_API_KEY`, `LINK_DRIP_API_ENDPOINT`, `LINK_DRIP_SHORT_LINK_DOMAIN`) are no longer read. Admins must reconfigure their provider in **Settings → Shortlinks** after upgrading.
- **Existing short links in scheduled/published posts** are not migrated. Already-generated short link URLs in post content continue to work as opaque URLs — they will not break. New short links will be generated by the newly configured provider.
- **Kutt and LinkDrip providers are no longer available.** These two providers have been removed from the 19-provider adapter set. If you were using Kutt or LinkDrip, choose one of the remaining supported providers.

**No schema migration required.** The three new Prisma models (`OrgShortLinkConfig`, `ShortLink`, `ShortLinkSnapshot`) are additive with nullable/defaulted columns.

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

> Verified against v3.8.10

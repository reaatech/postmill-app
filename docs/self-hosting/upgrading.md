# Upgrading

How to move to a newer release of the fork, and how schema changes are applied.

> **Verified against v3.6.0.** This system runs in production — read the schema-change notes before
> upgrading a live instance.

---

## How releases work

- Versions are tagged on the repo and reflected in `package.json` (`version`) and
  [`CHANGELOG.md`](../../CHANGELOG.md).
- The fork image is published to `ghcr.io/reaatech/postmill-app`.
- On boot, the container runs `prisma db push` to sync the database to the schema baked into that
  image. So **deploying a new image applies its schema** automatically.

## The clean upgrade path (container deployments)

1. **Read the [CHANGELOG](../../CHANGELOG.md)** for the target version — note any schema changes or
   new required env vars.
2. **Back up first** — see [Backup & retention](./backup-and-retention.md).
3. **Bump the image tag** to the new version (e.g. in Coolify / your compose file) and redeploy.
4. The container boots and runs `prisma db push` to apply the new schema.
5. **Set any new env vars** the release introduced (check `.env.example` / the CHANGELOG).

> The fork's schema changes through v3.4.0 have been **additive** (new tables / nullable-or-defaulted
> columns), so these pushes are non-destructive. See [Database](../developers/database.md).

## Migrating from a Postiz-branded deployment

The Postmill rebrand renamed the env vars (`POSTIZ_*` → `POSTMILL_*`) and, in
`docker-compose.yaml`, the Docker volumes and the Postgres role/database. A
**fresh** install needs none of this. For an **existing** Compose install,
do the following **before** `docker compose up` with the new file:

1. **Env vars** — rename any `POSTIZ_*` variables you set to `POSTMILL_*`
   (e.g. `POSTIZ_OAUTH_CLIENT_ID` → `POSTMILL_OAUTH_CLIENT_ID`). The old names
   are no longer read.
2. **Uploads / config volumes** — the named volumes changed
   (`postiz-uploads` → `postmill-uploads`, `postiz-config` → `postmill-config`;
   `postiz-redis-data` is just cache and can be dropped). Either keep your old
   names by editing the new compose back to them, or copy the data across:
   ```bash
   docker volume create postmill-uploads
   docker run --rm -v postiz-uploads:/from -v postmill-uploads:/to alpine \
     sh -c 'cp -a /from/. /to/'
   # repeat for postiz-config -> postmill-config
   ```
3. **Postgres role/database** — the Postgres **data** volume (`postgres-volume`)
   is unchanged, so your data persists, but the role/db were renamed. Either
   keep the old credentials (set `POSTGRES_USER`/`POSTGRES_DB`/`DATABASE_URL`
   back to `postiz-*`), or rename them in-place once:
   ```sql
   ALTER ROLE "postiz-user" RENAME TO "postmill-user";
   ALTER DATABASE "postiz-db-local" RENAME TO "postmill-db-local";
   ```
   (Changing `POSTGRES_USER`/`POSTGRES_DB` alone does **not** rename them — Postgres
   only initializes those on an empty data dir.)

> Simplest path if you don't want to migrate: keep your existing volume names and
> DB credentials by editing them back into the new `docker-compose.yaml`. The
> rebrand of those identifiers is cosmetic — only the `POSTMILL_*` env-var rename
> is mandatory.

## Manual in-place schema sync

If you need to push the schema into a **running** container without a full redeploy, the repo ships
a helper:

```bash
./scripts/postmill-migrate.sh                     # safe additive sync (refuses data loss)
./scripts/postmill-migrate.sh --accept-data-loss  # allow drops/retypes (DESTRUCTIVE — back up first!)
```

It runs `prisma db push` for the schema baked into the running image. Set `POSTMILL_CONTAINER=<name>`
if your container isn't the default name.

> **Warning:** `--accept-data-loss` allows destructive diffs (drops/retypes). Only use it with a
> fresh backup. The default (no flag) refuses data loss.

For anything permanent, prefer the clean path above: edit `schema.prisma` → commit → tag → CI builds
the image → bump the tag → redeploy.

## Building from source

```bash
git pull
pnpm install            # runs prisma-generate via postinstall
pnpm run prisma-db-push # apply schema changes
pnpm run build          # frontend + backend + orchestrator
```

Match the toolchain in [Requirements](./requirements.md) (Node `>=22.12.0 <23`, pnpm `10.6.1`).

## Per-release upgrade notes

| From → To | Watch for |
|-----------|-----------|
| → v3.0 | First release with DB-backed channel config. Optionally run `scripts/migrate-channel-config.ts` to import env credentials into the DB. See [Channels admin](../admin/channels.md). |
| → v3.1 | Analytics snapshots + collection workflow. Set `RUN_CRON=true` on one orchestrator to populate the dashboard. |
| → v3.2 | Adds Tumblr/Pixelfed/PeerTube. No migration required. |
| → v3.3 | Calendar/post-detail reshape + social-comments models (additive). |
| → v3.4 | AI provider system (10 additive models). No action needed unless you want non-OpenAI providers; the `OPENAI_API_KEY` fallback keeps prior behaviour. See [AI settings admin](../admin/ai-settings.md). |
| → v3.6 | **Per-tenant everything.** Admin pages removed; settings moved to sidebar tabs. `OPENAI_API_KEY` and all per-provider OAuth env vars removed — configure providers in-app. Storage is per-tenant (S3/R2/B2/IDrive/local). New models: `MediaFolder`, `StorageProviderConfig`, `OrgProviderConfiguration`. `Organization` gains `localStorageQuotaBytes` (default 5 GB). **Additive schema** — no destructive changes. |

## Tracking upstream

This is a fork of `gitroomhq/postiz-app`. When pulling upstream changes, keep the fork's invariants
intact (AI env fallback, frozen legacy public analytics shape, provider-enablement safety) — see
[Contributing](../developers/contributing.md) — and verify the schema diff stays additive before any
production `db push`.

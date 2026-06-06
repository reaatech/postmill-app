# Upgrading

How to move to a newer release of the fork, and how schema changes are applied.

> **Verified against v3.4.0.** This system runs in production — read the schema-change notes before
> upgrading a live instance.

---

## How releases work

- Versions are tagged on the repo and reflected in `package.json` (`version`) and
  [`CHANGELOG.md`](../../CHANGELOG.md).
- The fork image is published to `ghcr.io/reaatech/postiz-app`.
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

## Manual in-place schema sync

If you need to push the schema into a **running** container without a full redeploy, the repo ships
a helper:

```bash
./scripts/postiz-migrate.sh                     # safe additive sync (refuses data loss)
./scripts/postiz-migrate.sh --accept-data-loss  # allow drops/retypes (DESTRUCTIVE — back up first!)
```

It runs `prisma db push` for the schema baked into the running image. Set `POSTIZ_CONTAINER=<name>`
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

## Tracking upstream

This is a fork of `gitroomhq/postiz-app`. When pulling upstream changes, keep the fork's invariants
intact (AI env fallback, frozen legacy public analytics shape, provider-enablement safety) — see
[Contributing](../developers/contributing.md) — and verify the schema diff stays additive before any
production `db push`.

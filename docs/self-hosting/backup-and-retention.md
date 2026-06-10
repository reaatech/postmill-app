# Backup & Retention

What to back up, why `db push` makes backups non-optional, and how analytics data is automatically
pruned/rolled up.

---

## What to back up

| Data | Where | Notes |
|------|-------|-------|
| **Application database** | PostgreSQL (`postgres-volume` in compose) | The source of truth — accounts, channels, posts, encrypted credentials, analytics snapshots, AI config. |
| **Uploads / media** | Local `UPLOAD_DIRECTORY` (`postmill-uploads`) or Cloudflare R2 | Back up the volume, or rely on R2's durability. |
| **`JWT_SECRET`** | Your env config | **Critical:** it encrypts stored channel/AI credentials. Lose it and those credentials become undecryptable. |

> Temporal's own database (separate Postgres in the compose stack) holds in-flight workflow state.
> Application data lives in the app's Postgres — that's the one to protect.

## Why backups are non-negotiable here

Schema is applied with `prisma db push` (no SQL migration files). A push reconciles the live DB to
the schema and, with `--accept-data-loss`, **will drop/alter** to do so.

> **Warning:** always take a database backup before any `db push --accept-data-loss` or before
> running `./scripts/postmill-migrate.sh --accept-data-loss`. See [Upgrading](./upgrading.md) and
> [Database](../developers/database.md).

## Backing up Postgres

A standard logical dump works. For the bundled compose Postgres:

```bash
docker exec postmill-postgres pg_dump -U postmill-user postmill-db-local > postmill-backup.sql
```

Restore into a fresh database with `psql`. Adapt the container name / credentials to your setup.

## Analytics retention & rollup (automatic)

The analytics collection workflow keeps its tables bounded each daily sweep. This is **data
lifecycle**, not backup — old detail is summarized/pruned by design.

| Knob | Default | Effect |
|------|---------|--------|
| `ANALYTICS_DAILY_RETENTION_DAYS` | `548` (~18 months) | Raw daily channel snapshots older than this roll up into one weekly row per `(integration, metric, ISO week)` — flow metrics summed, stock metrics keeping the week's latest. |
| `ANALYTICS_POST_RETENTION_DAYS` | `90` | Per-post snapshots older than this are pruned. |

Values are read per run; invalid values fall back to the defaults. Weekly aggregates stay compatible
with the dashboard's range queries, so range totals are preserved after rollup. Mechanics:
[Temporal & background jobs](./temporal-and-cron.md).

> **Note:** if you need to retain raw daily/post detail longer for compliance, raise these values
> **before** the data ages past the window — rollup/prune is not reversible from within the app.
> Keep database backups for anything you must be able to reconstruct.

## Restore checklist

1. Restore the Postgres dump into a fresh database.
2. Restore uploads (or confirm R2 access).
3. Set the **same `JWT_SECRET`** as the original instance, or stored credentials won't decrypt.
4. Point the app at the restored DB/Redis and boot — it will `prisma db push` to the image's schema.
5. Verify channels still authorize and (if used) `RUN_CRON=true` is set on one orchestrator.

# Backup & Retention

Postmill uses `prisma db push --accept-data-loss` to apply schema changes. There are **no SQL
migration files**. This means backups are non-negotiable: a schema push can force destructive
diffs against the live database, and without a backup there is no rollback path.

## What to back up

### 1. PostgreSQL database (application)

The primary data store. Contains users, organizations, posts, integrations, tokens, analytics
snapshots, comments, and all configuration.

```bash
# From the Docker host
docker exec postmill-postgres pg_dump -U postmill-user postmill-db-local > postmill_$(date +%Y%m%d).sql

# Or with connection string
pg_dump "$DATABASE_URL" > postmill_$(date +%Y%m%d).sql
```

Schedule this daily. Keep at least 7 days of backups.

### 2. Upload directory

All uploaded media (images, videos, audio). If using local storage, back up the volume:

```bash
# From the Docker host
docker run --rm -v postmill-uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

If using cloud object storage (R2, S3, B2, IDrive e2), ensure your bucket has versioning and/or
cross-region replication enabled.

### 3. JWT_SECRET and ENCRYPTION_KEY

These secrets encrypt all OAuth tokens, AI provider credentials, and storage credentials at rest.
**If you lose them, every encrypted value in the database becomes unrecoverable.** Store them:

- In a password manager or secrets vault
- In a `.env` file with restricted permissions, outside the backup bundle
- Never in the database backup alone — if you restore to a fresh instance with a different
  `JWT_SECRET`, all tokens will fail to decrypt

### 4. Temporal Postgres

Temporal persists workflow state in its own Postgres database. While workflow history is
recoverable (workflows are idempotent), backing it up avoids replay storms on restore.

```bash
docker exec temporal-postgresql pg_dump -U temporal temporal > temporal_$(date +%Y%m%d).sql
```

## What not to back up

- **Redis** — cache only; data is rebuilt on restart. AOF/RDB persistence is useful for avoiding
  cold-cache latency but is not a backup.
- **Temporal Elasticsearch** — visibility index, rebuilt from Temporal Postgres on restart.
- **node_modules** or build artifacts

## Automated data retention

Postmill handles analytics data retention automatically through Temporal workflows. You do not
need to run manual cleanup queries.

| Data | Retention | Mechanism |
|------|-----------|-----------|
| Daily `AnalyticsSnapshot` rows | 548 days (~18 months) by default | Rolled into weekly rows by `analyticsCollectionWorkflow` |
| `PostAnalyticsSnapshot` rows | 90 days by default | Pruned by `analyticsCollectionWorkflow` |
| Social comments | 90 days by default | Soft-deleted by `commentsCollectionWorkflow` |

Tune retention with `ANALYTICS_DAILY_RETENTION_DAYS`, `ANALYTICS_POST_RETENTION_DAYS`, and
`SOCIAL_COMMENT_RETENTION_DAYS`. See [Temporal & Cron](./temporal-and-cron.md) for how the
workflows operate.

## Why backups are critical with `db push --accept-data-loss`

Postmill's schema management model (`prisma db push --accept-data-loss`) means:

- Adding a nullable/defaulted column is safe and does not need a backup.
- **Renaming or dropping a column is destructive** — Prisma sees the new schema, compares it to
  the live database, and drops/mutates columns to match. There is no undo.
- Adding a required column without a default **breaks the push** against a live database (Prisma
  refuses).
- Schema changes are applied on container boot (`postinstall` runs `prisma-generate`, but actual
  `prisma-db-push` is manual or scripted). Always back up before running `prisma-db-push` manually.

The `postmill-migrate.sh` script (`scripts/postmill-migrate.sh`) wraps `prisma db push` with a
reminder to back up first when using `--accept-data-loss`:

```bash
# Safe additive sync (refuses data loss)
./scripts/postmill-migrate.sh

# Destructive — BACK UP FIRST
./scripts/postmill-migrate.sh --accept-data-loss
```

## Restore checklist

1. **Stop the application** — prevent write traffic during restore
2. **Restore Postgres**:
   ```bash
   docker exec -i postmill-postgres psql -U postmill-user postmill-db-local < postmill_20260609.sql
   ```
3. **Restore uploads**:
   ```bash
   docker run --rm -v postmill-uploads:/data -v $(pwd):/backup alpine tar xzf /backup/uploads_20260609.tar.gz -C /data
   ```
4. **Verify `JWT_SECRET` and `ENCRYPTION_KEY`** match the values from the backup:
   - If you changed `JWT_SECRET` since the backup, all encrypted tokens will fail to decrypt.
   - Test by logging in and checking that connected channels still work.
5. **Restore Temporal Postgres** (optional but recommended):
   ```bash
   docker exec -i temporal-postgresql psql -U temporal temporal < temporal_20260609.sql
   ```
6. **Start the application** and verify:
   - Users can log in
   - Channels are connected (no auth errors)
   - Uploaded media is accessible
   - Temporal workflows are visible in the UI
7. **Take a fresh post-restore backup**

## Backup automation example

```bash
#!/usr/bin/env bash
# /etc/cron.daily/postmill-backup
set -euo pipefail
BACKUP_DIR="/var/backups/postmill"
DATE=$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR"

docker exec postmill-postgres pg_dump -U postmill-user postmill-db-local > "$BACKUP_DIR/db_$DATE.sql"
docker run --rm -v postmill-uploads:/data -v "$BACKUP_DIR":/backup alpine tar czf "/backup/uploads_$DATE.tar.gz" -C /data .

# Keep 7 days
find "$BACKUP_DIR" -name '*.sql' -mtime +7 -delete
find "$BACKUP_DIR" -name '*.tar.gz' -mtime +7 -delete
```

> Verified against v3.7.0

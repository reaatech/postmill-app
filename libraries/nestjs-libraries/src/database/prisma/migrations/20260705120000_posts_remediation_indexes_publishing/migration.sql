-- AlterEnum
-- 0.7: additive enum value for the atomic publish state-claim (QUEUE -> PUBLISHING).
-- NOTE (ops): `ALTER TYPE ... ADD VALUE` inside a transaction requires PostgreSQL >= 12
-- (Prisma wraps each migration in a transaction). The new value is only *added* here,
-- not *used* by the statements below, so there is no in-transaction "unsafe use of new
-- value" error. Safe on the project's Postgres (>=12).
ALTER TYPE "State" ADD VALUE 'PUBLISHING';

-- CreateIndex
-- 4.3c: additive indexes (index-only, migration-safe — no backfill).
-- NOTE (ops): these are non-CONCURRENT CREATE INDEX (CONCURRENTLY cannot run inside
-- Prisma's transactional migration). Each takes a brief ACCESS EXCLUSIVE lock while the
-- index builds. `Errors` can be large in production (one row per publish failure), so
-- expect a short write-stall on that table at `migrate deploy` time. Acceptable for the
-- boot-time apply; if `Errors` is very large, build the index manually with
-- `CREATE INDEX CONCURRENTLY` out-of-band first, then this statement becomes a no-op.
CREATE INDEX "Errors_postId_idx" ON "Errors"("postId");

-- CreateIndex
CREATE INDEX "AutoPost_organizationId_idx" ON "AutoPost"("organizationId");

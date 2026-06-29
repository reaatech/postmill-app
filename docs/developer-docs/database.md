# Database

Postmill uses PostgreSQL with Prisma 6.5.0 as the ORM. The schema is the single source of truth —
there are **no SQL migration files**.

---

## Schema Location

```
libraries/nestjs-libraries/src/database/prisma/schema.prisma
```

---

## Schema Application

Schema changes are applied with:

```bash
pnpm run prisma-db-push
```

This runs `prisma db push --accept-data-loss`. Because the push can force destructive diffs
against the live production DB, every schema change must be reviewed for safety.

After editing the schema, always regenerate the Prisma client:

```bash
pnpm run prisma-generate
```

This also runs automatically after `pnpm install` via a `postinstall` script.

---

## Schema-Change Safety Rules

| Rule | Rationale |
|---|---|
| Add columns as **nullable** or with a **default value** | A new required column without a default breaks `db push` because existing rows have no value |
| Never rename columns or tables in-place | `db push` treats a rename as `DROP old + CREATE new` — data is lost |
| Unused columns/models should be soft-deprecated (comment + ignore), not dropped | Same reason as above; drops are destructive |
| Renames/drops need an **expand-contract plan** | Deploy the new column, backfill data, switch reads, then remove the old column in a follow-up |
| Always test `prisma-generate` after edits | Prevents type mismatches between the client and the schema |

> **Operator runbook.** The step-by-step backup, expand-contract, rollback, and drift-check
> procedure for applying schema changes to a live database lives in
> [Upgrading → Schema changes & rollback](../operations-guide/upgrading.md#schema-changes-rollback).

---

## Schema-Change Workflow

Because `db push` applies the diff with `--accept-data-loss` and there are no reviewable SQL
migration files, every schema edit is run through a **reviewable diff + destructive guard** before it
is pushed:

```bash
# 1. Edit the schema
$EDITOR libraries/nestjs-libraries/src/database/prisma/schema.prisma

# 2. Generate the exact forward SQL the push will run, and commit it for review.
#    (Requires DATABASE_URL pointing at a DB that reflects the current/pre-change state.)
pnpm run prisma-schema-diff > dev/schema-changes/<short-description>.sql

# 3. Guard the diff — blocks DROP TABLE / DROP COLUMN / DROP CONSTRAINT and
#    ADD COLUMN ... NOT NULL without DEFAULT.
pnpm run prisma-schema-check --file dev/schema-changes/<short-description>.sql

# 4. Apply locally + regenerate the client.
pnpm run prisma-db-push
pnpm run prisma-generate
```

- **`prisma-schema-diff`** = `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel
  <schema> --script` — the forward SQL only (no rollback).
- **`prisma-schema-check`** runs `scripts/schema-destructive-guard.mjs` (Node, no deps). It reads SQL
  from `--file <path>` (or stdin) and **exits 1** if it finds `DROP TABLE`/`DROP COLUMN`/`DROP
  CONSTRAINT` or `ADD COLUMN ... NOT NULL` without a `DEFAULT`.
- **Destructive changes** (drops, in-place renames, a new required column) must follow an
  **expand/contract** plan — add the new shape, backfill, switch reads/writes, then drop the old
  shape in a follow-up — and the guard must be explicitly overridden with
  `ALLOW_DESTRUCTIVE_SCHEMA=true` to acknowledge the data-loss risk:

  ```bash
  ALLOW_DESTRUCTIVE_SCHEMA=true pnpm run prisma-schema-check --file dev/schema-changes/<drop>.sql
  ```

### CI enforcement

`.github/workflows/test.yml` re-runs the guard on every PR: after the **Schema drift check** it diffs
the PR schema against `origin/main`'s schema and runs `schema-destructive-guard.mjs --file` on the
result, so a destructive schema change cannot merge unreviewed. The guard is also wired to fail
without the `ALLOW_DESTRUCTIVE_SCHEMA` override in CI.

> **Destructive pushes are exceptional.** v3.8.10 executed a single reviewed destructive push
> (dropping the dead marketplace/stars models, the legacy `UserOrganization.role` enum column, the
> migrated `User` profile columns, and the `imageModel` columns) — only after every reader/writer
> had been cut over, a grep proved zero source references, and a **DB snapshot was taken
> immediately before the push**. Follow that procedure for any future drop; see
> [Upgrading](../operations-guide/upgrading.md#v3-8-9-v3-8-10).

---

## Repository-Only Prisma Access

**Only repositories** may call Prisma directly. Repositories live under:

```
libraries/nestjs-libraries/src/database/prisma/<domain>/
```

Each domain has its own repository directory. Repositories extend `PrismaRepository`:

```ts
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class PostsRepository extends PrismaRepository<'post'> {
  // ...
}
```

The layering rule is strict:

```
Controller → Service/Manager → Repository → Prisma
```

Controllers and services must **never** import `PrismaClient` or call Prisma methods directly. When
one service needs data from another domain, it must call that domain's **service**, not its
repository.

### Available Repository Directories

| Directory | Repository |
|---|---|
| `ai-rag/` | RAG index operations (raw SQL for vector side table) |
| `ai-settings/` | AI provider config, spend logs |
| `analytics/` | Snapshot queries and rollup |
| `announcements/` | System announcements |
| `api-keys/` | Per-user hashed API keys |
| `audit/` | Audit log writes |
| `auth-providers/` | Platform login provider config (`AuthProviderConfig`) |
| `autopost/` | AutoPost CRUD |
| `brands/` | Brand profiles (`AIBrandProfile`, many-per-org) |
| `campaigns/` | Campaign CRUD + post association |
| `emails/` | Email send-log lifecycle |
| `integrations/` | Integration/plug/webhook management |
| `media/` | Media CRUD, folder operations, multipart uploads |
| `media-providers/` | Per-org media provider config (`MediaProviderConfig`) |
| `notifications/` | Notification delivery |
| `oauth/` | OAuth app and authorization management |
| `organizations/` | Organization and user-org relationship |
| `posts/` | Post CRUD, state transitions, recursive queries |
| `provider-configs/` | `OrgProviderConfiguration` and legacy `ProviderConfiguration` |
| `roles/` | RBAC roles and permissions (`AppRole`/`Permission`) |
| `sets/` | Content set management |
| `short-links/` | Per-org short-link provider config |
| `signatures/` | Signature management |
| `social-comments/` | Social comment sync, read-state tracking |
| `storage/` | Storage provider config (S3, R2, B2, etc.) |
| `subscriptions/` | Billing subscriptions |
| `users/` | User CRUD, profiles (`UserProfile`), sessions |
| `watchlist/` | Competitor account and metric tracking |
| `webhooks/` | Webhook CRUD + integration-webhook linking |

---

## Encryption at Rest

Secrets stored in the database (OAuth tokens, API keys, credentials) are encrypted with AES-256-GCM
via `EncryptionService`. Encrypted values use a `v2:` prefix. The service uses a
`ENCRYPTION_KEY` env var or falls back to deriving from `JWT_SECRET`.

**Single-key model.** Encryption uses **one deployment-wide key** — `ENCRYPTION_KEY` if set,
otherwise `sha256(JWT_SECRET)` (see `getEncryptionKey()` in
`libraries/helpers/src/auth/auth.service.ts`). There is **no per-organization crypto key**. An
`organizationId` column scopes where a ciphertext is *stored*, not how it is encrypted; cross-org
isolation is enforced by **query scoping**, not cryptography. Every encrypted row in the
deployment decrypts with the same key.

`EncryptionService` (used for per-org domain rows) is a thin wrapper over
`AuthService.fixedEncryption`/`fixedDecryption` (used for global rows). The split is an
**implementation detail** — both paths derive the identical key and produce the identical `v2:`
GCM envelope. Use the route that matches how a given row was written; never mix the two for the
same row.

Models with encrypted fields:
- `Integration` — `token`, `refreshToken`
- `OrgProviderConfiguration` — `clientId`, `clientSecret`, `additionalConfig`
- `AIOrgProviderConfig` — `credentials`
- `StorageProviderConfig` — `credentials`
- `OrgShortLinkConfig` — `credentials`
- `MediaProviderConfig` — `credentials`
- `AuthProviderConfig` — `clientId`, `clientSecret`
- `OAuthApp` — `clientSecret`
- `OAuthAuthorization` — `accessToken`, `refreshToken`

Refresh tokens for login sessions are **hashed**, not encrypted — `Session.tokenHash` stores
`sha256(refreshToken)`; the token itself is never persisted.

---

## PrismaService

`PrismaService` extends `PrismaClient` and implements `OnModuleInit` / `OnModuleDestroy` for
lifecycle management. It emits query-level log events for debugging.

`PrismaRepository<T>` is a generic base class that provides typed access to a single Prisma model.
`PrismaTransaction` wraps `$transaction` for multi-repository transactional workflows.

---

## Connection-Pool Tuning

`PrismaService` optionally tunes the Prisma client's connection pool from environment variables. When
**either** is set, the corresponding query parameter is appended to `DATABASE_URL` before it is
handed to `PrismaClient`; when **both are unset** the datasource URL — and therefore the default pool
behaviour — is **byte-for-byte unchanged**.

| Env var | Prisma param | Effect |
|---|---|---|
| `DATABASE_CONNECTION_LIMIT` | `connection_limit` | Max connections this process opens to Postgres |
| `DATABASE_POOL_TIMEOUT` | `pool_timeout` | Seconds a query waits for a free pool connection before erroring |

**Recommended starting values.** Prisma defaults `connection_limit` to `num_physical_cpus * 2 + 1`
per process. Size the pool against Postgres's own `max_connections` and **remember the separate
Inngest worker shares the same database** — every backend replica *and* the worker each open their own
pool, so the aggregate must stay under `max_connections` (leaving headroom for admin/migration
connections):

```
total_connections ≈ (backend_replicas + inngest_workers) × DATABASE_CONNECTION_LIMIT
```

A reasonable start for a small/medium deployment: `DATABASE_CONNECTION_LIMIT=10`,
`DATABASE_POOL_TIMEOUT=20`. Raise the limit only after confirming Postgres `max_connections` (or the
pgBouncer pool) has room across **all** backend replicas plus the Inngest worker. When fronted by
pgBouncer in transaction mode, set a low per-process limit and let the bouncer pool.

> Verified against v3.8.11

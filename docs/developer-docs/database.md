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
| `third-party/` | Third-party API key management |
| `users/` | User CRUD, profiles (`UserProfile`), sessions |
| `watchlist/` | Competitor account and metric tracking |
| `webhooks/` | Webhook CRUD + integration-webhook linking |

---

## Encryption at Rest

Secrets stored in the database (OAuth tokens, API keys, credentials) are encrypted with AES-256-GCM
via `EncryptionService`. Encrypted values use a `v2:` prefix. The service uses a
`ENCRYPTION_KEY` env var or falls back to deriving from `JWT_SECRET`.

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

> Verified against v3.8.10

# Database

A single Prisma schema is the source of truth, applied with **`prisma db push`**. There are **no SQL
migration files**.

> **Verified against v3.4.0.** Prisma 6.5.0. Schema:
> `libraries/nestjs-libraries/src/database/prisma/schema.prisma`.

---

## The model

```bash
pnpm run prisma-generate   # regenerate the client after editing schema.prisma
pnpm run prisma-db-push    # apply schema to the DB (prisma db push --accept-data-loss)
```

Because pushes can force destructive diffs against a live production database, follow these rules.

## Schema-change safety

> **Warning:** `db push --accept-data-loss` will drop/alter to make the DB match the schema. On
> production this is destructive if you're not careful.

- **Add columns as nullable or defaulted.** A new **required** column without a default breaks the
  push.
- **Renames and drops are destructive** under `db push`. Use an expand-contract / manual backfill
  plan instead of a bare rename.
- **Run `prisma-generate`** after editing the schema so the client stays in sync (also runs on
  `postinstall`).

## Repository access only

Only repositories touch Prisma (`*.repository.ts` under
`nestjs-libraries/src/database/prisma/<domain>/`). Services and controllers go through repositories.
See [Backend conventions](./backend.md).

## Domains in the schema

The schema covers core scheduling (`Organization`, `User`, `Integration`, `Post`, `Media`),
analytics (`AnalyticsSnapshot`, `PostAnalyticsSnapshot`), provider config
(`ProviderConfiguration`), social comments (`SocialComment`, `PostCommentRead`), the 10 AI models
(`AIProviderConfig`, `AISystemSettings`, …), billing, webhooks, OAuth apps, and Mastra agent
persistence (`mastra_*`). See [Data model](../reference/data-model.md) for the grouped list.

## Fork additions that needed schema changes

| Feature | Models added | Migration note |
|---------|--------------|----------------|
| Persisted analytics (v3.1) | `AnalyticsSnapshot`, `PostAnalyticsSnapshot` | New tables; additive. |
| Provider config (v3.0) | `ProviderConfiguration` | New table; env fallback preserved. |
| Social comments (v3.3) | `SocialComment`, `PostCommentRead` + Post stats fields | Additive. |
| AI system (v3.4) | 10 `AI*` models | Additive. |

All were additive (new tables / nullable-or-defaulted fields), so the `db push` was non-destructive.
Keep new work to the same standard.

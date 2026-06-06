# Backend Conventions (NestJS)

> **Verified against v3.4.0.** These conventions are enforced across the codebase; the root
> `AGENTS.md` is the canonical short form.

---

## Layering — pass through every layer

```
Controller → Service → Repository
Controller → Manager → Service → Repository   (when a manager is involved)
```

Rules:

- **Only repositories touch Prisma.** Repositories live at
  `nestjs-libraries/src/database/prisma/<domain>/*.repository.ts`. Controllers and services must not
  call Prisma directly.
- **Cross-domain calls go service→service.** A service that needs another domain calls that
  domain's **service**, not its repository.
- **Keep `apps/backend` thin.** It's mostly controllers + module wiring importing from
  `nestjs-libraries`. Real logic belongs in the library.

## Where things live

| Thing | Location |
|-------|----------|
| Controllers | `apps/backend/src/api/routes/*.controller.ts` |
| Services / managers / repositories | `libraries/nestjs-libraries/src/...` (per domain) |
| Prisma schema | `libraries/nestjs-libraries/src/database/prisma/schema.prisma` |
| Background workflows/activities | `apps/orchestrator/src/{workflows,activities}` |

## Adding an endpoint

1. Add (or extend) the service/repository in `nestjs-libraries` for the real logic.
2. Add a thin controller method in `apps/backend/src/api/routes`.
3. Wire the providers in the relevant module.
4. Add tests (Vitest) next to the code. See [Testing](./testing.md).

## Auth & gating

- Super-admin endpoints check `isSuperAdmin` and reject otherwise (e.g. the `/admin/*` controllers).
- The public API uses API-key auth; MCP uses scoped bearer auth. See [API overview](../api/overview.md).

## Backward compatibility

This runs in production. Before changing anything:

- Prefer **backward-compatible** changes; a data/schema change may need a migration story.
- Don't change the **legacy public analytics route** response shape (n8n/Zapier compatibility).
- Preserve the **AI env fallback** (`OPENAI_API_KEY` behaviour with no admin AI config).

See [Database](./database.md) for schema-change safety under `db push`.

# Backend Conventions (NestJS)

> These conventions are enforced across the codebase; the root
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

## Security invariants (v3.5.0)

When adding controllers/services, satisfy the repo's security primitives — none are optional:

- **Outbound HTTP on any user-influenced URL** (webhook targets, watched-account probes,
  upload-by-URL, provider connect/media fetches) must go through `safeFetch`
  (`nestjs-libraries/src/dtos/webhooks/safe.fetch.ts`) — or, inside a provider, `this.fetch()` which
  defaults to the `ssrfSafeDispatcher`. Never `fetch(userUrl)` directly: create-time DTO validation
  does not survive DNS rebinding or 30x redirects.
- **Secrets at rest** (provider tokens, API keys) are persisted via the AES-GCM `EncryptionService`
  (`v2:` prefix), never plaintext. `Integration.token`/`refreshToken` are encrypted.
- **No secrets/PII in logs or Sentry** — log `Logger.warn(message)`, not raw error/response bodies;
  the Sentry scrubber is the backstop, not the first line of defense.
- **DTO-validate every new public/third-party/raw body** with `class-validator`, and bound
  numeric/limit query params server-side.
- **Rate-limit new AI endpoints** with explicit `@Throttle` (the global throttle guard now applies
  by default — see [Architecture](./architecture.md)).
- **Cookie-authenticated mutating routes** are covered by CSRF middleware; header/API-key clients are
  unaffected.
- **User-return URLs** are allowlisted (`INTEGRATION_RETURN_URL_ALLOWLIST`) before being persisted or
  returned.

These bypass only under `NOT_SECURED` (dev/local). See [Architecture](./architecture.md).

## Backward compatibility

This runs in production. Before changing anything:

- Prefer **backward-compatible** changes; a data/schema change may need a migration story.
- Don't change the **legacy public analytics route** response shape (n8n/Zapier compatibility).
- AI provider config is **per-tenant** through **Settings → AI**; no env fallback.

See [Database](./database.md) for schema-change safety under `db push`.

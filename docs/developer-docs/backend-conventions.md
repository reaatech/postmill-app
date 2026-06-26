# Backend Conventions

Postmill's backend follows a strict NestJS layering discipline. Every request passes through every
layer — **no shortcuts**.

---

## NestJS Layering

```
Controller → Service/Manager → Repository
```

When a manager is involved (orchestration/coordination across domains):

```
Controller → Manager → Service → Repository
```

### What Goes Where

| Layer | Responsibility | Must NOT |
|---|---|---|
| **Controller** | HTTP route wiring (`@Get`, `@Post`), `@Body`/`@Query`/`@Param` extraction, `@UseGuards` decorators, `@CheckPolicies`, `@RequirePermission` | Call Prisma, contain business logic |
| **Service** | Business logic, validation, cross-domain coordination | Call Prisma directly |
| **Manager** | Multi-step orchestration, transaction boundaries, workflow coordination | Call Prisma directly |
| **Repository** | Prisma queries ONLY — `findMany`, `create`, `update`, `$queryRaw` | Contain business logic |

### Cross-Domain Calls

When a service needs data from another domain, it calls that domain's **service** — never its
repository:

```ts
// CORRECT — call the service
const post = await this._postsService.getPost(orgId, postId);

// WRONG — never reach into another domain's repository
const post = await this._postsRepository.findById(postId);
```

### Thin Backend App

`apps/backend` is kept intentionally thin — mostly controllers + module wiring. Real logic lives in
`libraries/nestjs-libraries`. The backend imports and re-exports from shared libraries; it should
not contain substantial business logic, database access, or provider integrations.

---

## DTO Validation

The global `ValidationPipe` is configured with:

```ts
new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
})
```

| Setting | Effect |
|---|---|
| `transform: true` | Auto-casts query/param strings to their declared types |
| `whitelist: true` | Strips properties not declared in the DTO class |
| `forbidNonWhitelisted` | Returns a 400 error when unknown properties are sent |

**Rule:** Every new optional field must be declared on its DTO class. Unknown fields are rejected.

---

## Two Orthogonal Access Gates (v3.8.10)

Routes are gated by two independent guards. **Do not merge them.**

| Gate | Decorator | Guard | Question | Failure |
|---|---|---|---|---|
| Billing/tier | `@CheckPolicies([Action, Section])` | `PoliciesGuard` | Has this org **paid** for this feature? | `SubscriptionException` → HTTP **402** |
| RBAC | `@RequirePermission(resource, action)` | `OrgRbacGuard` | Is this member **allowed** to do this? | `ForbiddenException` → HTTP **403** |

```ts
@CheckPolicies([AuthorizationActions.Create, Sections.TEAM_MEMBERS]) // 402 if plan lacks it
@RequirePermission('settings', 'update')                             // 403 if role lacks it
@Post('/team')
```

Rules:

- `@RequirePermission` resolves the acting user's membership (`UserOrganization.roleId` →
  `AppRole` → permissions). `manage` on a resource implies every action on it.
- `User.isSuperAdmin` (the **platform operator** flag) bypasses RBAC — it does **not** bypass
  billing. It is a different axis from the org `owner` role.
- The seeded system roles are `owner`, `admin`, `editor`, `member`, `viewer` (see
  `libraries/nestjs-libraries/src/database/seeds/rbac-seeder.ts` for the exact catalog); orgs can
  define custom roles via `/settings/roles`.
- Guard sources: `apps/backend/src/services/auth/rbac/org-rbac.guard.ts` and
  `require-permission.decorator.ts`.

---

## CSRF Protection

CSRF middleware is applied to all cookie-authenticated mutating routes (POST, PUT, PATCH, DELETE).
The middleware checks for a matching `x-csrf-token` header on state-changing requests.

**Exemptions:**
- Routes authenticated via `Authorization` header (API keys, OAuth tokens)
- Routes authenticated via browser extension JWT (different session model)
- All routes when `NOT_SECURED` env var is set (dev/local only)

---

## Security Invariants

### safeFetch for Outbound HTTP

**Every** outbound HTTP call that involves a user-influenced URL must go through `safeFetch`
(`libraries/nestjs-libraries/src/dtos/webhooks/safe.fetch.ts`):

```ts
import { safeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch';
```

`safeFetch` enforces:
- `isSafePublicHttpsUrl` validation — blocks private IPs, localhost, etc.
- `ssrfSafeDispatcher` — custom undici dispatcher
- Manual per-hop redirect re-validation (prevents DNS rebinding attacks)

Areas covered: webhook dispatch, provider HTTP fetches, watchlist probes. **Never** use bare
`fetch(url)` where `url` is user-influenced. DTO validation alone doesn't survive DNS rebinding or
30x redirects.

The `SSRF_ALLOWED_PRIVATE_CIDRS` env var allows self-hosted instances to whitelist internal
network ranges.

### EncryptionService for Secrets

All at-rest secrets are encrypted with AES-256-GCM via `EncryptionService`. Encrypted values use
the `v2:` prefix. The service reads `ENCRYPTION_KEY` or falls back to deriving a key from
`JWT_SECRET`.

### No Secrets in Logs

Use NestJS `Logger.warn(message)` / `Logger.error(message)` — never `console.log(err)`. Raw API
response bodies and full prompt bodies are stripped before logging. Error messages stored in
`Errors.body` are redacted before persist.

### JWT Configuration

- Algorithm pinned to `HS256`
- New tokens carry `exp` with sliding renewal
- Legacy exp-less tokens still verify (no forced re-auth)
- IDs and secrets generated with CSPRNG

### NOT_SECURED Bypass

When `NOT_SECURED=true` (dev/local only):
- HSTS and CSP headers are skipped
- CSRF middleware is disabled
- CopilotKit policy gate is bypassed

Response headers never expose JWTs, even under `NOT_SECURED`.

---

## Repository Pattern

### Base Classes

```ts
// Typed access to a single Prisma model
export class PrismaRepository<T extends keyof PrismaService> {
  public model: Pick<PrismaService, T>;
  // ...
}

// Transaction wrapper
export class PrismaTransaction {
  public model: Pick<PrismaService, '$transaction'>;
  // ...
}
```

Both are in `libraries/nestjs-libraries/src/database/prisma/prisma.service.ts`.

### Domain Structure

Each domain has its own directory under `database/prisma/<domain>/`:

```
database/prisma/
├── ai-rag/            → ai-rag.repository.ts
├── ai-settings/       → ai-settings.repository.ts, org-ai-settings.repository.ts
├── analytics/         → analytics.repository.ts
├── announcements/     → announcements.repository.ts
├── api-keys/          → api-keys.repository.ts
├── audit/             → audit.repository.ts
├── auth-providers/    → auth-provider.repository.ts
├── autopost/          → autopost.repository.ts
├── brands/            → brands.repository.ts
├── campaigns/         → campaigns.repository.ts
├── emails/            → email-log.repository.ts
├── integrations/      → integration.repository.ts
├── media/             → media.repository.ts, multipart-upload.repository.ts
├── media-providers/   → org-media-provider-settings.repository.ts
├── notifications/     → notifications.repository.ts
├── oauth/             → oauth.repository.ts
├── organizations/     → organization.repository.ts
├── posts/             → posts.repository.ts
├── provider-configs/  → provider-config.repository.ts, org-provider-config.repository.ts
├── roles/             → roles.repository.ts
├── sets/              → sets.repository.ts
├── short-links/       → org-shortlink-settings.repository.ts
├── signatures/        → signature.repository.ts
├── social-comments/   → social.comments.repository.ts
├── storage/           → storage.repository.ts
├── subscriptions/     → subscription.repository.ts
├── users/             → users.repository.ts
├── watchlist/         → watchlist.repository.ts
└── webhooks/          → webhooks.repository.ts
```

Each repository typically has a companion service file in the same directory (e.g.,
`posts.service.ts`).

---

## Module Wiring

AI providers are registered in `AIProviderRegistry` at module init. Each adapter calls
`registry.register(adapter)` during construction. The registry is the single source of truth for
available providers — `AIModelProvider` resolves adapters by identifier through the registry.

Channel provider integrations follow a similar pattern with `IntegrationManager` and social
provider classes implementing the `SocialAbstract` interface.

Media-generation providers follow the same shape: `MediaProviderRegistry`
(`libraries/nestjs-libraries/src/media/`) registers every `MediaProviderAdapter` at module init
(`MediaModule.onModuleInit`).

> Verified against v3.8.10

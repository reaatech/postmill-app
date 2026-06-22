# Architecture

This document describes the architecture of the Postmill platform for developers
contributing to the codebase.

## Monorepo layout

Postmill is a PNPM monorepo with a single root `package.json` for dependencies.
Workspaces are driven by `pnpm --filter`.

```
postmill-app/
├── apps/
│   ├── backend/        # NestJS REST API + Inngest job handler
│   ├── frontend/       # Next.js App Router (port 4200)
│   ├── extension/      # Browser extension
│   ├── commands/       # CLI commands
│   └── sdk/            # Published Node.js SDK
├── libraries/
│   ├── nestjs-libraries/  # Prisma, repositories, business logic
│   ├── helpers/           # Shared utilities, useFetch hook
│   └── react-shared-libraries/ # Shared React components
└── docs/
```

### Apps

| App | Stack | Purpose |
|-----|-------|---------|
| `backend` | NestJS REST API | Thin controllers + module wiring. Real logic in `nestjs-libraries`. Serves Inngest handler at `/api/inngest`. |
| `frontend` | Next.js App Router, React 19, Tailwind 3 | User-facing web app on port 4200. |
| `extension` | Browser extension | Chrome extension for cross-platform posting. |
| `commands` | CLI | Command-line operations. |
| `sdk` | Node.js (published) | `@reaatech/postmill-sdk` for third-party integrations. |

### Libraries

| Library | Purpose |
|---------|---------|
| `nestjs-libraries` | Prisma schema, repositories, services, integrations, AI layer, analytics, encryption, upload adapters. |
| `helpers` | Shared utilities including `useFetch` (SWR wrapper), auth helpers, decorators (`@Plug`, `@PostPlug`). |
| `react-shared-libraries` | Shared React components used across frontend surfaces. |

## Backend layering

The backend enforces strict layering. **No shortcuts.** Only repositories touch
Prisma.

```
Controller → Service → Repository
Controller → Manager → Service → Repository  (when a manager is involved)
```

- **Controllers** (`apps/backend/src/api/routes/`) handle HTTP, auth guards,
  validation, and delegate to services. Controllers are **thin** — no business
  logic.
- **Services** (`libraries/nestjs-libraries/src/database/prisma/<domain>/`)
  contain business logic. A service must go through another domain's **service**,
  not its repository.
- **Repositories** are the only layer that calls Prisma directly.
- **Managers** (`libraries/nestjs-libraries/src/integrations/`,
  `libraries/nestjs-libraries/src/ai/`) coordinate cross-cutting concerns.

Public API (v1) routes live in `apps/backend/src/public-api/routes/v1/` and are
API-key authenticated.

## Frontend conventions

- **Next.js App Router**: Pages in `apps/frontend/src/app/(app)/(site)/`.
- **Data fetching**: Every API call uses **SWR** through the `useFetch` hook
  from `libraries/helpers/src/utils/custom.fetch.tsx`. Each SWR call must be
  its **own hook** per `react-hooks/rules-of-hooks`.
- **Styling**: Tailwind 3 with CSS variables defined in
  `apps/frontend/src/app/colors.scss`. All `--color-custom*` variables are
  deprecated. Always check existing components before building new ones.
- **Components**: UI primitives in `apps/frontend/src/components/ui/`; feature
  components in `apps/frontend/src/components/`. Never install third-party UI
  component libraries — write them natively.
- **New channel providers** require a composer component in
  `apps/frontend/src/components/new-launch/`.

## How a post gets published

1. User creates a post in the composer. A **preflight** validation
   (`/posts/preflight`) checks content, media, and provider capabilities.
2. Post is saved to the database with a scheduled date.
3. At the scheduled time, an **Inngest function** picks up the post:
   - v1.0.5 — base publish flow.
   - v1.0.6 — adds optional **first comment** support.
4. The workflow calls `PostActivity` which resolves the provider through
   `IntegrationManager` and calls `provider.post()`.
5. After successful publish:
   - **Internal plugs** (`@PostPlug`) execute (one-shot post-publish actions,
     e.g. "have another account repost this").
   - If `settings.firstComment` is set and the provider supports it (gated via
     `providerCapabilities.firstComment`), the workflow posts a first comment.
     This is **idempotent** — it records `firstCommentPostedAt` so retries
     cannot double-post. Failure is **non-fatal** (the post stays published).
6. Webhooks fire for `post.published` events.

## How analytics works

1. An Inngest **`analyticsCollection`** function runs one sweep per org on a daily cron
   schedule.
2. Each sweep calls `AnalyticsActivity` which queries channel analytics (7-day
   lookback for channel metrics, 30-day lookback for per-post metrics).
3. Results are saved as daily **`AnalyticsSnapshot`** and
   **`PostAnalyticsSnapshot`** rows.
4. After ~18 months, `pruneAndRollupSnapshots()` rolls daily rows into weekly:
   flow metrics summed, stock metrics keep the week's latest value.
5. Per-post snapshots are pruned after 90 days. Both windows are configurable
   via `ANALYTICS_DAILY_RETENTION_DAYS` and `ANALYTICS_POST_RETENTION_DAYS`.
6. The `/analytics/v2` endpoints serve persisted data. Legacy
   `/public/v1/analytics/*` and `/analytics/*` routes are kept for backward
   compatibility (n8n/Zapier/Make integrations) — never change their response
   shape.

## Cross-cutting concerns

| Concern | Implementation |
|---------|---------------|
| **SSRF protection** | All outbound HTTP on user-influenced URLs goes through `safeFetch` (validates HTTPS, validates redirects per-hop) in `libraries/nestjs-libraries/src/dtos/webhooks/safe.fetch.ts`. |
| **At-rest encryption** | `EncryptionService` (AES-256-GCM, `v2:` prefix) encrypts OAuth tokens, API keys, and Nostr keys. Falls back to deriving key from `JWT_SECRET` if `ENCRYPTION_KEY` is unset. |
| **CSRF** | CSRF middleware on cookie-authenticated mutating routes. Bypassed under `NOT_SECURED` (dev). Header/API-key clients are unaffected. |
| **Helmet** | HSTS (1yr, includeSubDomains, preload), `noSniff`, `referrerPolicy`, `frameguard: deny`, conservative CSP. Gated by `NOT_SECURED`. |
| **Throttling** | `ThrottlerBehindProxyGuard` applies default per-route limits. Global default: `API_LIMIT` env var (600/hour). |
| **Sentry** | `beforeSend`/`beforeBreadcrumb` scrubs auth headers, tokens, PII. OpenAI capture disabled (`recordInputs: false`). |
| **JWT** | Algorithm pinned to `HS256`. New tokens carry `exp` with sliding renewal. Legacy exp-less tokens still verify. |
| **Validation** | Global `ValidationPipe` rejects unknown fields (`whitelist` + `forbidNonWhitelisted`). |

## Email adapter system (v3.8.1)

The email layer was refactored from a hardcoded 2-provider path (Resend / nodemailer reading
`process.env` at module load) to a pluggable 6-provider adapter system:

- **6 adapters**: Resend, SendGrid, Mailgun, Postmark, Amazon SES, SMTP (nodemailer). Each
  implements `EmailAdapter` with `send()`, `isConfigured()`, and optional `verifyWebhook()` /
  `parseWebhook()`.
- **Global env selection**: `EMAIL_PROVIDER` picks the adapter. Unset/unknown → `EmptyAdapter` and
  `hasProvider() === false` (activation auto-on, same as before).
- **Lazy construction**: SDK clients are built inside methods, not at module load — unit-testable
  with per-test env and no boot-time crashes when unconfigured.
- **`EmailAdapterRegistry`**: `@Injectable` registry keyed by adapter name; `getActiveAdapter()`
  resolves the active adapter per-call.
- **Delivery-lifecycle log**: `EmailLog` Prisma model (metadata only — no HTML body). Each send
  writes a `queued` row; successful sends advance to `sent` with `providerMessageId`; webhook
  events advance through `delivered`/`bounced`/`complained`/`opened`/`clicked`. Status never
  downgrades; terminal negatives (`bounced`/`complained`) cannot be overwritten.
- **Webhook ingestion**: `POST /webhooks/email` — signature-verified, CSRF-exempt (same pattern as
  Stripe). SES also handles SNS `SubscriptionConfirmation` via `safeFetch`.
- **Retention**: `pruneEmailLogs()` in the analytics sweep deletes rows older than
  `EMAIL_LOG_RETENTION_DAYS` (default 90). Best-effort; never fails the sweep.

## Identity, profile & sessions (v3.8.10)

The `User` god-table was split along Supabase-shaped lines (conventions only — Prisma + the
existing custom HS256 JWT stay; no GoTrue, no RLS):

- **`User`** keeps the identity/auth columns only: `email`, `password`, `providerName`,
  `providerId`, `isSuperAdmin`, `activated`, `lastOnline`, `ip`, `agent`,
  `lastReadNotifications`. The `@@unique([email, providerName])` key is preserved — the same email
  may exist once per login provider.
- **`UserProfile`** (1:1, cascade) carries the profile fields: `name`, `lastName`, `bio`,
  `avatarUrl` (external avatar: OAuth provider picture → Gravatar fallback, refreshed on login),
  `pictureId` (user-uploaded image), IANA `timezone` (string, replacing the old `Int` offset), and
  the three notification-preference booleans.
- **`Session`** backs refresh-token rotation: login creates a session storing
  `tokenHash = sha256(refreshToken)` (never the token itself); `POST /auth/refresh` rotates the
  hash; **reuse of a rotated hash revokes the session**; logout (`POST /user/logout`) revokes all
  sessions. `GET /user/sessions` lists active devices, `POST /user/sessions/:id/revoke` and
  `POST /user/sessions/revoke-all` revoke them. The JWT **access** token is unchanged (HS256,
  sliding renewal, legacy exp-less tokens still verify).

## RBAC (v3.8.10)

Full role-based access control replaces the dropped 3-value `Role` enum:

- **`AppRole`** — org-scoped roles; `organizationId = NULL` rows are seeded system roles
  (`owner`, `admin`, `editor`, `member`, `viewer`, `isSystem: true`). Orgs can create custom roles
  via `/settings/roles` (CRUD, `@RequirePermission('members', 'manage')`) or the Settings →
  Workspace → Roles tab, which fronts the same API.
- **`Permission`** — seeded `(resource, action)` catalog: 16 resources (`posts`, `media`,
  `channels`, `analytics`, `comments`, `webhooks`, `autopost`, `settings`, `organization`,
  `members`, `brands`, `ai-config`, `media-config`, `storage-config`, `shortlink-config`,
  `billing`) × 5 actions (`create`, `read`, `update`, `delete`, `manage`). The seeder
  (`libraries/nestjs-libraries/src/database/seeds/rbac-seeder.ts`) is idempotent.
- **`AppRolePermission`** — the join table. `manage` on a resource implies all actions.
- **`OrgRbacGuard` + `@RequirePermission(resource, action)`**
  (`apps/backend/src/services/auth/rbac/`) gate routes at the controller level. Membership →
  `roleId` → permissions are resolved per request (cached per request); failure throws
  `ForbiddenException` → **HTTP 403**.

### Two orthogonal access gates

| Gate | Decorator | Question | Failure |
|------|-----------|----------|---------|
| Billing | `@CheckPolicies` + `PoliciesGuard` | Has this org **paid** for this feature? | HTTP **402** |
| RBAC | `@RequirePermission` + `OrgRbacGuard` | Is this member **allowed** to do this? | HTTP **403** |

A route may carry both; they are independent. `User.isSuperAdmin` (the **platform operator** axis,
distinct from the org `owner` role) bypasses RBAC but not billing. Invites and team-role changes
map the legacy `USER`/`ADMIN` values to the `member`/`admin` system roles (an explicit `roleId`
can target a custom role); the first user of an org gets `owner`.

## Platform `/admin` & login providers (v3.8.10)

`AuthProviderConfig` stores platform-wide login provider configs (one row per `Provider`,
client ID/secret encrypted at rest). Super-admins manage them at `/admin`
(`GET/POST /admin/auth-providers`, `DELETE /admin/auth-providers/:provider`). Login providers
resolve credentials **DB-first**; the `getLoginEnv()` env vars are the **bootstrap fallback** when
no enabled DB row exists — so the first operator can always log in. OIDC SSO ships via the
`Provider.GENERIC` row (configurable auth/token/userinfo URLs and scopes). `LOCAL` email/password
auth is always available regardless of DB config (subject to `DISABLE_REGISTRATION`). SAML is not
in this product — OIDC only.

## Shared provider-surface foundation (v3.8.10)

The AI, Media, Storage and Shortlinks settings surfaces share one foundation — do not fork
per-surface copies:

- **`ProviderIcon`** (`apps/frontend/src/components/shared/provider-icon.tsx`) — real brand SVG
  icons for every provider across all four surfaces.
- **`accountFingerprint`** (`libraries/nestjs-libraries/src/utils/account-fingerprint.ts`) —
  sha256 of a provider's distinguishing credentials, backing the unique-account constraints on
  `StorageProviderConfig`, `OrgShortLinkConfig`, and `MediaProviderConfig`.
- **`ProviderListShell`** (`apps/frontend/src/components/settings/shared/provider-list-shell.tsx`)
  — the reusable provider-list layout (cards, configured/active badges, per-row actions).
- **`ProviderConfigDto`** (`libraries/nestjs-libraries/src/types/provider-config.types.ts`) — the
  shared config response shape.

## Schedule pages (v3.8.10)

The post composer moved out of the `AddEditModal` onto dedicated routes:
`/schedule/post` (create — accepts `date`/`channel`/`content` query params from calendar slots and
other entry points) and `/schedule/post/:id` (edit). Both render the shared `PostComposer`
component; the time picker displays in the user's IANA timezone and saves UTC.

> Verified against v3.8.10

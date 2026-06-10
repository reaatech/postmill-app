# Configuration

Postmill is configured through environment variables. The authoritative template is
[`.env.example`](https://github.com/reaatech/postmill-app/blob/main/.env.example) at the repo root — copy it to `.env` and edit. This page
explains the important groups and the fork-specific behaviour.

> When a variable's exact default matters, check `.env.example` and
> `docker-compose.yaml` directly; this page documents intent and fork behaviour rather than
> duplicating every line.

---

## Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string (cache, queues, rate limiting/idempotency). |
| `JWT_SECRET` | Signs JWTs **and is the encryption key** for stored channel/AI credentials. Make it long and stable — changing it invalidates encrypted DB credentials and sessions. |
| `FRONTEND_URL` | The exact URL you access Postmill on. |
| `NEXT_PUBLIC_BACKEND_URL` | Public URL the browser uses to reach the backend API. |
| `BACKEND_INTERNAL_URL` | Internal URL the frontend server uses to reach the backend. |

> **Warning:** `JWT_SECRET` encrypts channel credentials (v3.0+) and AI provider keys (v3.4+) at
> rest. Treat it as a secret and do not rotate it casually.

## Storage

> **Fork behaviour (v3.6.0):** storage is now configured per-tenant through the **Settings → Storage**
> UI rather than a global env var. Each organization mounts its own provider: S3, Cloudflare R2,
> Backblaze B2, IDrive e2, or local disk. Credentials are stored encrypted in the database
> (`StorageProviderConfig` model). Each org defaults to 5 GB of local disk space
> (`localStorageQuotaBytes`, adjustable per org).

The only remaining storage-related environment variable:

| Variable | Purpose |
|----------|---------|
| `UPLOAD_DIRECTORY` / `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY` | Local upload path (used for the local disk adapter). |

The old `STORAGE_PROVIDER` env var and all `CLOUDFLARE_*` vars are removed in v3.6.0.

## Email & registration

- `RESEND_API_KEY` — if set, user activation by email is required; if commented out, users are
  activated automatically. `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` set the sender.
- `DISABLE_REGISTRATION` — set `true` to close signups.

## Social provider credentials

> **Fork behaviour (v3.6.0):** channel provider OAuth credentials are configured per-tenant through
> **Settings → Channels**. Each organization provides their own client ID/secret per provider.
> The old global env vars (`LINKEDIN_CLIENT_ID`, `FACEBOOK_APP_ID`, `X_API_KEY`, etc.) are removed.
>
> See [Per-provider setup](../channels/setup-per-provider.md).

## AI

> **Fork behaviour (v3.6.0):** AI provider configuration is per-tenant through **Settings → AI**.
> Each organization configures its own provider, model, and API keys. A super-admin fallback can be
> set in the global AI settings for orgs that have not configured their own.
>
> `OPENAI_API_KEY` is removed in v3.6.0 — all AI configuration is in-app.
>
> See [AI features](../features/ai-features.md).

## Analytics & background jobs

| Variable | Purpose |
|----------|---------|
| `RUN_CRON` | Set `true` on **exactly one** orchestrator instance to run the daily analytics collection and comment-sync workflows. |
| `ANALYTICS_DAILY_RETENTION_DAYS` | How long to keep raw daily channel snapshots before weekly rollup (default `548`, ~18 months). |
| `ANALYTICS_POST_RETENTION_DAYS` | Prune per-post daily snapshots older than this (default `90`). |
| `TEMPORAL_ADDRESS` | Temporal frontend address (e.g. `temporal:7233`). |

See [Temporal & background jobs](./temporal-and-cron.md) for how these workflows behave.

## API & rate limiting

- `API_LIMIT` — global per-client hourly request cap on the authenticated API (default `600`, raised from `90` in v3.5.10; the public API is subject to it too). Sensitive routes (auth, public, AI) keep their own tighter per-minute limits.

## Payments (optional)

`FEE_AMOUNT`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_SIGNING_KEY`,
`STRIPE_SIGNING_KEY_CONNECT` configure Stripe billing.

## Generic OAuth / SSO (optional)

`POSTMILL_GENERIC_OAUTH` plus `POSTMILL_OAUTH_*` and `NEXT_PUBLIC_POSTMILL_OAUTH_*` enable a generic OIDC
login provider (e.g. Authentik). `IS_GENERAL="true"` is required for now.

## Short-link services (optional)

Dub, Short.io, Kutt, and LinkDrip integrations are configured via their respective `DUB_*`,
`SHORT_IO_*`, `KUTT_*`, and `LINK_DRIP_*` variables (all commented out by default).

## Monitoring (optional)

`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_SPOTLIGHT` wire up Sentry (the app is Sentry-instrumented).

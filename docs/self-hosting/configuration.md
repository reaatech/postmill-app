# Configuration

Postiz is configured through environment variables. The authoritative template is
[`.env.example`](../../.env.example) at the repo root — copy it to `.env` and edit. This page
explains the important groups and the fork-specific behaviour.

> **Verified against v3.5.9.** When a variable's exact default matters, check `.env.example` and
> `docker-compose.yaml` directly; this page documents intent and fork behaviour rather than
> duplicating every line.

---

## Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string (cache, queues, rate limiting/idempotency). |
| `JWT_SECRET` | Signs JWTs **and is the encryption key** for stored channel/AI credentials. Make it long and stable — changing it invalidates encrypted DB credentials and sessions. |
| `FRONTEND_URL` | The exact URL you access Postiz on. |
| `NEXT_PUBLIC_BACKEND_URL` | Public URL the browser uses to reach the backend API. |
| `BACKEND_INTERNAL_URL` | Internal URL the frontend server uses to reach the backend. |

> **Warning:** `JWT_SECRET` encrypts channel credentials (v3.0+) and AI provider keys (v3.4+) at
> rest. Treat it as a secret and do not rotate it casually.

## Storage

`STORAGE_PROVIDER` selects where uploaded media and social avatars are saved:

- `local` — store on disk. Set `UPLOAD_DIRECTORY` (and the matching public path).
- `cloudflare` — store in Cloudflare R2. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_KEY`,
  `CLOUDFLARE_SECRET_ACCESS_KEY`, `CLOUDFLARE_BUCKETNAME`, `CLOUDFLARE_BUCKET_URL`,
  `CLOUDFLARE_REGION`.

## Email & registration

- `RESEND_API_KEY` — if set, user activation by email is required; if commented out, users are
  activated automatically. `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` set the sender.
- `DISABLE_REGISTRATION` — set `true` to close signups.

## Social provider credentials

`.env.example` lists per-provider client IDs/secrets (X, LinkedIn, Reddit, GitHub, Threads,
Facebook, YouTube, TikTok, Pinterest, Dribbble, Discord, Slack, Mastodon, and more).

> **Fork behaviour (v3.0+):** these env vars are now a **fallback**. The preferred way to configure
> channels is the encrypted admin UI at `/admin/channels`. Credential reads check the database
> first, then fall back to `process.env`. With no DB configs present, all providers fall back to
> env vars. See [Channels admin](../admin/channels.md).

## AI

- `OPENAI_API_KEY` — the legacy/default AI key.

> **Fork behaviour (v3.4+):** with no admin AI configuration, every AI surface uses `OPENAI_API_KEY`
> exactly as before. The multi-provider system (additional providers, per-scope models, governance)
> is configured in the admin UI at `/admin/ai`, with keys encrypted in the database. See
> [AI settings admin](../admin/ai-settings.md).

## Analytics & background jobs

| Variable | Purpose |
|----------|---------|
| `RUN_CRON` | Set `true` on **exactly one** orchestrator instance to run the daily analytics collection and comment-sync workflows. |
| `ANALYTICS_DAILY_RETENTION_DAYS` | How long to keep raw daily channel snapshots before weekly rollup (default `548`, ~18 months). |
| `ANALYTICS_POST_RETENTION_DAYS` | Prune per-post daily snapshots older than this (default `90`). |
| `TEMPORAL_ADDRESS` | Temporal frontend address (e.g. `temporal:7233`). |

See [Temporal & background jobs](./temporal-and-cron.md) for how these workflows behave.

## API & rate limiting

- `API_LIMIT` — public API hourly request limit (default `30`).

## Payments (optional)

`FEE_AMOUNT`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_SIGNING_KEY`,
`STRIPE_SIGNING_KEY_CONNECT` configure Stripe billing.

## Generic OAuth / SSO (optional)

`POSTIZ_GENERIC_OAUTH` plus `POSTIZ_OAUTH_*` and `NEXT_PUBLIC_POSTIZ_OAUTH_*` enable a generic OIDC
login provider (e.g. Authentik). `IS_GENERAL="true"` is required for now.

## Short-link services (optional)

Dub, Short.io, Kutt, and LinkDrip integrations are configured via their respective `DUB_*`,
`SHORT_IO_*`, `KUTT_*`, and `LINK_DRIP_*` variables (all commented out by default).

## Monitoring (optional)

`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_SPOTLIGHT` wire up Sentry (the app is Sentry-instrumented).

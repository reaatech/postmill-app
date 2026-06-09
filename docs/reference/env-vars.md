# Environment Variable Reference

Curated reference of the environment variables. The authoritative template is
[`.env.example`](../../.env.example); `docker-compose.yaml` shows them set inline for the container
deployment. This page groups them by purpose — see [Configuration](../self-hosting/configuration.md)
for the narrative version.

> **Verified against v3.6.0.** When an exact default matters, check `.env.example` directly.

---

## Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string. |
| `JWT_SECRET` | Signs JWTs **and encrypts stored channel/AI credentials**. Keep long & stable. |
| `FRONTEND_URL` | Exact URL Postmill is accessed on. |
| `NEXT_PUBLIC_BACKEND_URL` | Public backend URL the browser uses. |
| `BACKEND_INTERNAL_URL` | Internal backend URL the frontend server uses. |

## Storage

| Variable | Purpose |
|----------|---------|
| `UPLOAD_DIRECTORY` / `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY` | Local upload paths. |

> **v3.6.0:** Storage is configured per-tenant via **Settings → Storage** (S3, R2, B2, IDrive e2, or
> local disk). The old `STORAGE_PROVIDER` and `CLOUDFLARE_*` env vars are removed.

## Email & registration

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | If set, email activation required; if unset, auto-activate. |
| `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` | Sender identity. |
| `DISABLE_REGISTRATION` | Close signups when `true`. |

## Social providers

> **v3.6.0:** Channel OAuth credentials are configured per-tenant via **Settings → Channels**.
> Per-provider env vars (`LINKEDIN_CLIENT_ID`, `FACEBOOK_APP_ID`, `X_API_KEY`, etc.) are **removed**.
> See [Per-provider setup](../channels/setup-per-provider.md).

## AI

> **v3.6.0:** AI providers are configured per-tenant via **Settings → AI**. `OPENAI_API_KEY` is
> removed — all AI configuration is in-app. See [AI features](../features/ai-features.md).

## Analytics & background jobs

| Variable | Default | Purpose |
|----------|---------|---------|
| `RUN_CRON` | unset | `true` on **one** orchestrator to run analytics collection + comment sync. |
| `ANALYTICS_DAILY_RETENTION_DAYS` | `548` | Daily→weekly rollup age (~18 months). |
| `ANALYTICS_POST_RETENTION_DAYS` | `90` | Per-post snapshot prune age. |
| `TEMPORAL_ADDRESS` | — | Temporal frontend (e.g. `temporal:7233`). |

## API

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_LIMIT` | `600` | Global per-client hourly request cap on the authenticated API (enforced by the global throttler; the public API is subject to it too). Raised from `90` in v3.5.10. |

## Payments (optional)

`FEE_AMOUNT`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_SIGNING_KEY`,
`STRIPE_SIGNING_KEY_CONNECT`.

## Generic OAuth / SSO (optional)

`IS_GENERAL`, `POSTMILL_GENERIC_OAUTH`, `POSTMILL_OAUTH_URL`, `POSTMILL_OAUTH_AUTH_URL`,
`POSTMILL_OAUTH_TOKEN_URL`, `POSTMILL_OAUTH_USERINFO_URL`, `POSTMILL_OAUTH_CLIENT_ID`,
`POSTMILL_OAUTH_CLIENT_SECRET`, `POSTMILL_OAUTH_SCOPE`, `NEXT_PUBLIC_POSTMILL_OAUTH_DISPLAY_NAME`,
`NEXT_PUBLIC_POSTMILL_OAUTH_LOGO_URL`.

## Short links (optional)

`DUB_*`, `SHORT_IO_SECRET_KEY`, `KUTT_*`, `LINK_DRIP_*`.

## Security (optional, v3.5.0)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENCRYPTION_KEY` | falls back to `JWT_SECRET` | Optional dedicated key for AES-GCM encryption of secrets at rest (channel/AI/OAuth tokens). Accepts a 32-byte key as base64 (44 chars) or hex (64 chars); other strings are SHA-256-derived. If unset, the key is derived from `JWT_SECRET`, so existing deployments keep working unchanged. |
| `INTEGRATION_RETURN_URL_ALLOWLIST` | unset (empty) | Comma-separated list of extra allowed origins for integration/enterprise return URLs (open-redirect allowlist). `FRONTEND_URL` is always allowed; private/loopback/metadata hosts are always rejected. |
| `SSRF_ALLOWED_PRIVATE_CIDRS` | unset (empty) | Comma-separated CIDRs (e.g. `10.0.0.0/8,192.168.5.0/24`, IPv4 or IPv6) the SSRF guard treats as reachable, so self-hosted provider instances (Mastodon custom, self-hosted WordPress/Lemmy) on private networks still work. Off by default — every private/loopback/link-local range stays blocked. Targets must still be HTTPS. |

## Monitoring (optional)

`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_SPOTLIGHT`.

## Misc / developer

`NEXT_PUBLIC_DISCORD_SUPPORT`, `NEXT_PUBLIC_POLOTNO`, `NX_ADD_PLUGINS`, `NOT_SECURED`.

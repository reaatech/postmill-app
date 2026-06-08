# Environment Variable Reference

Curated reference of the environment variables. The authoritative template is
[`.env.example`](../../.env.example); `docker-compose.yaml` shows them set inline for the container
deployment. This page groups them by purpose — see [Configuration](../self-hosting/configuration.md)
for the narrative version.

> **Verified against v3.5.10.** When an exact default matters, check `.env.example` directly.

---

## Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string. |
| `REDIS_URL` | Redis connection string. |
| `JWT_SECRET` | Signs JWTs **and encrypts stored channel/AI credentials**. Keep long & stable. |
| `FRONTEND_URL` | Exact URL Postiz is accessed on. |
| `NEXT_PUBLIC_BACKEND_URL` | Public backend URL the browser uses. |
| `BACKEND_INTERNAL_URL` | Internal backend URL the frontend server uses. |

## Storage

| Variable | Purpose |
|----------|---------|
| `STORAGE_PROVIDER` | `local` or `cloudflare`. |
| `UPLOAD_DIRECTORY` / `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY` | Local upload paths. |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_ACCESS_KEY` / `CLOUDFLARE_SECRET_ACCESS_KEY` / `CLOUDFLARE_BUCKETNAME` / `CLOUDFLARE_BUCKET_URL` / `CLOUDFLARE_REGION` | R2 storage. |

## Email & registration

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | If set, email activation required; if unset, auto-activate. |
| `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` | Sender identity. |
| `DISABLE_REGISTRATION` | Close signups when `true`. |

## Social providers (fallback)

Per-provider client IDs/secrets and tokens: `X_*`, `LINKEDIN_*`, `REDDIT_*`, `GITHUB_*`,
`THREADS_*`, `FACEBOOK_*`, `YOUTUBE_*`, `TIKTOK_*`, `PINTEREST_*`, `DRIBBBLE_*`, `DISCORD_*`,
`SLACK_*`, `MASTODON_*`, `BEEHIIVE_*`, `LISTMONK_*`, `TELEGRAM_TOKEN`, `TUMBLR_*`, `EXTENSION_ID`,
and others.

> **Fork behaviour:** these are a **fallback**. Prefer the encrypted admin UI — see
> [Channels admin](../admin/channels.md).

## AI

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Default/fallback AI key. With no admin AI config, all AI surfaces use this. |

Additional providers and per-scope models are configured in [AI settings admin](../admin/ai-settings.md).

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

`IS_GENERAL`, `POSTIZ_GENERIC_OAUTH`, `POSTIZ_OAUTH_URL`, `POSTIZ_OAUTH_AUTH_URL`,
`POSTIZ_OAUTH_TOKEN_URL`, `POSTIZ_OAUTH_USERINFO_URL`, `POSTIZ_OAUTH_CLIENT_ID`,
`POSTIZ_OAUTH_CLIENT_SECRET`, `POSTIZ_OAUTH_SCOPE`, `NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME`,
`NEXT_PUBLIC_POSTIZ_OAUTH_LOGO_URL`.

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

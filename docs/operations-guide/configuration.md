# Configuration

Every environment variable Postmill recognises, sourced from `.env.example` and
`docker-compose.yaml`. All variables are read at boot time.

> **Important (v3.7.1+)**: Channel provider credentials and AI provider config are **not** read
> from environment variables. Configure them per-organization in-app via Settings -> Channels and
> Settings -> AI. The pre-v3.7.1 env vars for these were removed.

## Required

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | — | PostgreSQL connection string for the application database |
| `REDIS_URL` | — | Redis connection string. Use `redis://` for local Redis or `rediss://` for Upstash / TLS endpoints. |
| `JWT_SECRET` | — | Secret key for signing JWT tokens; also used as encryption key fallback |
| `FRONTEND_URL` | — | Public-facing URL of the application (e.g. `https://postmill.example.com`) |
| `NEXT_PUBLIC_BACKEND_URL` | — | Public URL of the backend API (e.g. `https://postmill.example.com/api`) |
| `BACKEND_INTERNAL_URL` | — | Internal URL for backend-to-backend calls (e.g. `http://localhost:3000`) |
| `MAIN_URL` | — | Alternative public URL, used in Docker Compose alongside `FRONTEND_URL` |

## Storage

| Variable | Default | Purpose |
|----------|---------|---------|
| `UPLOAD_DIRECTORY` | — | Local path for file uploads (e.g. `/uploads`). Avatars and app-internal images always use LOCAL. Since v3.8.10, local files are partitioned per tenant under `<UPLOAD_DIRECTORY>/<tenantId>/`. |
| `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY` | — | Public URL path serving uploads (e.g. `/uploads`) |
| `MEDIA_UPLOAD_MAX_BYTES` | `1073741824` | Maximum upload file size for `/files/upload-server` (default 1 GB) |
| `LOCAL_STORAGE_QUOTA_GB` | `5` | **(v3.8.10)** Default soft quota for each org's local storage, in GB. Per-org override via the org's `localStorageQuotaBytes`. |

## Email (v3.8.1+)

Pluggable provider system with 6 adapters: Resend, SendGrid, Mailgun, Postmark, Amazon SES, and
SMTP (nodemailer). The active provider is selected globally via `EMAIL_PROVIDER`; unset/unknown →
email is off (users activate automatically — same as the old `RESEND_API_KEY` absence).

All metadata (to, from, subject, status) is logged in the `EmailLog` table with 90-day retention,
pruned by the daily analytics sweep. Webhook-capable providers (all except SMTP)
advance log rows through `delivered`/`bounced`/`complained`/`opened`/`clicked`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `EMAIL_PROVIDER` | — | `resend`, `sendgrid`, `mailgun`, `postmark`, `ses`, or `smtp` |
| `EMAIL_API_KEY` | — | API key for Resend, SendGrid, Mailgun, or Postmark |
| `EMAIL_FROM_ADDRESS` | — | Sender email address |
| `EMAIL_FROM_NAME` | — | Sender display name |
| `EMAIL_WEBHOOK_SECRET` | — | Signing secret / verification key for the active provider's webhook |
| `EMAIL_MAILGUN_DOMAIN` | — | Mailgun sending domain (required for `mailgun`) |
| `EMAIL_REGION` | `us` | API region for Mailgun (`us`/`eu`) and SES region |
| `EMAIL_SES_ACCESS_KEY_ID` | — | SES IAM access key (optional; falls back to `AWS_*` env) |
| `EMAIL_SES_SECRET_ACCESS_KEY` | — | SES IAM secret key (optional; falls back to `AWS_*` env) |
| `EMAIL_SMTP_HOST` | — | SMTP server hostname (required for `smtp`) |
| `EMAIL_SMTP_PORT` | `587` | SMTP server port |
| `EMAIL_SMTP_SECURE` | `false` | Use TLS for SMTP |
| `EMAIL_SMTP_USER` | — | SMTP authentication username (optional for open relays) |
| `EMAIL_SMTP_PASS` | — | SMTP authentication password |
| `EMAIL_LOG_RETENTION_DAYS` | `90` | Days to keep email log metadata before pruning |
| `DISABLE_REGISTRATION` | `false` | Set to `true` to disable self-registration. The very first user (empty instance) can always register, and `GENERIC` OIDC sign-ins are exempt (SSO users still provision). |

The webhook endpoint is at `POST /webhooks/email`, signature-verified, and registered outside CSRF
(same as Stripe). SES uses SNS topic verification; the `EMAIL_WEBHOOK_SECRET` can optionally hold
the expected SNS TopicArn to restrict incoming notifications.

**Removed vars (v3.8.1):** `RESEND_API_KEY`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`,
`EMAIL_USER`, `EMAIL_PASS` — use the standardized scheme above.

### Provider credential setup

| Provider | API Key source | Webhook signing secret |
|----------|---------------|----------------------|
| **Resend** | [resend.com/api-keys](https://resend.com/api-keys) — create an API key. Set `EMAIL_API_KEY`. | Webhook signing secret is in the webhook settings on the Resend dashboard (Settings → Webhooks). Set `EMAIL_WEBHOOK_SECRET`. |
| **SendGrid** | [sendgrid.com/settings/api_keys](https://sendgrid.com/settings/api_keys) — create a "Full Access" API key. Set `EMAIL_API_KEY`. | Verification key from [sendgrid.com/settings/webhooks](https://sendgrid.com/settings/webhooks) — enable "Event Webhook" and copy the Verification Key. Set `EMAIL_WEBHOOK_SECRET`. |
| **Mailgun** | [mailgun.com/sessions](https://mailgun.com/sessions) — use your SMTP credentials or create a Mailgun API key. Set `EMAIL_API_KEY`. | Mailgun sends webhook signing secrets via its API; see the Mailgun webhook setup page. Set `EMAIL_WEBHOOK_SECRET`. Also set `EMAIL_MAILGUN_DOMAIN` and optionally `EMAIL_REGION` (`us`/`eu`). |
| **Postmark** | [postmarkapp.com/account/api-tokens](https://postmarkapp.com/account/api-tokens) — create a server API token. Set `EMAIL_API_KEY`. | Webhook signing secret is generated when you create a webhook in the Postmark dashboard (Servers → Your Server → Webhooks). Set `EMAIL_WEBHOOK_SECRET`. |
| **Amazon SES** | IAM credentials (`EMAIL_SES_ACCESS_KEY_ID` + `EMAIL_SES_SECRET_ACCESS_KEY`) — falls back to `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` if those are set in the environment. Set `EMAIL_REGION` to the SES region (e.g. `us-east-1`). | SES uses SNS. Subscribe your webhook endpoint to the SNS topic. `EMAIL_WEBHOOK_SECRET` can optionally hold the expected SNS TopicArn to restrict incoming notifications. The adapter handles `SubscriptionConfirmation` automatically. |
| **SMTP** | No API key — set `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_SECURE`, `EMAIL_SMTP_USER`, and `EMAIL_SMTP_PASS`. | Webhooks are not supported for SMTP (no delivery tracking). |

### Webhook endpoint

All webhook-capable providers (Resend, SendGrid, Mailgun, Postmark, SES) must have their dashboard
webhook configured to point at `POST /webhooks/email` on your backend (e.g.
`https://postmill.example.com/webhooks/email`). This endpoint is signature-verified and registered
outside CSRF (same as Stripe). SES handles SNS topic verification; the `EMAIL_WEBHOOK_SECRET` can
optionally hold the expected SNS TopicArn to restrict incoming notifications.

## Push notifications

Browser and mobile push notifications are sent via Firebase Cloud Messaging (FCM) v1. Users register
tokens through the frontend; invalid or unregistered tokens are automatically deactivated. Push is
globally disabled when these variables are unset.

| Variable | Default | Purpose |
|----------|---------|---------|
| `FCM_PROJECT_ID` | — | Firebase project ID |
| `FCM_CLIENT_EMAIL` | — | Firebase service account client email |
| `FCM_PRIVATE_KEY` | — | Firebase service account private key (PEM) |

## Analytics & background jobs

| Variable | Default | Purpose |
|----------|---------|---------|
| `USE_INNGEST` | — | Set to `true` to enable Inngest-driven background jobs |
| `INNGEST_EVENT_KEY` | — | Inngest Cloud event key (required unless `INNGEST_DEV=1`) |
| `INNGEST_SIGNING_KEY` | — | Inngest Cloud signing key (required unless `INNGEST_DEV=1`) |
| `INNGEST_SIGNING_KEY_FALLBACK` | — | Optional fallback signing key for rotation |
| `INNGEST_ENV` | — | Optional branch environment name |
| `INNGEST_DEV` | — | Set to `1` to use the local Inngest dev server |
| `INNGEST_BASE_URL` | `http://localhost:8288` | Local dev server URL (only used with `INNGEST_DEV=1`) |
| `INNGEST_SERVE_ORIGIN` | — | Public backend origin served to Inngest |
| `INNGEST_SERVE_PATH` | `/api/inngest` | Path where the backend serves the Inngest handler |
| `ANALYTICS_DAILY_RETENTION_DAYS` | `548` | Days to keep daily channel snapshots before rolling up to weekly (~18 months) |
| `ANALYTICS_POST_RETENTION_DAYS` | `90` | Days to keep per-post snapshots before pruning |
| `COMMENTS_SWEEP_INTERVAL_MINUTES` | `30` | Minutes between comment collection sweeps |
| `POST_DAYS_BACK` | `30` | Days back to look for posts when fetching comments |
| `SOCIAL_COMMENT_RETENTION_DAYS` | `90` | Days before social comments are soft-deleted |

## API

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_LIMIT` | `600` | Public API rate limit per hour |
| `AGENT_API_KEY` | — | API key for legacy `/public/agent` endpoint |
| `OPENAI_APP_CHALLENGE` | — | Challenge string for OpenAI apps, served at `/.well-known/openai-apps-challenge` |

## Security

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENCRYPTION_KEY` | (derived from `JWT_SECRET`) | 32-byte base64 or hex key for AES-256-GCM encryption at rest. Falls back to SHA-256 of `JWT_SECRET` if unset. See [Security](./security.md). |
| `INTEGRATION_RETURN_URL_ALLOWLIST` | — | Comma-separated allowed partner origins for integration/enterprise return URLs (open-redirect allowlist) |
| `SSRF_ALLOWED_PRIVATE_CIDRS` | — | Comma-separated private CIDRs to allow for self-hosted provider instances (opt-in SSRF exception). Without this, all private/internal ranges are blocked. |
| `NOT_SECURED` | — | Dev-only toggle. Skips Helmet, HSTS, CSRF enforcement, and CopilotKit policy gating. Never set in production. |

## Payments (Stripe)

| Variable | Default | Purpose |
|----------|---------|---------|
| `STRIPE_PUBLISHABLE_KEY` | — | Stripe publishable key |
| `STRIPE_SECRET_KEY` | — | Stripe secret key |
| `STRIPE_SIGNING_KEY` | — | Stripe webhook signing secret |

## SSO / OIDC login

See [OAuth / SSO](./oauth-sso.md) for a complete setup walkthrough.

> **v3.8.10:** login providers (Google, GitHub, generic OIDC) are now managed **in-app** by a
> super-admin at `/admin` (stored encrypted in `AuthProviderConfig`). The env vars below remain
> supported as the **bootstrap fallback** — they are used only when no enabled DB config exists
> for that provider, so the first operator can always log in. Email/password (`LOCAL`) login is
> always available regardless of provider config.

| Variable | Default | Purpose |
|----------|---------|---------|
| `IS_GENERAL` | — | Required to be `true` for the standard self-hosted deployment |
| `POSTMILL_GENERIC_OAUTH` | `false` | Set to `true` to enable generic OIDC login |
| `POSTMILL_OAUTH_AUTH_URL` | — | OIDC provider authorization endpoint |
| `POSTMILL_OAUTH_TOKEN_URL` | — | OIDC provider token endpoint |
| `POSTMILL_OAUTH_USERINFO_URL` | — | OIDC provider userinfo endpoint |
| `POSTMILL_OAUTH_CLIENT_ID` | — | OIDC client ID |
| `POSTMILL_OAUTH_CLIENT_SECRET` | — | OIDC client secret |
| `POSTMILL_OAUTH_SCOPE` | `openid profile email` | OIDC scopes to request |
| `NEXT_PUBLIC_POSTMILL_OAUTH_DISPLAY_NAME` | — | Name shown on the login button |
| `NEXT_PUBLIC_POSTMILL_OAUTH_LOGO_URL` | — | Logo URL shown on the login button |

## GitHub login

| Variable | Default | Purpose |
|----------|---------|---------|
| `GITHUB_CLIENT_ID` | — | GitHub OAuth app client ID (bootstrap fallback; configure in `/admin` since v3.8.10) |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth app client secret (bootstrap fallback) |

Google login similarly reads `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` as its bootstrap
fallback (login only — channel credentials are configured in Settings → Channels).

## Browser extension

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXTENSION_ID` | — | Chrome extension ID for cookie-based platform integrations (Skool) |

## Monitoring

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | — | Sentry DSN for error tracking (frontend) |
| `SENTRY_SPOTLIGHT` | — | Set to `1` to enable Spotlight debug proxy |

## Miscellaneous

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_DISCORD_SUPPORT` | — | Discord support server invite URL |
| `NX_ADD_PLUGINS` | — | Nx build plugin setting (development) |
| `PORT` | `3000` | Backend listen port inside the container |

## Stock Media (v3.8)

| Variable | Default | Purpose |
|----------|---------|---------|
| `UNSPLASH_ACCESS_KEY` | — | Unsplash API access key for stock photo browsing and download |
| `PEXELS_API_KEY` | — | Pexels API key for stock video browsing and download |
| `PIXABAY_API_KEY` | — | Pixabay API key for free vector/illustration browsing |
| `GIPHY_API_KEY` | — | GIPHY API key for free sticker browsing |
| `JAMENDO_CLIENT_ID` | — | Jamendo API client ID for stock audio browsing in the video editor |

Iconify (SVG icons) does not require an API key.

### Content Packs (v3.8.10+)

Premium stock sources are configured **per-organization** in-app via **Settings → Content Packs**.
Bring-your-own-key (BYOK) packs take precedence over the free catalogs above for the capabilities
they support.

| Provider | Setup location | Notes |
|----------|----------------|-------|
| **Magnific** | Settings → Content Packs | Add your Magnific API key; it is encrypted at rest and never returned to the client. Supports photos, vectors, icons, and videos. |

## Variables no longer read (v3.7.1+)

The following patterns are no longer supported as environment variables. Configure them in-app:

- All `*_CLIENT_ID` / `*_CLIENT_SECRET` vars for channel providers (LinkedIn, Facebook, X, etc.)
- `*_APP_ID` / `*_APP_SECRET` vars for channel providers
- `TELEGRAM_TOKEN`
- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`
- `GOOGLE_GMB_CLIENT_ID` / `GOOGLE_GMB_CLIENT_SECRET`
- `OPENAI_API_KEY` and any other AI provider key
- `POSTIZ_*` prefixed variables (renamed to `POSTMILL_*` in v3.7.0)
- **Short-link provider vars** (removed v3.8.0): `DUB_TOKEN`, `DUB_API_ENDPOINT`, `DUB_SHORT_LINK_DOMAIN`, `SHORT_IO_SECRET_KEY`, `KUTT_API_KEY`, `KUTT_API_ENDPOINT`, `KUTT_SHORT_LINK_DOMAIN`, `LINK_DRIP_API_KEY`, `LINK_DRIP_API_ENDPOINT`, `LINK_DRIP_SHORT_LINK_DOMAIN` — now configured per-org in Settings → Shortlinks
- **Storage env vars** (removed v3.8.2): `STORAGE_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_KEY`, `CLOUDFLARE_SECRET_ACCESS_KEY`, `CLOUDFLARE_BUCKETNAME`, `CLOUDFLARE_BUCKET_URL`, `CLOUDFLARE_REGION` — storage is now per-tenant via Settings → Storage. The built-in default is LOCAL.

The **login** provider env vars (`GITHUB_CLIENT_*`, `YOUTUBE_CLIENT_*` for Google login,
`POSTMILL_OAUTH_*`) are an exception to the no-env rule: they remain readable as the bootstrap
fallback for `/admin`-managed auth providers (v3.8.10) and must never be used for channel or AI
credentials.

> Verified against v3.9.0

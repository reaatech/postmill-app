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
| `REDIS_URL` | — | Redis connection string |
| `JWT_SECRET` | — | Secret key for signing JWT tokens; also used as encryption key fallback |
| `FRONTEND_URL` | — | Public-facing URL of the application (e.g. `https://postmill.example.com`) |
| `NEXT_PUBLIC_BACKEND_URL` | — | Public URL of the backend API (e.g. `https://postmill.example.com/api`) |
| `BACKEND_INTERNAL_URL` | — | Internal URL for backend-to-backend calls (e.g. `http://localhost:3000`) |
| `MAIN_URL` | — | Alternative public URL, used in Docker Compose alongside `FRONTEND_URL` |

## Storage

| Variable | Default | Purpose |
|----------|---------|---------|
| `UPLOAD_DIRECTORY` | — | Local path for file uploads when using local storage (e.g. `/uploads`) |
| `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY` | — | Public URL path serving uploads (e.g. `/uploads`) |
| `STORAGE_PROVIDER` | `local` | Default storage backend (`local` or `cloudflare`). Per-org overrides in Settings -> Storage take precedence. |

### Cloudflare R2

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLOUDFLARE_ACCOUNT_ID` | — | Cloudflare account ID |
| `CLOUDFLARE_ACCESS_KEY` | — | R2 access key ID |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | — | R2 secret access key |
| `CLOUDFLARE_BUCKETNAME` | — | R2 bucket name |
| `CLOUDFLARE_BUCKET_URL` | — | Public URL of the R2 bucket |
| `CLOUDFLARE_REGION` | `auto` | R2 region |

## Email

| Variable | Default | Purpose |
|----------|---------|---------|
| `RESEND_API_KEY` | — | Resend API key for transactional email. If absent, user activation is automatic. |
| `EMAIL_FROM_ADDRESS` | — | Sender email address |
| `EMAIL_FROM_NAME` | — | Sender display name |
| `DISABLE_REGISTRATION` | `false` | Set to `true` to disable self-registration |

## Analytics & background jobs

| Variable | Default | Purpose |
|----------|---------|---------|
| `RUN_CRON` | `false` | Set to `true` on exactly one orchestrator instance to start perpetual workflows. See [Temporal & Cron](./temporal-and-cron.md). |
| `ANALYTICS_DAILY_RETENTION_DAYS` | `548` | Days to keep daily channel snapshots before rolling up to weekly (~18 months) |
| `ANALYTICS_POST_RETENTION_DAYS` | `90` | Days to keep per-post snapshots before pruning |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server gRPC address |
| `TEMPORAL_TLS` | — | Set to enable TLS to Temporal |
| `TEMPORAL_API_KEY` | — | Temporal API key for cloud or mTLS setups |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
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
| `GITHUB_CLIENT_ID` | — | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | — | GitHub OAuth app client secret |

## Browser extension

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXTENSION_ID` | — | Chrome extension ID for cookie-based platform integrations (Skool) |

## Short link services

All optional. Leave blank if unused.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DUB_TOKEN` | — | Dub.co API token |
| `DUB_API_ENDPOINT` | `https://api.dub.co` | Dub API endpoint |
| `DUB_SHORT_LINK_DOMAIN` | `dub.sh` | Dub short link domain |
| `SHORT_IO_SECRET_KEY` | — | Short.io API secret key |
| `KUTT_API_KEY` | — | Kutt.it API key |
| `KUTT_API_ENDPOINT` | `https://kutt.it/api/v2` | Kutt API endpoint |
| `KUTT_SHORT_LINK_DOMAIN` | `kutt.it` | Kutt short link domain |
| `LINK_DRIP_API_KEY` | — | LinkDrip API key |
| `LINK_DRIP_API_ENDPOINT` | `https://api.linkdrip.com/v1/` | LinkDrip API endpoint |
| `LINK_DRIP_SHORT_LINK_DOMAIN` | `dripl.ink` | LinkDrip short link domain |

## Monitoring

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | — | Sentry DSN for error tracking (frontend) |
| `SENTRY_SPOTLIGHT` | — | Set to `1` to enable Spotlight debug proxy |

## Miscellaneous

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_DISCORD_SUPPORT` | — | Discord support server invite URL |
| `NEXT_PUBLIC_POLOTNO` | — | Polotno license key for the image editor |
| `NX_ADD_PLUGINS` | — | Nx build plugin setting (development) |
| `PORT` | `3000` | Backend listen port inside the container |

## Variables no longer read (v3.7.1+)

The following patterns are no longer supported as environment variables. Configure them in-app:

- All `*_CLIENT_ID` / `*_CLIENT_SECRET` vars for channel providers (LinkedIn, Facebook, X, etc.)
- `*_APP_ID` / `*_APP_SECRET` vars for channel providers
- `TELEGRAM_TOKEN`
- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`
- `GOOGLE_GMB_CLIENT_ID` / `GOOGLE_GMB_CLIENT_SECRET`
- `OPENAI_API_KEY` and any other AI provider key
- `POSTIZ_*` prefixed variables (renamed to `POSTMILL_*` in v3.7.0)

> Verified against v3.7.0

# Admin Overview

Super-admins get an extra set of controls surfaced from the impersonation/admin bar. This page maps
that surface; each item links to its own page where there's more to say.

> **Verified against v3.4.0.** All admin endpoints are gated server-side: a non-super-admin request
> is rejected (HTTP 400 "Unauthorized"), regardless of what the UI shows.

---

## Who is a super-admin

A user with `isSuperAdmin = true`. Channel configuration is additionally hidden in the nav for
non-super-admins; the errors, stats, and AI screens are reachable from the admin bar but their
backing endpoints enforce the super-admin check themselves.

## The admin surface

| Control | Where | What it does | Docs |
|---------|-------|--------------|------|
| **Channels** | `/admin/channels` | Configure provider credentials (encrypted), enable/disable providers, add setup instructions. | [Channels admin](./channels.md) |
| **AI** | `/admin/ai` | Configure AI providers/models, test connections, governance, spend, audit, health. | [AI settings admin](./ai-settings.md) |
| **View Errors** | `/admin/errors` | Browse captured posting/integration errors by platform/user. | [Errors & stats](./errors-and-stats.md) |
| **View Stats** | `/admin/stats` | Instance usage statistics over a date range. | [Errors & stats](./errors-and-stats.md) |
| **Impersonation** | admin bar | Act as another user for support/debugging. | [Users & impersonation](./users-and-impersonation.md) |

## Backend routes behind these screens

- `/admin/channel-configs` — channel configuration (super-admin).
- `/admin/ai-settings` — AI provider, governance, spend, audit, health (super-admin).
- `/admin/errors`, `/admin/errors/platforms`, `/admin/stats` — diagnostics (super-admin).

## First-run admin checklist

1. **Set credentials safely** — confirm `JWT_SECRET` is a long, stable secret; it encrypts every
   credential you store below. See [Configuration](../self-hosting/configuration.md).
2. **Configure channels** — enable the providers you want and enter their app credentials in
   [Channels admin](./channels.md).
3. **(Optional) Configure AI** — only needed for non-OpenAI providers or governance; otherwise the
   `OPENAI_API_KEY` fallback applies. See [AI settings admin](./ai-settings.md).
4. **Enable background collection** — set `RUN_CRON=true` on one orchestrator instance so analytics
   and comment sync populate. See [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

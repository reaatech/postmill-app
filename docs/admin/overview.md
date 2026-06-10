# Admin Overview

Super-admins get an extra set of controls surfaced from the impersonation/admin bar. This page maps
that surface; each item links to its own page where there's more to say.

> v3.6.0 removes the admin-only routes and pages — all settings are now
> tenant-scoped from the settings sidebar. The admin bar (impersonation) remains, but the admin
> Channels, AI, Dashboard, and Errors pages are deleted. Their functionality moved to per-tenant
> settings tabs (Settings → Channels, Settings → AI, etc.).
> is rejected (HTTP 400 "Unauthorized"), regardless of what the UI shows.

---

## Who is a super-admin

A user with `isSuperAdmin = true`. Channel configuration is additionally hidden in the nav for
non-super-admins; the errors, stats, and AI screens are reachable from the admin bar but their
backing endpoints enforce the super-admin check themselves.

## The admin surface

| Control | Where | What it does | Docs |
|---------|-------|--------------|------|
| **Channels** | Settings → Channels | Configure per-tenant OAuth credentials (encrypted), enable/disable providers, add setup instructions. | [Channels admin](./channels.md) |
| **AI** | Settings → AI | Configure per-tenant AI providers/models, test connections, governance, spend, audit, health. | [AI settings admin](./ai-settings.md) |
| **Errors & Stats** | Settings → Settings (error logs) | Browse captured posting/integration errors and instance usage statistics. | [Errors & stats](./errors-and-stats.md) |
| **Impersonation** | admin bar | Act as another user for support/debugging. | [Users & impersonation](./users-and-impersonation.md) |

## Backend routes

- `/settings/channel-configs` — channel configuration (org-scoped).
- `/settings/ai` — AI provider, governance, spend, audit, health (org-scoped).
- `/settings/errors`, `/admin/stats` — diagnostics.

## First-run admin checklist

1. **Set credentials safely** — confirm `JWT_SECRET` is a long, stable secret; it encrypts every
   credential you store below. See [Configuration](../self-hosting/configuration.md).
2. **Configure channels** — enable the providers you want and enter their app credentials in
   **Settings → Channels**.
3. **Configure AI** — set up your AI provider and model in **Settings → AI** (no env fallback).
4. **Enable background collection** — set `RUN_CRON=true` on one orchestrator instance so analytics
   and comment sync populate. See [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

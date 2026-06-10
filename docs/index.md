# Postmill Documentation

Documentation for **Postmill**, a fork of [Postiz](https://github.com/gitroomhq/postiz-app).
Postmill schedules social media and chat posts to 36 channels, with a calendar, persisted analytics,
team management, a media library, and a pluggable AI layer.

> See the [CHANGELOG](https://github.com/reaatech/postmill-app/blob/main/CHANGELOG.md) for the full
> change history.
>
> **This is a fork.** The upstream docs at `docs.postiz.com` describe the *original* project and
> no longer match this fork's behaviour. Start with
> [What's different from upstream](./CHANGES_FROM_UPSTREAM.md).

---

## I want to…

**…understand what this is**
- [Overview & architecture](./getting-started/overview.md)
- [What's different from upstream](./CHANGES_FROM_UPSTREAM.md)

**…run it myself (operators / self-hosters)**
- [Requirements](./self-hosting/requirements.md) · [Quickstart](./getting-started/quickstart.md)
- [Run with Docker Compose](./self-hosting/docker.md)
- [Configuration / environment variables](./self-hosting/configuration.md)
- [Storage provider setup (S3, R2, B2, IDrive)](./self-hosting/storage.md)
- [Temporal & background jobs (RUN_CRON)](./self-hosting/temporal-and-cron.md)
- [Upgrading](./self-hosting/upgrading.md) · [Backup & retention](./self-hosting/backup-and-retention.md)

**…administer an instance (organization admins)**
- [Channel provider setup (per-tenant OAuth)](./admin/channels.md) — moved to org-level in v3.6.0
- [AI provider setup (per-tenant configuration)](./admin/ai-settings.md) — moved to org-level in v3.6.0
- [Users & impersonation](./admin/users-and-impersonation.md) · [Errors & stats](./admin/errors-and-stats.md)

**…use the features**
- [Calendar & Post Detail](./features/calendar-and-posts.md)
- [Analytics](./features/analytics.md) · [Watchlist & competitor tracking](./features/watchlist.md)
- [Social comments](./features/social-comments.md)
- [Campaigns](./features/campaigns.md) · [Bulk scheduling / CSV import](./features/bulk-scheduling.md)
- [Media manager](./media/) · [Storage settings](./self-hosting/storage.md)
- [Content QA preflight](./features/content-qa-preflight.md) · [Provider capabilities](./features/provider-capabilities.md)
- [AI features](./features/ai-features.md) · [AI generation](./features/ai-generation.md) · [AI settings & RAG](./ai/)

**…understand the channels**
- [Channels overview (the 36 providers)](./channels/overview.md)
- [Per-provider setup](./channels/setup-per-provider.md) · [Tumblr, Pixelfed & PeerTube](./channels/tumblr-pixelfed-peertube.md) · [Comments support](./channels/comments.md)

**…build on it (developers)**
- [Architecture](./developers/architecture.md) · [Backend](./developers/backend.md) · [Frontend](./developers/frontend.md) · [Database](./developers/database.md)
- [AI architecture](./developers/ai-architecture.md) · [Add a provider](./developers/adding-a-provider.md) · [Add an AI adapter](./developers/adding-an-ai-adapter.md)
- [Testing](./developers/testing.md) · [Contributing](./developers/contributing.md)

**…integrate via API**
- [API overview](./api/overview.md) · [Public API](./api/public-api.md) · [Analytics v2 API](./api/analytics-v2-api.md)
- [MCP](./api/mcp.md) · [Automation (n8n / Make / SDK)](./api/automation.md)

**…look something up**
- [Environment variables](./reference/env-vars.md) · [Data model](./reference/data-model.md) · [Glossary](./reference/glossary.md)

---

## Documentation map

> Pages marked _(planned)_ are not written yet — this docs set is being built in phases.
> Everything else is live.

```
getting-started/
  overview.md              ✅ What Postmill is, architecture
  quickstart.md            ✅ Fastest path to a running local instance

self-hosting/
  docker.md                ✅ Run with Docker Compose
  configuration.md         ✅ Environment variable reference
  storage.md               ✅ Storage provider setup (S3, R2, B2, IDrive e2)
  temporal-and-cron.md     ✅ Workflows, RUN_CRON, which instance runs what
  requirements.md          ✅ Services + build toolchain
  upgrading.md             ✅ Release/upgrade path, schema sync
  backup-and-retention.md  ✅ What to back up, analytics retention

admin/
  overview.md              ✅ Super-admin surface map
  channels.md              ✅ DB-backed provider configuration
  ai-settings.md           ✅ AI providers, models, governance
  errors-and-stats.md      ✅ Diagnostics screens
  users-and-impersonation.md ✅ Impersonation, super-admin vs user

channels/
  overview.md              ✅ The 36 providers + auth models
  setup-per-provider.md    ✅ Per-provider app/credential setup
  tumblr-pixelfed-peertube.md ✅ Fork-added providers
  comments.md              ✅ Comment-sync capability matrix

features/
  calendar-and-posts.md    ✅ Calendar, scheduling, Post Detail modal
  analytics.md             ✅ v2 dashboard, snapshots, export, best-time, recommendations
  watchlist.md             ✅ Competitor/watchlist tracking
  social-comments.md       ✅ Synced comments, cross-channel inbox, first comment
  campaigns.md             ✅ Campaign folders for posts/analytics/comments
  bulk-scheduling.md       ✅ Bulk CSV import / paste rows
  content-qa-preflight.md  ✅ Pre-publish QA checks (warnings vs blockers)
  provider-capabilities.md ✅ Provider capability matrix
  ai-features.md           ✅ Brand profiles, prompts, hashtags, sentiment, compliance, brand memory
  ai-generation.md         ✅ Text/image gen, brand voice, what works vs stubs

media/
  index.md                 ✅ Media manager guide (folders, tags, bulk actions, drag-drop)

ai/
  index.md                 ✅ Per-tenant AI provider + model guide; Brand/RAG knowledge-base

api/
  overview.md              ✅ Surfaces, auth, rate limits
  public-api.md            ✅ /public/v1 endpoints (legacy shapes frozen)
  analytics-v2-api.md      ✅ /analytics/v2 endpoint reference
  mcp.md                   ✅ Scopes, auth hardening, transports
  automation.md            ✅ n8n / Make / SDK pointers

developers/
  architecture.md          ✅ Monorepo layout, layering, subsystems
  backend.md               ✅ NestJS Controller→Service→Repository
  frontend.md              ✅ Next.js App Router, SWR/useFetch, Tailwind 3
  database.md              ✅ Prisma db push, schema-change safety
  ai-architecture.md       ✅ AIModelProvider facade, registry, governance
  adding-a-provider.md     ✅ New social provider, step by step
  adding-an-ai-adapter.md  ✅ New AI adapter, step by step
  testing.md               ✅ Vitest per-package, CI gate
  contributing.md          ✅ Ground rules, invariants, process

reference/
  env-vars.md              ✅ Grouped environment variable table
  data-model.md            ✅ Prisma models by domain
  glossary.md              ✅ Terms
```

---

## About this fork

Maintained by [REAA](https://reaatech.com). Source and full changelog:
[github.com/reaatech/postmill-app](https://github.com/reaatech/postmill-app).
Licensed under [AGPL-3.0](https://github.com/reaatech/postmill-app/blob/main/LICENSE).

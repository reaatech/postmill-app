# What's Different From Upstream

This fork (**Postiz REAA Flavor**) has diverged substantially from
[gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app). The upstream documentation at
`docs.postiz.com` no longer describes how this fork behaves. This page is the canonical summary of
the differences; the [CHANGELOG](../CHANGELOG.md) has the full detail per release.

> **Verified against v3.4.0.**

---

## At a glance

| Area | Upstream | This fork |
|------|----------|-----------|
| Channel credentials | Environment variables only | DB-backed, encrypted, managed in an admin UI (env still works as fallback) |
| Channel count | Upstream set | **36** providers (adds Tumblr, Pixelfed, PeerTube) |
| Analytics | Single-channel, live fetch on demand | Persisted multi-channel dashboard from daily snapshots (`/analytics/v2`) |
| Calendar | Card click opens edit modal | Card body opens a **Post Detail** modal; a settings icon opens edit |
| Comments | — | Synced social comments foundation with per-user read state |
| AI | Single hardcoded OpenAI integration | Pluggable multi-provider system with admin config + governance |
| MCP | — | 5 entrypoints hardened with scope enforcement, rate limiting, idempotency |
| Container image | `ghcr.io/gitroomhq/postiz-app` | `ghcr.io/reaatech/postiz-app` |

---

## v3.4.0 — Pluggable AI provider system

The AI layer is now an admin-configurable, governed, multi-provider system that replaces the single
hardcoded OpenAI integration.

- **12 distinct provider adapters** (OpenAI, Anthropic, Azure, Vercel AI Gateway, Amazon Bedrock,
  Google, Google Vertex, Groq, Cohere, Mistral, xAI Grok, OpenRouter) plus a generic
  OpenAI-compatible adapter covering 14 more hub providers.
- **Admin AI Settings** at `/admin/ai` — pick provider/model, store encrypted credentials, test the
  connection, set the active provider, and configure governance.
- **Governance** — input/output guardrails (prompt-injection, PII, brand safety, NSFW), per-scope
  budgets with threshold alerts, OpenTelemetry GenAI telemetry, and provider-health tracking.
- **Backward compatible** — with no admin AI config, behaviour is byte-for-byte the same as today's
  `OPENAI_API_KEY` path. Setting the active provider to none reverts every AI surface to the env
  fallback.

See [AI settings admin](./admin/ai-settings.md).

## v3.3.0 — Calendar, post detail & social comments

- Clicking a calendar card **body** opens a new **Post Detail** modal (KPI header + post thread);
  the edit modal now opens from a settings icon on the card's hover strip.
- A scheduled/published pill and a card stats footer (views/likes/comments) are sourced from
  persisted post snapshots.
- Foundation for **social comments** — synced platform comments, per-user read state, and a
  Temporal sync workflow (gated by `RUN_CRON`).

## v3.2.0 — Three extra providers (36 channels)

Adds **Tumblr** (OAuth2, NPF posts), **Pixelfed** (instance URL + access token, Mastodon-compatible),
and **PeerTube** (instance URL + login, single-video uploads). No database migration required.

## v3.1.0 — Persisted analytics dashboard

Replaces single-channel live-fetch analytics with a persisted multi-channel dashboard. Daily metric
snapshots are collected by a Temporal workflow (requires `RUN_CRON=true` on one orchestrator
instance) and served through `/analytics/v2` with real period-over-period comparisons, charts, and
CSV/JSON export. Daily snapshots roll up to weekly after ~18 months; per-post snapshots prune after
90 days (both windows env-configurable). See [Temporal & background jobs](./self-hosting/temporal-and-cron.md).

## v3.0.0 — Database-backed provider configuration

Channel OAuth/API credentials are managed through an admin UI at `/admin/channels` instead of
environment variables, and are encrypted at rest. Environment variables remain a fallback: with no
DB configs present, providers fall back to `process.env`. A one-time migration script imports
existing env credentials into the database. See [Channels admin](./admin/channels.md).

---

## Backward compatibility commitments

This fork is run in production. Two invariants are deliberately preserved:

1. **AI env fallback** — no admin AI config means the original `OPENAI_API_KEY` behaviour, unchanged.
2. **Legacy public analytics route** — the original public API analytics route keeps its response
   shape for n8n/Zapier/Make compatibility; a parallel v2 route was added rather than changing it.

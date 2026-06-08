# What's Different From Upstream

This fork (**Postiz REAA Flavor**) has diverged substantially from
[gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app). The upstream documentation at
`docs.postiz.com` no longer describes how this fork behaves. This page is the canonical summary of
the differences; the [CHANGELOG](../CHANGELOG.md) has the full detail per release.

> **Verified against v3.5.0.**

---

## AI at the core

This is an **AI-native** fork. Where upstream ships a single hardcoded OpenAI integration, this fork
runs a governed, multi-provider AI layer under the entire platform: bring your own keys across **25
providers** — 13 direct model providers (OpenAI, Anthropic, Google Gemini, xAI Grok, Meta Llama,
Mistral, DeepSeek, Cohere, Perplexity, Groq, Qwen, MiniMax, Azure OpenAI) plus 12 multi-model hubs &
gateways (Amazon Bedrock, Google Vertex AI, OpenRouter, Vercel AI Gateway, Together AI, Fireworks AI,
DeepInfra, SiliconFlow, Lightning AI, GMI Cloud, Bitdeer, Vultr) — pick the exact model from an admin
screen, and switch providers everywhere without a redeploy. On top of it: on-brand content generation, smart comment replies,
brand-voice profiles, a shared prompt library, semantic (RAG) search over your own content,
compliance guardrails (prompt-injection / PII / brand-safety / NSFW), and per-org spend caps with a
full audit log — every AI entry point scoped, rate-limited, and budget-checked.

Everything below builds around that foundation.

---

## At a glance

| Area | Upstream | This fork |
|------|----------|-----------|
| AI | Single hardcoded OpenAI integration | Governed multi-provider system (**25 providers** — 13 direct + 12 multi-model hubs/gateways, BYO keys) with admin config, guardrails, RAG, and per-org spend caps |
| Channel credentials | Environment variables only | DB-backed, encrypted, managed in an admin UI (env still works as fallback) |
| Channel count | Upstream set | **36** providers (adds Tumblr, Pixelfed, PeerTube) |
| Analytics | Single-channel, live fetch on demand | Persisted multi-channel dashboard from daily snapshots (`/analytics/v2`) |
| Calendar | Card click opens edit modal | Card body opens a **Post Detail** modal; a settings icon opens edit |
| Comments | — | Synced social comments foundation with per-user read state |
| MCP | — | 5 entrypoints hardened with scope enforcement, rate limiting, idempotency |
| Container image | `ghcr.io/gitroomhq/postiz-app` | `ghcr.io/reaatech/postiz-app` |

---

## v3.5.0 — Security hardening + feature expansion

A codebase-hardening and feature-expansion release. Every change is additive or a refactor under
existing contracts — no breaking changes, no schema renames.

**Security & infrastructure hardening**

- **SSRF-safe outbound dispatch** — a single `safeFetch` helper (validate + manual redirect
  re-validation via `ssrfSafeDispatcher`) now fronts all webhook dispatch and user-influenced
  provider fetches, closing blind-SSRF / DNS-rebinding / redirect-to-metadata holes.
- **Encryption at rest** — versioned AES-GCM `EncryptionService` (`v2:` prefix); `Integration.token`
  / `refreshToken` are now encrypted, with transparent legacy-plaintext read fallback. Optional
  dedicated `ENCRYPTION_KEY`, falling back to `JWT_SECRET`.
- **Response headers & PII scrubbing** — helmet (HSTS, CSP, noSniff, frameguard) plus a Sentry
  `beforeSend`/`beforeBreadcrumb` scrubber that strips auth headers, cookies, tokens, and PII. CSRF
  middleware on cookie-authenticated mutating routes. All bypass under `NOT_SECURED` (dev-only).
- **Throttle guard fix** — the throttler now applies its default limit to all routes (most routes
  previously bypassed it), so per-route `@Throttle` caps actually take effect.
- **OAuth 2.0 / PKCE hardening**, JWT algorithm pinning + expiry/renewal, CSPRNG IDs, open-redirect
  allowlisting (`INTEGRATION_RETURN_URL_ALLOWLIST`), bounded analytics query validation, and a
  multipart-upload ownership ledger.
- **CI** — a `pnpm audit --audit-level=high` workflow on PRs and weekly.

**New feature surfaces**

- **Analytics** — best-time-to-post heatmap (`/analytics/v2/best-time`), recommendations action tab
  (`/analytics/v2/recommendations`), competitor watchlist CRUD (`/analytics/v2/watchlist`), and a 60s
  Redis cache on the overview endpoint.
- **AI utilities** — hashtag generator, content-compliance checker, comment sentiment/summary modes,
  and brand-memory (RAG) index/search — all rate-limited.
- **Composer** — content-QA preflight (`/posts/preflight`) and bulk/CSV scheduling (`/posts/bulk`).
- **Social** — cross-channel comment inbox (`/posts/inbox`), first-comment and poll support gated on
  a new provider **capability matrix** (`/provider-capabilities`).
- **Campaigns** — campaign folders (`/campaigns`) grouping posts/assets/analytics/comments.
- **Webhooks** — new event types: `comment.new`, `comment.reply`, `analytics.snapshot_complete`.

See [API overview](./api/overview.md), [Data model](./reference/data-model.md), and the
[developer architecture notes](./developers/architecture.md).

## v3.4.0 — Pluggable AI provider system

The AI layer is now an admin-configurable, governed, multi-provider system that replaces the single
hardcoded OpenAI integration.

- **25 providers** — 13 direct model providers (OpenAI, Anthropic, Google Gemini, xAI Grok, Meta
  Llama, Mistral, DeepSeek, Cohere, Perplexity, Groq, Qwen, MiniMax, Azure OpenAI) plus 12
  multi-model hubs & gateways (Amazon Bedrock, Google Vertex AI, OpenRouter, Vercel AI Gateway,
  Together AI, Fireworks AI, DeepInfra, SiliconFlow, Lightning AI, GMI Cloud, Bitdeer, Vultr).
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

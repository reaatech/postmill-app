# Glossary

Terminology reference for the Postmill platform.

## Core Concepts

**Postmill**
The application itself — a social media and chat post scheduling platform supporting 36+ channels.
Forked from Postiz, rebranded in v3.7.0.

**Organization**
A tenant / workspace. All data (posts, channels, media, analytics, AI config) belongs to exactly
one organization. Every request is org-scoped.

**Channel / Provider**
A social media platform or chat service integration (e.g., X, LinkedIn, Discord, Telegram).
"Provider" is the platform; "channel" is the conceptual endpoint. See
[Provider Capabilities](./provider-capabilities.md) for the full matrix.

**Integration**
A single connected channel instance — credentials and settings for one account on one platform.
Stored as an `Integration` row, encrypted at rest via `EncryptionService`.

**Temporal**
The workflow engine that schedules and executes publish workflows. Postmill uses Temporal's
TypeScript SDK to run durable, retryable workflows for post publishing, analytics collection,
and comment syncing.

**Orchestrator**
The Temporal worker application (`apps/orchestrator`) that hosts workflow and activity
implementations. Requires `RUN_CRON=true` to activate scheduled workflows (analytics sweeps,
comment syncs).

**Durable Execution**
A Temporal execution model where workflow state is persisted on every step. If the worker
restarts mid-workflow, execution resumes from the last persisted step — no lost progress.

---

## Post Lifecycle

**Post**
A scheduled content item. Has content (text, media, poll settings), a target set of channels, a
scheduled date/time, and optional campaign, first-comment, and signature settings.

**Schedule** (previously Launches/Calendar)
The scheduling interface at `/schedule`. A grid view where users create, schedule, and
manage posts.

**Workflow**
A Temporal workflow that executes post publishing. The current version (v1.0.6) handles: preflight
validation, media upload, post creation per channel, optional first comment, and state management
(draft → publishing → published / failed).

**First Comment**
An auto-posted comment that follows immediately after a successful publish. Configured per-post
via `settings.firstComment`. Idempotent (records `firstCommentPostedAt` so retries cannot
double-post). Gated on `providerCapabilities.firstComment`.

**Preflight**
Pre-publish validation that checks content limits, media formats, poll option validity, provider
capability constraints, and platform-specific requirements. Runs client-side in the composer and
server-side in the workflow before any publish attempt.

---

## Analytics

**AnalyticsSnapshot**
A daily aggregated metric row per channel/provider. Collected by a Temporal sweep workflow.
Contains follower counts, engagement metrics, and reach data.

**PostAnalyticsSnapshot**
A daily aggregated metric row per individual post. Contains views, likes, comments, shares, and
other post-specific engagement data.

**Rollup**
Daily `AnalyticsSnapshot` rows older than ~18 months (configurable via
`ANALYTICS_DAILY_RETENTION_DAYS`) are rolled up into one weekly row per (integration, metric,
ISO week). Flow metrics are summed; stock metrics keep the week's latest value.
`PostAnalyticsSnapshot` rows are pruned after 90 days (`ANALYTICS_POST_RETENTION_DAYS`).

**Watchlist**
Competitor account monitoring. `WatchedAccount` rows track public metrics for competitor accounts,
collected during the same analytics sweep. Probe failures (403/unsupported) auto-disable the
capability. Gated on `providerCapabilities.watchlist`.

---

## AI

**AIModelProvider**
The central AI facade. A single injection point that resolves models per scope and organization.
Precedence: per-org stub → per-scope → global active → provider default. Provides `generateText`,
`generateObject`, and `imageModel` wrappers.

**Scope**
The AI surface designation that determines which model/provider is used:
- `utility` — text generation, prompt responses, slides
- `generator` — LangGraph-based `/agents` content generator
- `agent` — Mastra chat agent (MCP server)
- `mcp` — CopilotKit runtime chat

**Adapter**
A provider-specific implementation of `AIProviderAdapter`. Each of the 25 supported AI providers
implements `createLanguageModel`, `createLangchainModel`, and optionally `createImageModel`,
`createEmbeddingModel`, or `createSpeechModel`.

**Governance**
The AI compliance layer: `GuardrailService` (prompt-injection, PII, brand-safety, NSFW filtering),
`BudgetService` (per-scope spend caps with threshold alerts), `TelemetryService` (OpenTelemetry
GenAI tracing), and `ProviderHealthService` (connection health tracking).

**RAG**
Retrieval Augmented Generation — semantic search over the organization's past content.
Uses pgvector with HNSW ANN indexes for similarity search, a Redis-based indexing queue for
durability, and org-scoped search. All raw SQL is confined to `AiRagRepository`.

**Media Pipeline**
AI-powered media operations: image generation, video generation (Luma), text-to-speech
(ElevenLabs/OpenAI), speech-to-text (Deepgram/OpenAI), upscale, background removal, and inpainting.
Wired via `@reaatech/media-pipeline-mcp-*`, each gated on its configured provider. Includes C2PA
provenance and cost ledger.

**CopilotKit**
An in-app AI copilot framework that provides `/copilot/chat` and `/copilot/agent` endpoints.
The frontend runtime is unmounted when an org has no active AI provider, routing users to
Settings → AI instead.

**C2PA**
Coalition for Content Provenance and Authenticity. A standard for embedding provenance
metadata in AI-generated media, ensuring generated images and videos carry tamper-evident
origin claims.

---

## Social

**SocialComment**
A synced platform comment from a social provider. Stored in the `SocialComment` table with
platform ID, parent tracking (threading), status, sentiment, priority, and assignment. Synced
periodically by the Temporal `commentsCollectionWorkflow`.

**PostCommentRead**
Per-user read-state tracking for the comment inbox. Records which comments each user has seen,
enabling unread counts and the unified inbox.

**Comment Inbox**
The unified cross-channel comment view at `/comments`. Filters by unread, assigned, and status.
Supports bulk mark-read, quick replies, and sentiment/priority badges.

---

## Architecture

**safeFetch**
The SSRF-safe HTTP client. All outbound HTTP on user-influenced URLs goes through `safeFetch`,
which performs `isSafePublicHttpsUrl` validation followed by an `ssrfSafeDispatcher` that
re-validates every hop on a redirect chain. Covers webhook dispatch, provider fetches, and
watchlist probes. No bare `fetch(userUrl)` in the codebase.

**EncryptionService**
AES-256-GCM at-rest encryption for secrets (OAuth tokens, Nostr keys, integration credentials).
Uses versioned `v2:` prefix with an expand-contract read fallback for legacy plaintext data.
Uses `ENCRYPTION_KEY` env var, falling back to derivation from `JWT_SECRET`.

**CSRF**
Cross-Site Request Forgery protection via a cookie + header token pair. Required on all
cookie-authenticated mutating routes. Header/API-key clients are unaffected. Bypassed under
`NOT_SECURED` (dev-only).

**Repository Pattern**
The database access layer. Only repositories (under `nestjs-libraries/src/database/prisma/<domain>/`)
may touch Prisma. Controllers and services must go through repositories — never call Prisma
directly.

**useFetch**
The SWR-based data fetching hook for the frontend (`libraries/helpers/src/utils/custom.fetch.tsx`).
Every SWR call must be its own hook and comply with `react-hooks/rules-of-hooks`.

**Prisma**
The TypeScript ORM and database toolkit used as the data access layer. The single schema file at
`libraries/nestjs-libraries/src/database/prisma/schema.prisma` is the source of truth; the
database is pushed via `prisma db push` rather than SQL migrations.

**Helmet**
An Express middleware that sets secure HTTP response headers (HSTS, CSP, `noSniff`, `frameguard`).
Applied globally in `main.ts`, skipped in dev via the `NOT_SECURED` env var.

**NOT_SECURED**
A dev-only environment variable that disables security hardening: skips Helmet, HSTS, CSRF
middleware, and CopilotKit policy gating. Must never be set in production.

---

## Other

**Plug**
An automation hook — either auto-plug (runs automatically before/after publish) or post-plug
(manual trigger). Used for auto-posting, notifications, and integrations.

**OAuth App**
A third-party OAuth 2.0 application registered in Settings → Developers. Supports PKCE, redirect
URI validation, scopes, and token expiry/hashing.

**MCP**
Model Context Protocol — the entrypoints that expose AI tool access to external clients. 5
entrypoints are hardened with `@reaatech/a2a-reference-auth` scope enforcement, rate limiting,
and idempotency.

**Campaign**
A marketing campaign folder that groups posts. `Post.campaignId` is a nullable foreign key to
`Campaign`. Media, analytics, and comments derive campaign grouping transitively through the
post's `campaignId`.

**Storage Provider**
A media storage backend configured per organization. Supports S3, R2, B2, IDrive e2, and local
disk. Configured via `StorageProviderConfig` in Settings → Storage with per-folder routing and
a 5 GB default quota.

> Verified against v3.7.0

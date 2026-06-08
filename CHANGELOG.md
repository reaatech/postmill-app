# Changelog

> **AI-native fork by [REAA](https://reaatech.com).** A governed, multi-provider AI layer (25
> providers, bring-your-own-keys) powers the platform — on-brand content generation, smart comment
> replies, brand-voice profiles, semantic (RAG) search over your own content, compliance guardrails,
> and per-org spend caps with a full audit log; every AI entry point scoped, rate-limited, and
> budget-checked. Everything else builds around that: persisted multi-channel analytics, a
> cross-channel comment inbox, campaigns, native polls, 36+ channels, and a security-hardened,
> self-hosted stack. Full release history below (newest first).

## [3.5.0] - 2026-06-06

A codebase-hardening + feature-expansion release: a 30-item security cluster, 18 new analytics/AI/social features built on existing infrastructure, and several architecture refactors. Every change is additive or a refactor under existing contracts — no breaking changes, no schema renames.

### Added

- **Analytics: Channel Detail panel (2A)** — Slide-out `ChannelDetailPanel` rendering all per-channel KPIs with time-series area charts and a top-posts table; wires the previously-dead `useChannelDetail` hook and new `useChannelMetric` to `GET /analytics/v2/channel/:id` and `/channel/:id/metric/:metric`.
- **Analytics: Export button (2B)** — Dashboard-header dropdown for the already-wired `GET /analytics/v2/export?format=csv|json`.
- **Analytics: Post detail time-series + metric picker (2C)** — Post detail slide-out renders each metric's `{date,value}[]` series as charts (not just latest value); Posts tab gains a column picker over the 37 canonical metrics.
- **AI: Hashtag generator (2D)** — `POST /ai/hashtags` via `AIModelProvider.generateObject()` with platform-aware prompts; new composer tab. Brand voice, guardrails, and budget auto-applied.
- **AI: Comment sentiment + summary (2E)** — `POST /ai/comment-reply` gains `sentiment`/`summary` modes; sentiment badges and a "summarize comments" action on the comment thread.
- **Social: First comment (2F)** — Auto-posts a first comment after a successful publish via new workflow `post.workflow.v1.0.6`. Capability-gated on `providerCapabilities.firstComment`, idempotent (records the posted comment id / `firstCommentPostedAt` so retries don't double-post), and non-fatal (a failed first comment warns but never fails the post).
- **Analytics: Best Time to Post heatmap (2G)** — `GET /analytics/v2/best-time` returns structured day×hour engagement data; new `BestTimeTab` heatmap. Coexists with the composer's LLM-text `ai.best-time.tsx`; shares the underlying timing/engagement query.
- **Analytics: Recommendations tab (2H)** — `GET /analytics/v2/recommendations` surfaces prioritized actions (underperforming channels, top post patterns, best-time opportunities, missing coverage, comment backlog), each deep-linking into the relevant view.
- **Social: Cross-channel comment inbox (2I)** — Unified inbox over `SocialComment`/`PostCommentRead` with unread/assigned/status filters, sentiment/priority badges, bulk mark-read, and quick replies; new `/comments` route + nav entry.
- **Composer: Content QA preflight panel (2J)** — Pre-schedule preflight checking platform limits, missing alt text, unsupported media, unsafe links, link-preview availability, first-comment/poll compatibility, and AI compliance; returns warnings vs blocking results separately without changing create-post contracts.
- **Notifications: new events wired (2K)** — Reuses the existing notification stack to emit post-publish/first-comment/poll failures, comment-inbox backlog thresholds, AI budget thresholds, and watchlist trend alerts (respecting per-user email prefs).
- **Composer: Bulk scheduling / CSV import (2L)** — `POST /posts/bulk` with a validated row DTO; upload/paste-rows UI with column mapping and preview. Each row runs through shared post-creation logic + the 2J preflight and returns per-row success/warnings/errors without failing the batch; can target a campaign (3O).
- **AI: Content compliance checker (3D)** — `POST /ai/compliance` checks content against platform ToS, brand safety, regulatory rules, and the org brand profile; returns structured `{ violations[], passed }`.
- **Social: Comments for 8 more providers (3E)** — `ISocialMediaComments` (`fetchComments`/`replyToComment`/`likeComment` + capability override) added to Discord, Telegram, Slack, WordPress, dev.to, Hashnode, Medium, and TikTok.
- **Social: Poll posts (3F)** — Poll creation wired through `post()` for X and LinkedIn (incl. LinkedIn page) when `settings.poll` is set; inline poll builder (2-4 options + duration). Poll validity is checked before publish (never publishes a plain post when a poll was requested) and gated on `providerCapabilities.poll`.
- **AI: Per-platform brand voice (3G)** — `AIBrandProfile.platformInstructions` JSON field (`{ "x": "...", "linkedin": "..." }`); nullable, falls back to the global `instructions` (backward compatible). Resolved per-platform in `AIModelProvider`.
- **AI: Brand memory / RAG from top posts (3M)** — "Write like our best posts" generation mode indexing high-performing posts and returning source snippets in the response metadata for transparency.
- **Analytics: Competitor/watchlist tracking (3N)** — New `WatchedAccount`/`WatchedAccountMetric` models, watchlist service/repo, and analytics tab. Lightweight public-metric probes ride the existing collection sweep (`RUN_CRON=true`), are capability-gated, and gracefully auto-disable (logging `lastError`) on probe failure rather than crashing the sweep.
- **Campaign folders (3O)** — New `Campaign` model + nullable `Post.campaignId` (existing rows stay `NULL`); campaigns service/repo/controller and page to group posts/assets/analytics/comments by campaign. Grouping for media/analytics/comments derives transitively through the post's campaign.
- **Admin provider capability matrix (3P)** — Central `provider-capabilities.ts` matrix (analytics, comments, first comment, polls, video, carousel, alt text, max media, link preview, refresh token) exposed via `provider-capabilities.controller.ts` and an admin matrix view; composer controls read it so unsupported options are hidden/disabled consistently. Built early as the foundation for 2F/2J/3E/3F.

### Changed

- **Temporal unbounded-history fixes (1A)** — `missingPostWorkflow`, `autoPostWorkflow`, and `refreshTokenWorkflow` now `continueAsNew()` (24-iteration counter; refresh-token sleep capped at 30 days) so event histories stay bounded, matching `analyticsCollectionWorkflow`.
- **Missing `@ActivityMethod()` (1B)** — Added to `integrations.activity.ts` `refreshToken()`, which is proxied from `refreshTokenWorkflow`.
- **`createPopularPosts` field mapping (1C)** — Writes `post.category`/`post.topic`/`post.content`/`post.hook` instead of literal strings.
- **`AnalyticsService` → repository layer (3A)** — Direct `this.prisma.*` calls moved into a new `AnalyticsRepository` (`getSnapshots`/`getPostSnapshots`/`checkCoverage`/…), restoring the Controller → Service → Repository layering.
- **`ioRedis` → injectable `RedisService` (3B)** — The module-level singleton is wrapped in an `@Injectable()`; the old export is kept as a deprecated alias.
- **Analytics Redis cache (3J)** — `getOverview()` results cached in Redis for 60s with key `analytics:overview:{orgId}:{sha256(params)}`, skipped when `endDate` is today (data may still arrive via the collection workflow).
- **Code deduplication (3C)** — Analytics live-fallback, unread-comments SQL, shared post-creation logic, and `AIModelProvider` brand-voice/guardrail/telemetry assembly each extracted to one shared path.
- **Dark-mode flash fix + calendar split (3H)** — Theme cookie read server-side in the root layout so the `dark` class applies before first render; the 1,472-line `calendar.tsx` split into ~9 subcomponents behind `CalendarContext`.
- **DTO validation (3I/3K/3L)** — `class-validator` DTOs replace `@Body() rawBody: any` on `PostsController`/`IntegrationsController` (3I) and across public-API, third-party, webhooks, AI-settings, and no-auth provider-connect bodies (3L); analytics-v2 query params are typed and bounded (capped `limit`, validated `dir`/`sort`/`metric`, `to >= from`) server-side (3K).
- **AI endpoint throttling (3Q)** — Explicit `@Throttle` on every new AI endpoint (hashtags, compliance, comment modes, brand-memory) — budget caps spend, not request rate.
- **Webhook events for new surfaces (3R)** — Comment-sync and analytics surfaces emit webhook events; all new emitters dispatch through `safeFetch` (no new SSRF surface).
- **A11y + i18n sweep (3S)** — Labels, keyboard nav, focus management, and repo-i18n strings (no hardcoded text) across all new frontend (heatmap, inbox, campaigns, watchlist, poll builder, preflight, capability matrix).
- **AI/workflow Sentry spans (3T)** — `Sentry.addBreadcrumb` around `AIModelProvider.generateText`/`generateObject` (tagged scope/providerId/modelId, no prompt PII) and on the v1.0.6 first-comment step.

### Security

- **SSRF: outbound dispatch hardening (1D)** — New `safeFetch()` (validate via `isSafePublicHttpsUrl` + `ssrfSafeDispatcher` + manual per-hop redirect re-validation, cap 5) replaces bare `fetch` in `sendWebhooks` (post activity), `POST /webhooks/send`, and the no-auth connect-callback POST; the inline `/stream` redirect loop is folded into the same helper. Closes DNS-rebinding and redirect-to-internal (incl. `169.254.169.254`) blind SSRF.
- **JWT hardening (1E)** — `verifyJWT` pins `algorithms: ['HS256']`; `signJWT` adds `expiresIn` with sliding cookie re-issue in `AuthMiddleware`. Legacy exp-less tokens still verify (no forced re-auth).
- **CSPRNG `makeId()` (1F)** — `makeId()` and all direct `Math.random()` call sites (local storage, tiktok OAuth state, media job ids, post random time) switched to `crypto.randomBytes`/`randomUUID`, closing predictable OAuth-secret/API-key/auth-code/PKCE generation.
- **Throttle guard fix (1G)** — `ThrottlerBehindProxyGuard` now applies the default throttle to all routes (inverted from the old bypass that returned `true` for ~99% of routes), so every `@Throttle` decorator (3Q/3AC) actually takes effect.
- **SSRF: provider fetch sites (1H)** — `safeFetch`/`ssrfSafeDispatcher` applied to Mastodon/Bluesky media downloads, Mastodon-custom/Lemmy/WordPress/Listmonk connect URLs, and `SocialAbstract.fetch()` (default dispatcher, opt-out preserved). Optional `SSRF_ALLOWED_PRIVATE_CIDRS` allowlist for self-hosted instances.
- **Integration token encryption (1I)** — `Integration.token`/`refreshToken` encrypted at rest (AES-GCM, `v2:` prefix) on create/update; legacy plaintext read transparently and upgraded on next refresh/reconnect.
- **AES-GCM authenticated-encryption migration (3U)** — At-rest secrets migrate from CBC to AES-GCM via a dedicated `EncryptionService` and optional `ENCRYPTION_KEY` (falls back to deriving from `JWT_SECRET`); expand-contract read-fallback keeps existing secrets working.
- **Helmet + Sentry scrubbing (3V)** — `helmet()` with HSTS/noSniff/referrerPolicy/frameguard/conservative CSP on all backend responses (skipped under `NOT_SECURED`); `beforeSend`/`beforeBreadcrumb` strips auth/cookie/impersonate headers, `apiKey`, `pos_`/`pca_`/`pcs_` tokens, passwords, and prompt/request bodies.
- **RAG SQL integer-assert (3W)** — DDL-interpolated RAG inputs are integer-asserted in `ai-rag.repository.ts`, with the parameterization invariant documented.
- **Global validation pipe (3Y)** — `whitelist` + `forbidNonWhitelisted` enabled globally; unknown fields are rejected (new optional fields must be declared on their DTO).
- **CSRF for cookie-auth routes (3Z)** — Cookie-authenticated mutating routes require a CSRF header; header/API-key clients remain supported.
- **OAuth 2.0 hardening (3AA)** — Redirect-URI matching, PKCE, scope checks, and token expiry/hashing with replay coverage; existing clients preserved via fallback paths.
- **Return-URL allowlisting (3AB)** — Integration/enterprise return URLs are validated against `INTEGRATION_RETURN_URL_ALLOWLIST` before being stored or returned, closing open-redirect paths.
- **Public/auth abuse throttles (3AC)** — `@Throttle` on login/forgot/activation/OAuth-token/public-tracking/enterprise routes (effective now that 1G is fixed).
- **Media upload isolation (3AD)** — Multipart/presigned operations are org-bound via an ownership ledger; presign bounds and pre-buffer/Multer size limits enforced (no signing/listing/completing by client-supplied `key`/`uploadId` alone).
- **XSS sanitization (3AE)** — All `dangerouslySetInnerHTML` render sites sanitized with DOMPurify.
- **Frontend CSP (3AF)** — Content-Security-Policy header added in `next.config.js`.
- **HttpOnly auth cookies (3AG)** — Frontend auth tokens migrated from JS-readable `document.cookie` to backend-issued HttpOnly cookies.
- **postMessage origin (3AH)** — Target origin restricted from `'*'` to specific origins in `standalone.modal.tsx` and `launches.component.tsx`.
- **Frontend `returnUrl` validation (3AI)** — Trivial `indexOf('http')` check replaced with origin validation.
- **Production source maps disabled (3AJ)** — `productionBrowserSourceMaps` disabled (maps upload to Sentry only, not served publicly).
- **Sentry PII capture off (3AK)** — OpenAI integration `recordInputs: false`/`recordOutputs: false`; `consoleLoggingIntegration` gated behind `allowLogs` (warn/error only); `console.log(err)` of raw API responses replaced with `Logger.warn` across X/Nostr providers, posts service, and autopost service.
- **Error storage redaction (3AL)** — `PostsRepository.changeState` strips `token`/`accessToken`/`refreshToken`/`apiKey`/`secret`/`password`/`Authorization` (and snake_case variants) from error and body payloads before persisting to the `errors` table.
- **CopilotKit /chat gating (3AM)** — `/copilot/chat` requires `@CheckPolicies([Create, AI])` and a per-request `BudgetService.checkBudget('agent', orgId)` (429 on exceeded); old behaviour behind `NOT_SECURED`.
- **Nostr private-key encryption (3AN)** — The Nostr private key is encrypted before JWT-encoding and storage in `Integration.token`.
- **bcrypt cost 12 (3AO)** — bcrypt cost factor raised from 10 to 12 (OWASP 2023 minimum).
- **Generic auth errors (3AP)** — Auth controller returns generic messages instead of raw `e.message` to clients.
- **CI vulnerability scanning (3AQ)** — `.github/workflows/security-audit.yml` runs `pnpm audit --audit-level=high` on PRs and weekly (fails on high/critical).
- **`NOT_SECURED` hardening (3AR)** — `NOT_SECURED` gated for dev use and never exposes JWTs in response headers; it remains the universal dev toggle for HSTS/helmet/CSRF/CopilotKit gating.
- **Farcaster generic error (3AS)** — Replaced the env-var-leaking `'Set NEYNAR_SECRET_KEY'` message with generic text.

### Docs

- **CHANGELOG.md** — This block (Added/Changed/Security/Docs) covering all v3.5.0 workstreams.
- **README.md** — `**[v3.5.0]**` fork-notice block covering the headline analytics/AI/social features plus the security hardening.
- **AGENTS.md / CLAUDE.md** — Added the "Feature surfaces & security (v3.5.0)" architecture note (capability matrix, comment inbox, campaigns, watchlist, polls, first comment, bulk import, best-time/recommendations) and expanded the key security-invariants list.
- **`.env.example`** — Documented `ENCRYPTION_KEY` (3U), `INTEGRATION_RETURN_URL_ALLOWLIST` (3AB), and `SSRF_ALLOWED_PRIVATE_CIDRS` (1H).
- **docs/ site** — Refreshed for v3.5.0 (separate workstream).

## [3.4.0] - 2026-06-05

### Added

- **AI provider adapter system** — 25 providers: 13 direct model providers (OpenAI, Anthropic, Google Gemini, xAI Grok, Meta Llama, Mistral, DeepSeek, Cohere, Perplexity, Groq, Qwen, MiniMax, Azure OpenAI) plus 12 multi-model hubs & gateways (Amazon Bedrock, Google Vertex AI, OpenRouter, Vercel AI Gateway, Together AI, Fireworks AI, DeepInfra, SiliconFlow, Lightning AI, GMI Cloud, Bitdeer, Vultr). Admin selects provider+model via `/admin/ai-settings`; keys encrypted in the database.
- **Admin AI Settings** (`/admin/ai-settings`) — Super-admin screen to pick provider/model, enter credentials, test connection, configure governance (guardrails, rate-limits, cost-controls), and view health badges. Includes dry-run preview for guardrail rules and a full AI-settings audit trail (`AISettingsAudit` model).
- **AIModelProvider facade** — Single injection point with `(scope, orgId?)` resolution. Precedence: per-org (stub) → per-scope → global active → provider default → env-OpenAI fallback. Wrappers: `generateText`, `generateObject`, `imageModel`.
- **Governance** — `GuardrailService` with input/output guard chains (prompt-injection, PII, brand safety, NSFW), configurable `block | redact | warn` actions. `BudgetService` with monthly/daily caps, per-org/per-scope budgets, budget-threshold alerts (80% warning), and spend tracking to `AISpendLog`. `TelemetryService` with OpenTelemetry GenAI spans (no-op when unconfigured). `ProviderHealthService` with success/error counters and provider failover readiness.
- **Rate limiting + idempotency** — `AiThrottlerGuard` reads limits from cached settings at runtime. Idempotency factory with Redis adapter for the agent and MCP routes.
- **RAG / brand memory foundation** — `RagService`, `HybridRag`, `ContextWindowPlanner`, and `AIBrandProfile`/`AIContentIndex` models for retrieval-augmented generation and brand-specific context injection (Phase 5 scaffold).
- **Media pipeline** — `AiMediaService` with working image generation via the facade, plus stubs for video generation (falls back to image), TTS, STT, upscale, bg-remove, and inpaint (Phase 5 scaffold).
- **End-user AI features** — Brand profile editor, prompt template builder, shared prompt library, usage dashboard, comment-reply generator, and semantic search over indexed content.
- **BYOK-ready facade** — Pluggable `(scope, orgId?)` signature supports per-org Bring-Your-Own-Key without redeploy.

### Changed

- All four AI surfaces (`OpenaiService`, `AgentGraphService` LangGraph generator, Mastra chat agent, CopilotKit composer) re-pointed to `AIModelProvider` facade.
- env-OpenAI backward compatibility preserved — no admin config = byte-for-byte `OPENAI_API_KEY` behaviour. `activeProvider = null` reverts to env fallback.
- Media cost reconciled with legacy credit meter — `checkMediaCredits()` enforces the stricter of AI budget vs legacy `ai_images`/`ai_videos` credit count.

### Security

- All 5 MCP entrypoints hardened with scope enforcement (`mcp:read`, `mcp:posts:write`, `mcp:admin`), idempotency, rate limiting, and budget controls via `@reaatech` auth packages.

## [3.3.0] - 2026-06-05

### Added

- **Calendar upgrade (Track A)** — Card body opens new Post Detail modal with KPI header and thread view; settings/edit icon added to card hover strip; scheduled/published state pill; card stats footer (views/likes/comments) sourced from `PostAnalyticsSnapshot`.
- **Post Detail modal** — New `PostDetailModal` with KPI strip from `/analytics/v2/post/:postId` (live-fallback added for un-snapshotted posts), full thread from `getPostsRecursively`, and capability-aware comments section.
- **Social comments foundation (Track B)** — `ISocialMediaComments` provider capability interface, `SocialComment` and `PostCommentRead` Prisma models, social comments Controller/Service/Repository, and Temporal `CommentsActivity` + `commentsCollectionWorkflow` (gated by `RUN_CRON=true`, 30-min sweep cadence, configurable retention).

### Docs

- **README.md** — Rewritten: HTML → markdown conversion, fork notice left-aligned, removed upstream promo and inaccurate compliance lines, added REAA logo and legacy-screenshots note.
- **CLAUDE.md** — Added "Calendar & Post Detail" architecture section.
- **`dev/CALENDAR_UPGRADE.md`** — Session handoff updated.

## [3.2.0] - 2026-06-05

### Added

- **Three new social providers** — channel count goes from 33 → 36:
  - **Tumblr** — global OAuth2 redirect (same pattern as Mastodon/X), NPF (Neue Post Format) posts with multipart image/video media. Token refresh supported. Credentials via admin `ProviderConfiguration` or `TUMBLR_CLIENT_ID`/`TUMBLR_CLIENT_SECRET`.
  - **Pixelfed** — `customFields` auth (instance URL + personal access token), Mastodon-compatible REST API, image-only posts (up to 10), with comments.
  - **PeerTube** — `customFields` auth (instance URL + username + password), password-grant token re-derived per operation (no stored-token reliance), single-`.mp4`-video posts, with comments.
- No DB migration required — `Integration.customInstanceDetails` and `ProviderConfiguration` already accept any identifier.
- 64-case provider test file (`providers.deep4.spec.ts`) plus per-provider mock fixtures; `IntegrationManager` provider-count assertions bumped 33 → 36.

### Audit Fixes (2026-06-05)

A code review of the new-provider implementation against the plan (`dev/NEW_PROVIDERS_01.md`) surfaced two Tumblr correctness bugs, now resolved:

- **Editor mismatch** — Tumblr's `editor` was `'html'`, but `post()` writes the message into an NPF `{type:'text'}` block, which renders **plain text only** (formatting is expressed via separate index ranges, never HTML). Any formatted post would have surfaced raw `<strong>`/`<p>`/`<a>` tags. Changed to `'normal'`, consistent with the other plain-text social providers (Mastodon/Bluesky/Threads).
- **Empty NPF text block** — media-only (no caption) posts emitted an empty text block, which Tumblr rejects. The text block is now only included when a message is present.

### Out of Scope (follow-ups)

- Analytics hooks (`analytics()`/`postAnalytics()`) for the three new providers.
- PeerTube resumable upload for videos beyond the 10-minute activity window.
- Tumblr comments / reblogs (the frontend composer sets `comments: false`).

## [3.1.0] - 2026-06-04

### Added
- Analytics refactor — persisted multi-channel dashboard
- New data models: AnalyticsSnapshot, PostAnalyticsSnapshot (Prisma)
- Daily collection via Temporal workflow (RUN_CRON-gated)
- Metric normalization map supporting 10 providers
- New /analytics/v2 API with real period-over-period comparisons
- Frontend analytics-v2 dashboard with drill-down navigation
- CSV/JSON export endpoint
- Snapshot retention & weekly rollup (env-configurable via `ANALYTICS_DAILY_RETENTION_DAYS` / `ANALYTICS_POST_RETENTION_DAYS`)

### Changed
- Hardcoded percentageChange values removed from providers (computed centrally)
- Platform-analytics UI replaced with analytics-v2 dashboard

### Deprecated
- Legacy /analytics/:integration and /analytics/post/:postId routes (will be removed)

### Code Review Fixes (2026-06-04)

A comprehensive code review and implementation audit was performed against the analytics refactor plan (`dev/analytics-refactor-plan.md`). All 4 phases were verified as substantially complete. The following gaps were found and resolved:

**Hardcoded provider values removed** — The `percentageChange` field in `AnalyticsData` (`social.integrations.interface.ts:56`) was made optional, and 37 hardcoded `percentageChange: 0` values were removed across 9 provider files (facebook, x, instagram, linkedin-page, tiktok, youtube, pinterest, gmb, threads). The CHANGELOG entry from the initial 3.1.0 release claimed this was done but the actual code changes were never applied. Analytics metrics are now correctly computed solely by `AnalyticsService.computePercentageChange()`.

**Orphaned files removed** — Four unused analytics component files were deleted (`analytics.component.tsx`, `stars.and.forks.tsx`, `stars.table.component.tsx`, `chart.tsx`). `chart-social.tsx` and `stars.and.forks.interface.ts` were retained as they are still imported by `launches/statistics.tsx`.

**Chart CSS variables globalized** — `--chart-1` through `--chart-8`, `--chart-muted`, `--positive`, and `--negative` CSS variables were moved from an inline `style` prop in `analytics.dashboard.tsx` to the global `:root` in `colors.scss`, making them accessible project-wide and properly themed.

### Code Review Fixes — Round 2 (2026-06-04)

A second audit focused on the data-collection layer surfaced silent data-loss issues in the metric normalization map (`analytics.metrics.ts`), now resolved:

**Channel metric collisions fixed** — Two distinct provider channel metrics were collapsing onto the same canonical key, so the daily collector's `upsert` on `(integrationId, metric, date)` overwrote one with the other:
- Facebook `Page Impressions` and `Posts Impressions` both mapped to `impressions`. `Posts Impressions` now maps to a new `post_impressions` canonical metric.
- TikTok lifetime `Total Likes` (a point-in-time/stock metric) and `Recent Likes` (recent-video flow) both mapped to `likes`. `Total Likes` now maps to a new `total_likes` (stock) metric.

**Post-analytics labels added to the map** — `PROVIDER_METRIC_MAP` only contained channel-level labels, so `collectPostSnapshots` silently dropped nearly all post metrics (`normalizeMetric` returned `undefined`). Added the post-level labels emitted by `postAnalytics()`: X (`Impressions`/`Likes`/`Retweets`/`Replies`/`Quotes`/`Bookmarks`), Facebook (`Impressions`/`Clicks`/`Reactions`), TikTok (`Likes`/`Comments`/`Shares`), YouTube (`Comments`/`Favorites`), Pinterest (`Outbound Clicks`), Instagram/Instagram-standalone (`Engagement`). New registry metrics: `post_impressions`, `total_likes`, `reactions`, `outbound_clicks`, `favorites`.

**Unbounded workflow history fixed** — `analyticsCollectionWorkflow` used an infinite `while (true)` loop that fanned out over every org × 2 activities each day within a single Temporal execution, which would accumulate history events without bound and eventually hit Temporal's ~50K-event limit and terminate. It now does one sweep per execution and calls `continueAsNew()` after the 24h sleep, matching the repo's `digestEmailWorkflow`/`sendEmailWorkflow` pattern.

**Snapshot retention & rollup implemented** — Added `AnalyticsActivity.pruneAndRollupSnapshots(orgId)`, run per-org each daily sweep. Raw daily `AnalyticsSnapshot` rows older than ~18 months (default `DEFAULT_DAILY_RETENTION_DAYS = 548`) are rolled up into a single weekly row per `(integration, metric, ISO week)` — flow metrics summed, stock metrics keeping the week's latest value — and the daily rows are replaced atomically in a `$transaction`. The rollup is idempotent and folds newly-aged days into the existing weekly aggregate as the cutoff advances. `PostAnalyticsSnapshot` rows are pruned beyond a 90-day window rather than archived. Both windows are env-configurable via `ANALYTICS_DAILY_RETENTION_DAYS` / `ANALYTICS_POST_RETENTION_DAYS` (read per-run, with fallback to the 548/90-day defaults on missing/invalid values). Weekly aggregates remain compatible with `AnalyticsService` range queries (range totals are preserved; stock carry-forward still works).

## 3.0.0 (2026-06-04)

### Major Features

- **Database-backed provider configuration** — Channel provider OAuth/API credentials are now managed through a `ProviderConfiguration` database model with an admin UI at `/admin/channels`. Server admins can enable/disable providers, set credentials, and provide setup instructions without editing environment variables. Credentials are encrypted at rest using `JWT_SECRET`.

- **Admin UI for channel configuration** — New `/admin/channels` page with toggle auto-save, credential editing, setup instructions display, and per-field status badges. Only super-admins can configure channels.

- **Backward-compatible credential fallback** — `getEnvOr()` checks the database cache first, then falls back to `process.env`. If no database configs exist, all providers are shown using environment variable credentials. If configs exist but are all disabled, zero providers are shown (respects admin intent).

### Provider Improvements

- **33 social provider files** — All `process.env` credential reads converted to `getEnvOr()` with proper provider identifiers.
- **Lazy initialization** — Telegram (`bot`), Farcaster social (`client`), Nostr (`pool`), InstagramStandalone (`instagramProvider`), and Farcaster auth (`client`) refactored from module-level to lazy getters, preventing import-time side effects (WebSocket connections, DB cache staleness).
- **Telegram fix** — Bot token credential key corrected from `'clientId'` to `'token'`.
- **MastodonCustom** — 7 non-null assertions (`!`) replaced with `|| ''` / `|| 'http://localhost:5000'` fallbacks.
- **Mastodon** — `process.env.FRONTEND_URL!` replaced with `|| 'http://localhost:5000'`.
- **Farcaster auth** — Module-level `new NeynarAPIClient()` moved inside lazy getter.
- **Dribbble** — `refreshToken()` Pinterest copy-paste fixed.
- **Auth providers** — GitHub, Google/YouTube, OAuth, Farcaster auth providers converted to use `getEnvOr` for credential reads, sharing DB config with social counterparts.

### Backend

- **ProviderConfigRepository** — CRUD layer for `ProviderConfiguration` model with mockable Prisma interface.
- **ProviderConfigService** — Encrypted credential storage with tri-state null/undefined/string handling. Empty strings (`''`) treated as null. `decryptConfig()` returns `undefined` for null/empty DB values.
- **ProviderConfigManager** — In-memory cache with 60s TTL, Promise-based mutex (`refreshPromise`), atomic cache swap (builds new collections in loop, swaps atomically at end via `replaceCredentialsMap()`). Per-entry try/catch in cache refresh so a corrupt row doesn't crash the endpoint. Gate condition checks `clientId || clientSecret || token` (Telegram passes through).
- **IntegrationManager** — Filters providers by DB-enabled list. Fallback to all providers when DB empty (`!hasAnyConfigs`). No bypass for non-OAuth/self-service/web3/Chrome extension providers — all respect the enabled flag. `getSocialIntegration()` throws `NotFoundException` for unknown providers.
- **ChannelConfigController** — All endpoints with per-item try/catch in `listConfigs`, runtime validation, `ForbiddenException` for unauthorized access. `saveConfig` returns all fields (redirectUri, scopes, additionalConfig, setupInstructions).

### Migration

- **`scripts/migrate-channel-config.ts`** — Idempotent one-time migration script mapping all 33 providers across 4 categories. Telegram token stored in `additionalConfig.botToken`. Discord bot token merged into single upsert. Per-provider try/catch with migrated/skipped counters.

### Frontend

- **Admin channels UI** — Toggle auto-save (immediate `PUT {enabled}`), credential editing fields, setup instructions display (`whitespace-pre-wrap`), per-field status badges, SWR sync via `useEffect` with full dependency array, global SWR mutate for cache invalidation.
- **Add Channel modal** — Only shows enabled providers. Info icon opens setup instructions. OAuth fetch wrapped in try/catch. `Buffer.from()` replaced with `btoa()`.
- **Hook dependency fixes** — `useAddProvider`, `getSocialLink`, `CustomVariables.submit` callback dependency arrays fixed for correctness.
- **Impersonate page** — "Channels" nav gated by `user?.isSuperAdmin`. Inline `useSWR` extracted into `useImpersonateSearch` hook. Spurious `.map()` second argument removed. Various fetch calls wrapped in try/catch with error toasts.
- **Web3 / Chrome extension** — Fetches wrapped in try/catch with error toast.

### Testing

- **13 test files, 626 tests, all passing** — Comprehensive test suite covering all core service files and all 33 providers.
- **Core service coverage** — 97-100% statements/branches/functions/lines across credentials, repository, service, manager, integration.manager, social.abstract, refresh.service, tool.decorator, missing-scopes filter.
- **Provider coverage** — ~78% overall (33% baseline). 3 deep provider test files with exact per-provider API call sequence mocking covering all 33 providers. Remaining coverage gap is exclusively error-handling branches (API 4xx/5xx/timeout responses).
- **Per-provider mock config** (`provider-mocks.ts`) — Platform-specific API response field maps for all 33 providers, built from source analysis of each provider's HTTP response destructuring.
- **Vitest** — `singleThread: true` in both vitest configs prevents fork bombs during parallel test execution with 33+ provider imports.

### Bug Fixes

- **Migration script** — Fixed provider names (`Listmonk`→`ListMonk`, `Mastodon Custom`→`M. Instance`). Redundant nullish checks removed. Discord duplicate upsert fixed. Per-provider try/catch added to all loops.
- **Frontend** — `classValidatorResolver`/`ApiKeyDto` unused imports removed. Malformed CSS class `relative]` fixed. `error` type fixed from `'error'` to `'warning'` for toaster. `redirectUri`/`scopes`/`setupInstructions` payload uses `null` (was `undefined`, preventing field clearing). Loading guard added before permission check in channel config component.
- **Env example** — Updated with new `TELEGRAM_TOKEN` and other provider env var entries.

### Chores

- `package.json` bumped to `3.0.0`.

### Code Review Fixes (Round 10 — 2026-06-04)

After a comprehensive 5-agent parallel code review across all changed files, 40+ issues were found and fixed:

**Security (Critical)**
- **IntegrationManager** — `getSocialIntegration()` now enforces DB enablement check via `isEnabled()` before returning any provider. Disabled providers are rejected with `NotFoundException`. This closes a gap where disabled providers remained fully operational for OAuth, posting, and analytics.
- **IntegrationManager** — `getInternalPlugs()` also enforces enablement check. `getAllConfigs()` (returned decrypted credentials) removed entirely.
- **Channel config controller** — DELETE endpoint `refreshCache()` wrapped in try/catch to prevent stale-cache crash.
- **Farcaster auth** — Dummy API key fallback `'00000000-000-...'` removed. Now throws a clear error if API key is not configured.
- **Migration script** — Re-running the script no longer overwrites `enabled: true` — `update` branches only touch non-enabled fields, preserving admin intent.

**Provider Bugs (Critical)**
- **Pinterest** — `refreshToken()` was sending `grant_type: 'authorization_code'` instead of `'refresh_token'` (copy-paste error), causing all token refreshes to fail.
- **Reddit & Nostr** — Module-level `global.WebSocket = WebSocket` wrapped in `if (!global.WebSocket)` guard to prevent side-effect on every import.
- **Bluesky** — `autoRepostPost()` and `autoPlugPost()` always returned `true` even when like thresholds weren't met. Now correctly returns `false`.

**Provider Null Safety (High)**
- **YouTube** — 4 non-null assertions (`expiry_date!`, `access_token!`, `id!`, `name!`) replaced with null checks.
- **GMB** — 5 non-null assertions replaced with null checks. `clientAndGmb()` refactored to lazy singleton getter.
- **Bluesky** — `displayName!` and `handle!` replaced with `|| ''` fallbacks.
- **TikTok** — `path!` and `thumbnailTimestamp!` non-null overrides removed.
- **Instagram** — `pageId!` null check added in `reConnect()`.
- **LinkedIn** — `x-restli-id!` header replaced with `|| ''` fallback.
- **Dribbble** — `path!` non-null override removed.
- **Reddit** — Unsafe `post.media[0]` changed to `post?.media?.[0]`.
- **Discord** — `application.bot.avatar` changed to `application?.bot?.avatar`.

**Provider Correctness (Medium)**
- **YouTube & GMB** — `clientAndYoutube()`/`clientAndGmb()` refactored to lazy singleton getters (were creating new OAuth2Client on every call).
- **Kick & Twitch** — Added missing `checkScopes()` calls in `authenticate()`.
- **Reddit** — Regex match result now has null guard before array access.
- **Listmonk** — Copy-paste comment fixed (Bluesky → ListMonk).
- **GMB** — Error message fixed (YouTube → Google My Business).

**Debug Cleanup**
- Removed `console.log` debug statements from Instagram (3x), TikTok (1x), and Threads (1x) providers.

**Frontend (Critical)**
- **Add provider modal** — `externalUrl=undefined` no longer sent as query param (only adds when truthy).
- **Add provider modal** — `extensionId` added to `getSocialLink` dependency array.
- **Custom provider hook** — Non-null `integration?.id!` assertion replaced with guard + throw.
- **Channel config** — Auth check reordered: `!user` and `!user.isSuperAdmin` checked before `isLoading` to prevent admin UI flash.

**Frontend (High)**
- **Channel config** — `||` changed to `??` for `clientId`/`clientSecret` fallbacks.
- **Channel config** — SWR fetchers now check `r.ok` for better error states.
- **Add provider modal** — `CustomVariables.submit`, `web3List.find`, `UrlModal.submit` all updated with proper error handling and dependency arrays.
- **Impersonate** — `stopImpersonating` stale `isSecured` closure fixed. 11 useCallback dependency arrays fixed.

**Backend (Medium)**
- **Controller** — `additionalConfig` field added to GET `/:identifier` and `listConfigs` responses.
- **Controller** — `HTTPException` replaced with `BadRequestException` for 400 errors.
- **Controller** — JSON validation added for `additionalConfig` in PUT.
- **Controller** — Decrypt failure warning now logs the actual error object.
- **Autopost service** — Silent catch blocks in `processCron()` and `loadXML()` now log errors.
- **Media repository** — Count and findMany `where` clauses made consistent.
- **Migration** — `oauth_custom` entry added to migration script.
- **Migration** — Enabled field removed from update branches across all provider types.

### Code Review Fixes (Round 11 — 2026-06-04)

A follow-up review found that the Round 10 enablement gate (`getSocialIntegration()` throwing `NotFoundException` for disabled providers) was correct for user-initiated connect/post/OAuth flows but was also hit by read/maintenance paths that operate on **already-connected** channels — turning a disabled-provider state into a hard failure for unrelated channels.

**Availability (Critical)**
- **IntegrationManager** — Added `getSocialIntegrationUnchecked()`, which returns the provider definition without the enablement gate (returns `undefined` for genuinely unknown identifiers). The security boundary is unchanged: all connect, OAuth, posting, and plug-execution paths still go through the gated `getSocialIntegration()`. The unchecked accessor exposes no credentials and initiates no new OAuth — it is used only to render/maintain channels a user has already connected.
- **`GET /integrations/list`** — Channel list now uses the unchecked lookup (and filters out unknown providers). Previously, disabling a single provider in the admin UI threw a `404` inside the list's `Promise.all`, wiping out the **entire** channel list for every affected org rather than just the disabled channel.
- **`refreshTokens()` cron** — Token refresh now uses the unchecked lookup and `continue`s past unknown providers. Previously a single disabled/unknown provider threw and aborted the whole refresh batch, leaving all remaining channels un-refreshed.
- **`getMissingContent()` / `checkPostAnalytics()`** — Analytics and missing-content lookups for already-connected channels now use the unchecked accessor (with optional-chaining guards), so they keep working if the provider was later disabled instead of throwing a `404`.

**Testing**
- Added 3 tests for `getSocialIntegrationUnchecked()` (known/disabled/unknown identifiers). Suite now at **630 tests**, coverage thresholds still passing.

### Chores (Round 11)

- **Vitest alignment** — `@vitest/coverage-v8` (`3.2.6` → `3.1.4`) and `@vitest/ui` (`1.6.0` → `3.1.4`) in root `package.json` aligned to the installed `vitest@3.1.4`. The previous 2-major `@vitest/ui` gap meant `vitest --ui` would not load, and the coverage-provider minor mismatch risked version warnings.

- **Dependency refresh (safe / same-major only)** — In-range (`pnpm update`, no `--latest`) bumps so no breaking majors were crossed; verified by backend + frontend + orchestrator production builds and the full test suite. Notable: React/React-DOM `19.2.4` → `19.2.7`, Next `16.2.6` → `16.2.7` (also updated in `pnpm.overrides`), NestJS `11.1.21` → `11.1.24`, Temporal SDK `1.15.0` → `1.17.2`, TipTap `3.20.1` → `3.25.0`, Sentry `10.45.0` → `10.56.0`, LangChain core/community/openai/langgraph, AWS SDK S3 `3.1003` → `3.1062`, axios `1.14` → `1.17`, openai `6.27` → `6.42`, plus dayjs, zustand, ioredis, ws, sass, react-hook-form, react-hotkeys-hook, viem, posthog-js, and others.
- **Intentionally deferred** — Breaking/large-jump upgrades left for post-release, individually: CopilotKit (`1.10` → `1.59`), Mastra, Neynar SDK, Prisma 7, Mantine 9, Tailwind 4 (project is pinned to v3), Stripe, Uppy 5, and dev-tooling majors (ESLint 10, Vitest 4, TypeScript 6, Jest 30).

- **pnpm settings migration** — Moved `overrides` and `onlyBuiltDependencies` out of the `package.json` `pnpm` field and into `pnpm-workspace.yaml`, where pnpm 10 now reads them. Previously pnpm 10.6.1 silently **ignored** the entire `pnpm` field (`The "pnpm" field in package.json is no longer read by pnpm`), so the React/Next version overrides and the `bcrypt`-only build-script allowlist were not actually being enforced. They now are. `@sentry-internal/node-cpu-profiler` was added to the build-script allowlist so Sentry CPU profiling's native binary loads.

- **CI test gate** — Tests previously ran in **no** CI workflow, and the root `test` script still invoked `jest` (which no longer matches any spec — all 14 suites are Vitest). Replaced the root `test` script with `vitest run` across both packages, added a `test` script to `apps/backend`, and added a **blocking** `.github/workflows/test.yml` (Node 22.12.0 / pnpm 10) that runs the full suite on push / pull_request / merge_group. Note: the workflow makes the check fail on a red suite — enabling it as a *required* status check still requires a branch-protection rule on `main`.



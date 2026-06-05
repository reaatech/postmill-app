# Changelog

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



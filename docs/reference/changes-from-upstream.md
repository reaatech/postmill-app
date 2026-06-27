# Changes From Upstream

Postmill is a fork of [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) that has
diverged substantially across nine major releases. The upstream documentation at `docs.postiz.com`
no longer describes this fork's behavior. This page is the canonical summary of every change,
organized by release. The [CHANGELOG](https://github.com/reaatech/postmill-app/blob/main/CHANGELOG.md)
has the full per-commit detail.

---

### v3.9.0 (June 2026)

Temporal → Inngest migration — background jobs now run through Inngest Cloud (or the local dev
server) instead of a separate Temporal orchestrator:

- **Removed** `apps/orchestrator`, `libraries/nestjs-libraries/src/temporal/`, `dynamicconfig/`,
  and all `@temporalio/*` / `nestjs-temporal-core` dependencies
- **Inngest handler** served by the backend at `/api/inngest`
- **Activities** moved to `libraries/nestjs-libraries/src/inngest/activities/` and de-Temporalized
- **Functions** in `apps/backend/src/inngest/functions/` covering post publishing, analytics
  collection, comment sync, missing-post scan, media-job polling, email delivery, autopost
  processing, token refresh, streak tracking, and analytics backfill
- **Environment variables** changed: `USE_INNGEST`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`,
  `INNGEST_SIGNING_KEY_FALLBACK`, `INNGEST_ENV`, `INNGEST_SERVE_ORIGIN`, `INNGEST_SERVE_PATH`,
  `INNGEST_DEV`, `INNGEST_BASE_URL`; `RUN_CRON` is no longer used
- **Build/test scripts** no longer reference `apps/orchestrator`

See [Inngest & Cron](../operations-guide/inngest-and-cron.md) for operation details.

The v3.9.0 release also adds the **Replicate Studio** (`/media/replicate`), a native generative media
workspace backed by [Replicate](https://replicate.com). It supports 18 categories covering image
generation/editing (text-to-image, image-to-image, inpaint, upscale, background removal), video
(text-to-video, image-to-video, video-to-video, caption, merge), audio (text-to-speech, voice clone,
music generation, music-to-music), speech-to-text transcription, and utility surfaces (meme
generator). Warm official models are shown by default with fixed-cost badges; community models are
available via a per-category toggle with usage-based pricing. Async video/audio jobs require a target
Files folder and complete through the Inngest poll sweep. The studio is intentionally a standalone
surface in v1: it does **not** participate in C2PA provenance signing or the shared media-pipeline
cost ledger; accounting is tracked per job through `AIMediaJob.costUsd`/`creditType`.

v3.9.0 also reworks **Settings → Channels** into *named credential sets*: an org can configure
**multiple OAuth-app credential sets for the same provider**, each with a required name and its own
auth. Configuration moved into a modal, the capability filter buttons were collapsed into a single
checkbox dropdown, and the page heading was dropped. Schema-wise, `OrgProviderConfiguration` is now
unique on `(organizationId, identifier, name)` (resolved by row `id`) and `Integration` gained a
nullable `providerConfigId` FK binding each connected account to the set it used (fallback to the
org's primary set when unbound). Additive and db-push-safe.

Stock browsing was expanded with free vectors (Pixabay), stickers (GIPHY), and icons (Iconify),
joining existing photos (Unsplash) and videos (Pexels). Results carry `source`, `license`, and
`attribution` metadata through preview, Designer open, and `/files/import`. Premium Content Packs
(BYOK) were added under **Settings → Content Packs**, with Magnific as the first supported pack
(photos, vectors, icons, videos). An active pack takes precedence over the matching free catalog;
credentials are encrypted at rest and never returned to the client.

v3.9.0 introduces the **Campaign Hub** (`/campaigns/:id`). Campaigns now expose a dashboard with
KPIs, recent changelog, a planning workspace, tagged items (tags, media, notes, tasks, personas,
tone, messages, goals, KPIs), and a dedicated posts section. Draft approval gates promotion to
scheduled posts; campaign-level UTM tagging appends `utm_campaign`, `utm_source`, and `utm_medium` to
outbound links. Campaign copy clones draft posts with optional date shifting and re-tags all
campaign items. Org members can export CSV/PDF reports, and a shareable public report
(`/public/campaign-report/:token`) returns read-only JSON when enabled. A daily Inngest cron
`campaign-tag-purge` removes stale campaign items after `CAMPAIGN_PURGE_DAYS` (default 30). The
dashboard also embeds a **campaign-scoped comments view** (filter by status/channel/assignee/unread,
reply, like, status, assign, bulk mark-handled) reusing the cross-channel inbox endpoint with new
`campaignId`/`integrationId` filters; the **Comments KPI/goal count synced, replyable comments**
rather than the platform-reported engagement total.

### v3.8.10 (June 2026)

Identity, tenancy, RBAC & provider-surface redesign:

- **Identity/profile split** — `User` keeps auth columns; profile fields (name, bio, avatar, IANA
  timezone, notification prefs) moved to a 1:1 `UserProfile`
- **Full RBAC** — `AppRole`/`Permission`/`AppRolePermission` with seeded system roles
  (owner/admin/editor/member/viewer), per-org custom roles, and `@RequirePermission` (HTTP 403)
  orthogonal to the billing gate (HTTP 402); replaces the flat `Role` enum
- **Sessions** — refresh-token rotation backed by a `Session` model (hashed tokens,
  reuse-revokes), device list with per-session revoke
- **Platform `/admin`** — super-admin-managed login providers (`AuthProviderConfig`, encrypted),
  incl. OIDC SSO via the generic provider; env vars remain the bootstrap fallback
- **Multi-brand** — many `AIBrandProfile`s per org with a default and per-post selection
  (`Post.brandId`)
- **AI provider config** — two-step (auth → model defaults) with a standard/reasoning model split;
  `imageModel` removed from AI config
- **Media providers** — per-org `MediaProviderConfig` + adapter layer (fal.ai, OpenAI, ElevenLabs,
  HeyGen, Runway, Black Forest Labs, Vertex AI, Replicate, Stability, Tavus, D-ID, Hedra, MiniMax,
  Deepgram, Luma) with tenant-storage binding and typed output folders
- **Storage** — per-tenant local partition, `LOCAL_STORAGE_QUOTA_GB` env default, unique-account
  fingerprints, AI-style settings UI
- **Shortlinks** — multiple named accounts per provider, real brand icons, preference card removed
  from Settings
- **Schedule pages** — composer moved from a modal to `/schedule/post` and `/schedule/post/:id`,
  timezone-aware time picker

**Breaking changes:**
- Single destructive schema push (snapshot first): dead Gitroom marketplace/GitHub-stars tables
  dropped (`SocialMediaAgency`, `Orders`, `Messages`, `GitHub`, `Star`, `Trending`, …), legacy
  `UserOrganization.role` enum column dropped, `imageModel` columns dropped, migrated `User`
  profile columns dropped. See [Upgrading](../operations-guide/upgrading.md#v3-8-9-v3-8-10).

### v3.8.8 (June 2026)
- Per-user API keys with hashed storage, role inheritance, and show-once plaintext
- New dashboard landing page replacing the old calendar-first flow
- Complete theme de-purpling (purple/magenta → blue)
- Major UI consistency pass: DataTable, EmptyState, form primitives polish, settings IA
- Comment inbox on-demand sync

**Breaking changes:**
- `Organization.apiKey` retired — old org-level API keys no longer authenticate. Regenerate keys from the per-user API Keys UI (Settings → Developers).
- `publicApi` field removed from `GET /user/self` response — the old org key is no longer returned to the browser.
- MCP credentials must use new `pm_live_*` per-user keys — old org keys will not work with MCP entrypoints.

---

## At a glance

| Area | Upstream | This fork |
|------|----------|-----------|
| AI | Single hardcoded OpenAI integration | Governed multi-provider system (**25 providers** — 13 direct + 12 multi-model hubs/gateways, BYO keys) with admin config, guardrails, RAG, and per-org spend caps |
| Channel credentials | Environment variables only | Per-tenant OAuth credentials in **Settings → Channels** (no env fallback) |
| Storage | Single cloud storage via env vars | Per-tenant storage adapters (S3/R2/B2/IDrive/local) in **Settings → Storage** |
| AI provider config | Single `OPENAI_API_KEY` | Per-tenant providers in **Settings → AI** (no env fallback) |
| Admin UI | Separate `/admin/*` routes | Per-tenant settings tabs for org config; a platform `/admin` (super-admin only) manages login providers (v3.8.10) |
| Roles | Flat 3-value enum | Full RBAC — seeded system roles + per-org custom roles, fine-grained permissions (v3.8.10) |
| Marketplace / GitHub-stars | Creator marketplace, trending feed | Removed (dead code + tables dropped in v3.8.10) |
| Media library | Basic upload/list | Media manager with folders, tags, bulk actions, search |
| Channel count | Upstream set | **36** providers (adds Tumblr, Pixelfed, PeerTube) |
| Analytics | Single-channel, live fetch on demand | Persisted multi-channel dashboard from daily snapshots (`/analytics/v2`) |
| Calendar | Card click opens edit modal | Card body opens a **Post Detail** modal; a settings icon opens edit |
| Comments | — | Synced social comments foundation with per-user read state |
| MCP | — | 5 entrypoints hardened with scope enforcement, rate limiting, idempotency |
| Container image | `ghcr.io/gitroomhq/postiz-app` | `ghcr.io/reaatech/postmill-app` |
| Product name | Postiz | **Postmill** (rebranded in v3.7.0; env vars `POSTMILL_*`, SDK `@reaatech/postmill-sdk`) |

---

## v3.8.4 — SES webhook remediation release

v3.8.4 is a remediation release addressing bugs introduced in v3.8.3. No schema changes.

- **Amazon SES webhook handling fixed** — SNS subscription confirmation, bounce, complaint, and
  delivery event processing corrected. SES users should re-test webhook delivery after upgrading.
- **Email webhook signature verification** for SendGrid, Mailgun, Postmark, and Resend aligned with
  provider specifications.
- Documentation backfilled with v3.8.0→v3.8.1 upgrade notes, per-provider short-link credential
  reference, and per-provider email setup guides.

---

## v3.8.2 — Local-first avatar & media storage; remove the global-env Cloudflare path

Removes the deprecated global-env `STORAGE_PROVIDER`/`CLOUDFLARE_*` path and routes all app-internal
writes through the per-org LOCAL storage adapter.

- **All avatars and app-internal writes now use LOCAL storage** — `IntegrationRepository`,
  `IntegrationService`, `MediaService`, `PostsService`, `AgentGraphService`, `ImagesSlides`,
  `UploadFromUrlTool`, `GenerateImageTool`, `PublicIntegrationsController`, `MediaController`,
  and `ThirdPartyController` all call `StorageService.getLocalAdapterForOrg(orgId)` instead of
  `UploadFactory.createStorage()`.
- **`UploadFactory`, `cloudflare.storage.ts`, and `r2.uploader.ts` deleted** — these files read
  `STORAGE_PROVIDER`/`CLOUDFLARE_*` env vars at module-load time and are no longer used.
- **Multipart catch-all removed** — `POST /media/:endpoint` (presigned multipart for Cloudflare R2)
  is gone. Large files upload through `/files/upload-server` (v3.8+: `/media/upload-server` was renamed)
  (`MEDIA_UPLOAD_MAX_BYTES`, default 1 GB).
- **Frontend de-cloudflared** — `uppy.upload.ts` has no `cloudflare` case; layouts hard-pin
  `storageProvider` to `'local'`; `cloudflareUrl` removed from context; `/uploads` rewrites in
  `next.config.js` are unconditional.
- **Env vars removed** — `STORAGE_PROVIDER`, all 6 `CLOUDFLARE_*` vars deleted from `.env.example`,
  `.env.coolify`, and `docker-compose.yaml`.
- **CI guard added** — grep for `process.env.CLOUDFLARE_*`, `process.env.STORAGE_PROVIDER`, and
  imports of deleted modules; fails if any are reintroduced.
- **Per-tenant cloud providers preserved** — `CLOUDFLARE_R2` remains a valid `StorageProviderType`
  selectable per-org in Settings → Storage, alongside S3/B2/IDriveE2. The operator-level env path
  is gone; the per-tenant DB-encrypted provider path stays.

## v3.8.3 — Schedule rename, calendar stats, sorted settings, streamlined nav, storage refactor

Renames Calendar → Schedule, adds live-fallback enrich to post card stats, alphabetises settings
tabs, moves Profile and Settings into the avatar menu, and refactors storage to a
base-plus-mounted model with no default provider.

- **Calendar renamed to Schedule** — the route changes from `/launches` to `/schedule` (with a
  permanent redirect). All user-facing copy updated: the sidebar, page titles, and documentation
  now use "Schedule."
- **Calendar stats live-fallback** — post cards now show views/likes/comments even when no
  `PostAnalyticsSnapshot` exists yet (fallback to live platform data). Previously the stats footer
  was hidden until the next cron sweep.
- **Settings tabs sorted alphabetically** — the General/Settings tab is pinned first, followed by
  the remaining tabs in alphabetical order.
- **Profile moved to avatar menu** — the Profile tab has been removed from Settings. Profile,
  Settings, and Logout are now accessed from the user avatar menu in the top navigation bar. The
  settings gear icon was removed from the header.
- **Storage: LOCAL as always-on base** — `StorageProviderConfig.isDefault` column removed. LOCAL
  is the implicit base storage every org has; other providers (S3/R2/B2/IDriveE2) mount onto it
  for media-library use. The `POST /settings/storage/:id/set-default` API route was deleted.
- **Storage UI fixes** — bugs in `provider-form.modal`, `provider-card`, and `storage.tab` resolved.

---

## v3.8.1 — Pluggable email provider system

Replaces the hardcoded 2-provider email path (Resend / nodemailer) with a 6-provider adapter
system selected globally by one env var, with a standardized env scheme, a delivery-lifecycle
email log (metadata only, 90-day retention), and inbound webhook ingestion.

- **6 provider adapters** — Resend, SendGrid, Mailgun, Postmark, Amazon SES, SMTP (nodemailer).
  Each implements `EmailAdapter` with `send()`, `isConfigured()`, and optional `verifyWebhook()` /
  `parseWebhook()`.
- **Standardized env scheme** — one shared `EMAIL_API_KEY` + provider-specific vars (`EMAIL_SMTP_*`,
  `EMAIL_MAILGUN_DOMAIN`, `EMAIL_SES_*`). `EMAIL_WEBHOOK_SECRET` for all webhook-capable providers.
- **`EmailLog` Prisma model** — delivery-lifecycle metadata row per send. Webhook events advance
  status through `delivered`/`bounced`/`complained`/`opened`/`clicked` (never downgrade; terminal
  negatives win).
- **Webhook ingestion** — `POST /webhooks/email`, signature-verified, CSRF-exempt. SES handles SNS
  `SubscriptionConfirmation` via `safeFetch`.
- **Retention** — `pruneEmailLogs()` in the daily analytics sweep (best-effort, configured via
  `EMAIL_LOG_RETENTION_DAYS`, default 90).
- **Lazy adapter construction** — SDK clients built inside methods, not at module load (testable,
  no boot crashes).
- **Old env vars removed** — `RESEND_API_KEY`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`,
  `EMAIL_USER`, `EMAIL_PASS`.
- **Old provider classes deleted** — `email.interface.ts`, `resend.provider.ts`,
  `node.mailer.provider.ts`, `empty.provider.ts`.

---

## v3.8.0 — Short-link provider system

Replaces the old env-based short-link providers (Dub, Short.io, Kutt, LinkDrip) with a 19-provider
adapter system configured per-org in-app.

- **19 provider adapters** — Bitly, TinyURL, T.LY, Short.io, Rebrandly, Dub.co, Cutt.ly, Tiny.cc,
  is.gd, v.gd, BL.INK, T2M, Linkly, Replug, Switchy, PixelMe, Sniply, Ow.ly, CleanURI. Each adapter
  implements a consistent `ShortLinkAdapter` interface with `createShortLink`, `getClickCount`, and
  `healthCheck`.
- **Per-org configuration** — provider choice, credentials, and custom domain stored in
  `OrgShortLinkConfig` (encrypted at rest), managed in Settings → Shortlinks. No env var fallback.
- **Ledger & analytics** — every shortened link recorded in `ShortLink`; daily click snapshots in
  `ShortLinkSnapshot` collected by a Temporal sweep (best-effort, non-fatal).
- **SSRF-safe** — all adapter HTTP calls go through `safeFetch`.
- **Kutt and LinkDrip removed** — these two providers are no longer available in the 19-provider set.
- **Old env vars removed** — `DUB_TOKEN`, `DUB_API_ENDPOINT`, `DUB_SHORT_LINK_DOMAIN`,
  `SHORT_IO_SECRET_KEY`, `KUTT_API_KEY`, `KUTT_API_ENDPOINT`, `KUTT_SHORT_LINK_DOMAIN`,
  `LINK_DRIP_API_KEY`, `LINK_DRIP_API_ENDPOINT`, `LINK_DRIP_SHORT_LINK_DOMAIN`.

---

## v3.7.1 — Env var removal for channel & AI credentials

Removes the last `process.env` credential reads from social providers, deletes the env-migration
helpers, and prunes the configuration surface. The env var fallback for channel and AI credentials
is now **gone** — every provider reads from the database, encrypted at rest.

- **YouTube, GMB, Telegram providers** — removed remaining `process.env` fallbacks for
  `YOUTUBE_CLIENT_ID/SECRET`, `GOOGLE_GMB_CLIENT_ID/SECRET`, and `TELEGRAM_TOKEN`.
- **`ChannelEnvMigrationService`** and **`AiEnvMigrationService`** deleted — these `OnModuleInit`
  services that seeded DB configs from env vars are no longer needed.
- **`getEnvOr()` function** deleted from `credentials.ts` — all credential reads must use
  `getOrgCredential(orgId, identifier, key)` or `clientInformation`.
- **`.env.example`** and **`docker-compose.yaml`** pruned of all per-tenant channel/AI env vars
  (~30+ vars removed from each). Channel/AI config is now exclusively in-app.
- **Docs** updated across all relevant pages (configuration, env-vars, channels, AGENTS.md).
- **CI guard** added to `security-audit.yml` — greps for `getEnvOr(` and `process.env.<VAR>` in
  social provider files, failing the workflow if any are found.

---

## v3.7.0 — Brand cutover (Postiz → Postmill)

The fork is renamed **Postiz → Postmill**. No application schema changes. The rename rebrands every
user-facing surface and most internal identifiers, and carries several **breaking** infrastructure
renames for self-hosters.

- **Branding** — product name `Postiz` → `Postmill` across UI copy, page titles, emails, OpenAPI,
  and all translation locales; primary brand color `#612bd3` → `#2b5cd3`; logos and the browser
  extension rebranded. The `isGeneralServerSide()`/`isGeneral` "Postiz vs Gitroom" display toggles
  collapse to always render Postmill.
- **Packages & SDK** — workspace names `postiz-*` → `postmill-*` (internal; scripts target by path).
  The Node SDK is republished as **`@reaatech/postmill-sdk`** (was `@postiz/node`).
- **Env vars (BREAKING)** — all `POSTIZ_*` variables hard-renamed to `POSTMILL_*`
  (`POSTMILL_GENERIC_OAUTH`, `POSTMILL_OAUTH_*`, `POSTMILL_API_KEY`, `POSTMILL_CONTAINER`,
  `NEXT_PUBLIC_POSTMILL_OAUTH_*`). The old names are no longer read.
- **Docker / self-hosting (BREAKING)** — image is now `ghcr.io/reaatech/postmill-app`; compose
  services/network/volumes and the Postgres role/db renamed `postiz-*` → `postmill-*`. The Postgres
  **data** volume (`postgres-volume`) is unchanged, so data persists. See the upgrading guide in the
  self-hosting documentation.
- **Internal identifiers** — the Mastra chat agent id (`postiz` → `postmill`) and memory store
  (`postiz-store` → `postmill-store`) were renamed, which **orphans persisted chat memory** (one-time
  reset). MCP server name + setup snippets, OpenTelemetry tracer (`postmill-ai`), and the C2PA media
  claim generator were rebranded too.
- **Legal/governance** — product name rebranded in LICENSE/CONTRIBUTING/CCLA/ICLA/SECURITY (original
  copyright + AGPL preserved); `SECURITY.md` scope/reporting retargeted to `reaatech/postmill-app`.

**Intentionally not changed:** website/domain URLs (`*.postiz.com`, pending the new site), the
`npm install -g postiz` CLI snippets (pending CLI publish under the new name), internal translation
keys, and the `@gitroom/*` TypeScript path aliases.

---

## v3.6.0 — User profile, per-tenant storage/OAuth/AI, media manager, datatable rebuilds

The settings surface is fundamentally reorganized: admin-only pages are gone, and every org manages
its own storage, channel OAuth credentials, and AI provider configuration from the settings sidebar.

### User-facing features
- **User profile page** (`/settings/profile`) with Profile (avatar/name/bio), Security (password change),
  and Notifications (email prefs) tabs.
- **Settings re-tabbed** — Settings, Profile, Teams, Channels, AI, Brand, Media, Storage, Webhooks,
  Auto Post, Sets, Signatures, Developers, Approved Apps. Admin routes are removed.
- **Teams datatable** — search, sort, paginate, invite, and create users inline.
- **Webhooks datatable** — educational header, test ping, event selection, HMAC signing.
- **Auto Post / Sets / Signatures datatables** — educational empty states and proper CRUD.
- **Media manager** — folder tree, file details panel, bulk actions, search/sort/pagination, tags,
  descriptions, **trash & restore** (soft-delete + recovery).
- **Campaigns page** — educational header + aggregate stats row.

### Per-tenant infrastructure
- **Storage adapter system** — each org mounts S3/R2/B2/IDrive e2/local disk via `StorageProviderConfig`.
  5 GB default quota per org (`localStorageQuotaBytes`). Four-panel Storage settings tab:
  - **Providers** — cards showing type, mount status, usage
  - **Quota Status** — usage meter with 80%+ warning banner
  - **Usage Breakdown** — pie charts / tables by folder and provider
  - **Audit Log** — all storage operations (mount, unmount, test, migrate, set-default-folder) with pagination
- **Storage health tracking** — last-checked timestamp and error messages on each provider card
  (`lastHealthCheck`, `lastHealthError` columns in `StorageProviderConfig`).
- **Folder-level provider routing** — assign a storage provider to a folder; uploads to that folder
  automatically use the assigned provider. Configured via `POST /settings/storage/:id/set-default-folder`,
  stored in `StorageProviderConfig.defaultFolderId`.
- **Per-tenant channel OAuth** — orgs provide their own OAuth app credentials in the Channels tab.
  All per-provider env vars (`LINKEDIN_CLIENT_ID`, `FACEBOOK_APP_ID`, etc.) deprecated (kept as
  fallback at the time; fully removed in v3.7.1).
- **Per-tenant AI provider config** — orgs configure providers/models/keys in the AI tab.
  `OPENAI_API_KEY` deprecated for model resolution (no longer read by `AIModelProvider`; removed
  in v3.6.3).
- **Brand voice + RAG knowledge base** (Brand tab) — brand voice profiles and content-index UI.
- **Media provider settings** (Media tab) — per-tenant media pipeline config.

> **Note:** In v3.6.0, `getEnvOr()`, `ChannelEnvMigrationService`, and `AiEnvMigrationService`
> still existed but were deprecated — they were fully deleted in v3.7.1. This provided a migration
> path for deployments that had not yet moved credentials into the database.

### Bugfixes
- Comments inbox: proper error/permission states + `RUN_CRON` banner.
- Analytics v2: dark mode charts (CSS vars) + skeleton loader performance.
- Calendar: card stats and comment badge fixes.

### Schema (additive)
- **New:** `MediaFolder`, `StorageProviderConfig`, `OrgProviderConfiguration`, `AuditLog`.
- **Added columns:** `Media.folderId` (nullable), `Media.tags` (JSON), `Media.description` (text),
  `Media.deletedAt` (soft-delete for trash); `Organization.localStorageQuotaBytes` (default 5 GB);
  `StorageProviderConfig.lastHealthCheck`, `lastHealthError`, `defaultFolderId`;
  `AIOrgProviderConfig.isActive`.
- **Deprecated** but kept: `ProviderConfiguration`, `AIProviderConfig`, `AISystemSettings`.

### Deprecated env vars (kept as fallback; deprecation warning on boot — removed in v3.7.1)
`STORAGE_PROVIDER`, all `CLOUDFLARE_*` vars, all per-provider OAuth env vars, `OPENAI_API_KEY`.

---

## v3.5.10 — Stabilization release

Gets v3.5.9 **actually booting** (it shipped with six chained boot blockers that returned 502 on
every `/api/*`) and closes a batch of UI/API bugs found by a comprehensive end-to-end Playwright
audit of the real interface. No schema changes.

### Boot & deploy reliability
- Lockfile regenerated so `node-telegram-bot-api` resolves to the CommonJS `0.66.x` the code targets
  (the drifted lockfile had pinned an ESM-only `1.0.0-rc.0` that crash-looped the backend).
- Five further runtime boot crashes fixed (DI on `ProviderHealthService` / `IdempotencyFactory`,
  path-to-regexp v8 wildcard routes, the orchestrator's `AiModule`/`RagService` wiring, and a
  `crypto` import banned in the Temporal workflow sandbox).
- New CI **boot guard** rejects lockfile drift and boots the backend against ephemeral Postgres+Redis
  — the check that would have stopped v3.5.9 from shipping un-booted.

### UI/API fixes
- Composer can save/schedule/publish again (lenient validate DTO on `/posts/valid` + `/preflight`).
- CopilotKit stops 403-ing on every page (forwards the CSRF token to its runtime).
- `/analytics/v2` no longer crashes — the line chart was missing its Chart.js `type`, so it threw and
  tripped the page's error boundary ("Something went wrong").
- Billing no longer **logs you out of the whole app**: on instances without Stripe, the pricing-tiers
  call hit Stripe with a placeholder key and got `401 "Invalid API Key"`; the frontend force-logs-out
  on any `401`, so opening Billing silently logged you out — making every admin page and Settings
  render as login. `getPackages()` now returns empty tiers (never a 401) when Stripe is unconfigured.
- `agent-media-sso` degrades gracefully when unconfigured.

### Completeness & accessibility
- **Team management**: change a member's role and view a member's profile (was list + remove only).
- **Admin errors**: Retry a failed post (re-queues it) and Resolve/dismiss an error from `/admin/errors`.
- Settings tabs and the admin channel-config row are now keyboard-focusable semantic buttons.
- Global API throttle default raised `90 → 600`/hour (`API_LIMIT`) so normal interactive use no longer
  trips it and renders pages blank on 429.

---

## v3.5.9 — Bugfix & UI-completeness release

A comprehensive bugfix and UI-wiring release following a 56-item codebase audit. Focuses on closing
cross-org security gaps, fixing runtime bugs, re-wiring disconnected UI surfaces, and hardening
validation and type safety.

### Security & org isolation
- All campaign update/delete operations now require `organizationId` in the WHERE clause.
- Watchlist account mutations (update, soft-delete, error management) now scoped to org.
- Bulk comment mark-read (`POST /posts/inbox/bulk-read`) requires org ownership.
- Comment assignment verifies post belongs to requesting user's org before reassigning.
- All five campaign endpoints (`GET/POST/PUT/DELETE`) now carry `@CheckPolicies` and org scoping.
- Sensitive post reads (`getPost`, `getPostById`, `getPostsByGroup`) now require mandatory `orgId`.
- `POST /posts/bulk` now gated by `@CheckPolicies([..., Sections.POSTS_PER_MONTH])`.

### Runtime fixes
- `GET /posts/inbox` now resolves correctly (controller registration order fixed).
- Calendar stats footer renders for all published posts.
- `metric.component.tsx` no longer crashes on missing `timezones-list` package.
- Calendar grid uses timezone-aware `newDayjs` for correct date display.
- 4 event listener memory leaks fixed (icons, html, support, new-modal components).
- Helmet middleware condition corrected (`||` → `&&`).
- CopilotKit budget check logic clarified.

### Data & performance
- `disableIntegrations()` replaced per-row `update()` loop with single `updateMany()`.
- `getComments()` now filters soft-deleted rows (`deletedAt: null`).
- `getBestTimePosts()` pagination now has deterministic id tiebreaker.
- `useCredit()` wrapped in `$transaction()` to prevent race conditions.
- Comment sync loop guarded against null `result.comments`.

### Validation hardening
- 10 new validations: cursor date parsing, array size limits, enum status values,
  campaign date ordering, watchlist handle format, query parameter whitelists,
  and null guards on comment status.
- 11 AI user endpoints now throttled at 30 req/min.

### Feature / contract fixes
- `campaignId` added to `CreatePostDto` and threaded through `createPost`/`bulkCreate`.
- Image moderation de-scoped to text-only (image params removed from endpoint).
- `CommentStatus` const enum introduced; hardcoded string arrays replaced.
- `any` types in social comments service replaced with proper `Integration` type.
- TTS generation error handling added (BudgetExceeded/GuardrailViolation patterns).

### UI wiring
- Sidebar now includes "Administration" section for super-admins.
- User profile form (name, bio, picture) wired into settings.
- User avatar dropdown menu added to top navigation bar.
- `SetTimezone` component uncommented in app layout.
- Billing address element, notification component, and FAQ heading uncommented.
- Dead TikTok validity reference removed.
- Admin dashboard page created at `/admin/dashboard`.
- Read-only "Media Providers" panel added to Brand & AI settings (`GET /ai/media-providers`).
- "Summarize comments" button added to comment composer.

---

## v3.5.0 — Security hardening + feature expansion

A codebase-hardening and feature-expansion release. Every change is additive or a refactor under
existing contracts — no breaking changes, no schema renames.

### Security & infrastructure hardening
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

### New feature surfaces
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

---

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
- **No-provider behavior** — with no active AI provider configured for an org, AI is **off** for
  that org across all four surfaces (`resolveConfigForScope` returns null; surfaces report "AI not
  configured"). The frontend does not mount CopilotKit when AI is off and routes the user to
  Settings → AI. No env-`OPENAI_API_KEY` fallback (since v3.6.3).

---

## v3.3.0 — Calendar, post detail & social comments

- Clicking a calendar card **body** opens a new **Post Detail** modal (KPI header + post thread);
  the edit modal now opens from a settings icon on the card's hover strip.
- A scheduled/published pill and a card stats footer (views/likes/comments) are sourced from
  persisted post snapshots.
- Foundation for **social comments** — synced platform comments, per-user read state, and a
  Temporal sync workflow (gated by `RUN_CRON`).

---

## v3.2.0 — Three extra providers (36 channels)

Adds **Tumblr** (OAuth2, NPF posts), **Pixelfed** (instance URL + access token, Mastodon-compatible),
and **PeerTube** (instance URL + login, single-video uploads). No database migration required.

---

## v3.1.0 — Persisted analytics dashboard

Replaces single-channel live-fetch analytics with a persisted multi-channel dashboard. Daily metric
snapshots are collected by a Temporal workflow (requires `RUN_CRON=true` on one orchestrator
instance) and served through `/analytics/v2` with real period-over-period comparisons, charts, and
CSV/JSON export. Daily snapshots roll up to weekly after ~18 months; per-post snapshots prune after
90 days (both windows env-configurable).

---

## v3.0.0 — Database-backed provider configuration

Channel OAuth/API credentials are managed through an admin UI at `/admin/channels` instead of
environment variables, and are encrypted at rest. Environment variables were kept as a fallback: with no
DB configs present, providers fall back to `process.env`. A one-time migration script imports
existing env credentials into the database.

> **Note:** The env var fallback and migration helpers described in v3.0.0 were fully removed in
> v3.7.1. All credentials now come exclusively from the database.

---

## Backward compatibility commitments

This fork is run in production. Two invariants are deliberately preserved:

1. **Legacy public analytics route** — the original public API analytics route keeps its response
   shape for n8n/Zapier/Make compatibility; a parallel v2 route was added rather than changing it.
2. **Schema changes are additive** — new tables, nullable-or-defaulted columns. The `db push` model
   never drops or renames columns without a manual backfill plan. (v3.8.10 was the deliberate
   exception: a single reviewed destructive push, preceded by a DB snapshot, after all readers had
   been cut over and backfilled — see
   [Upgrading](../operations-guide/upgrading.md#v3-8-9-v3-8-10).)

> Verified against v3.8.10

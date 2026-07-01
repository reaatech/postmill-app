# Changelog

> **AI-native fork by [REAA](https://reaatech.com).** A governed, multi-provider AI layer (25
> providers, bring-your-own-keys) powers the platform — on-brand content generation, smart comment
> replies, brand-voice profiles, semantic (RAG) search over your own content, compliance guardrails,
> and per-org spend caps with a full audit log; every AI entry point scoped, rate-limited, and
> budget-checked. Everything else builds around that: persisted multi-channel analytics, a
> cross-channel comment inbox, campaigns, native polls, 36+ channels, and a security-hardened,
> self-hosted stack. Full release history below (newest first).

## Unreleased

### Added
- **Campaign Discussion (Jira-style collaborative thread).** The campaign dashboard gains a
  **Discussion** section below the tabbed content where org members talk about the campaign. It has a
  TipTap WYSIWYG editor (bold/italic/underline/strike, headings, lists, links, emoji) that can
  **embed images/video** picked from the media library, plus **@mentions** (notify via the existing
  `NotificationService`, `comments` category), **emoji reactions**, one-level **threaded replies**,
  **pin/resolve**, and edit/delete-your-own with author avatars and relative timestamps. Note HTML is
  sanitized on write (server) and on render (`SafeContent`). Backed by two additive tables
  (`CampaignNote`, `CampaignNoteReaction`) and `GET/POST/PUT/DELETE /campaigns/:id/notes` (+ `pin`,
  `resolve`, `reactions`) — org-scoped and RBAC-gated (`posts:update`). Distinct from the synced
  social **Comments** feature.
- **Per-organization AI Model Defaults and Media Defaults.** Settings → AI gains a **Model Defaults**
  sub-tab where admins pick the default model for each category (`low-reasoning`, `high-reasoning`,
  `vision`, `workflow`). Settings → Content gains a **Media Defaults** sub-tab for all 16 media
  categories (image/video/audio generation, speech, captions, slides, etc.). Defaults are stored in
  the new `OrgDefaultModel` table and resolved lazily from enabled providers' live catalogs. The
  legacy `scopeModels` admin endpoints are removed; `generator`/`agent`/`mcp` now share the
  `high-reasoning` default, and `reasoning:true` resolves through it. AI-tab providers (e.g. OpenAI)
  now also appear under **Media Defaults** via the AI+Media candidate union. A kill switch
  `AI_MODEL_DEFAULTS_ENABLED=false` reverts AI model resolution to the legacy chain. The legacy
  `VideoManager`, `@Video` registry, `ImagesSlides`, `Veo3`, `AiMediaGenerationService`, and the
  `generate.video.options` chat tool were deleted; the video generator, composer AI media tools, and
  Designer media operations now route through the defaults-resolved utility facade. Removed env vars:
  `KIEAI_API_KEY`, `TRANSLOADIT_AUTH`, `TRANSLOADIT_SECRET`, and the legacy `ELEVENSLABS_API_KEY`
  path (configure ElevenLabs as an AI Media provider instead). `FAL_KEY` remains in use by the
  short-link adapter. Run `pnpm run prisma-generate` after pulling; `BackfillService` seeds defaults
  for existing orgs on deploy.

### Changed
- **Post composer unified + renamed `new-launch` → `composer`.** The `apps/frontend/src/components/new-launch/`
  directory is now `components/composer/`, and the two former thin wrappers (`PostComposer` route wrapper
  + `AddEditModal` modal wrapper) are merged into a **single `Composer` entry** (`composer/composer.tsx`)
  mounted everywhere a post is composed — `/schedule/post`, agent chat, Settings → Content → Sets,
  campaign planning, the calendar edit modal, standalone modal, and the media-tool "send to composer"
  handoffs. Import-path/rename only for consumers (no editor rebuild). **Behavior parity:** the
  `/schedule/post` create route and agent-chat new-post path now **auto-add signatures** like every other
  surface already did.
- **Public API `POST /public/v1/generate-video` is now asynchronous (response shape changed).**
  Video generation moved from a synchronous call (which returned the finished video at `response.path`)
  to the queued media-job pipeline. The response is now a self-describing, back-compatible object:
  `{ id, status, jobId, path, name, pollUrl }`. When a finished URL is available synchronously
  (image/url fallback) `status` is `completed` and `path` is the URL (legacy clients reading `.path`
  still work). When a job is queued, `status` is `pending`, `path` is empty, and the client polls the
  **new** API-key-reachable route `GET /public/v1/generate-video/:id` (returned in `pollUrl`) until
  `status === 'completed'`, then reads `path`. n8n/Zapier integrations that assumed a synchronous
  `path` must add the poll step. `POST /public/v1/video/function` (`loadVoices`) is unchanged.
- **Notifications v2 is now the single surface for all email + in-app/push notifications.** The
  placeholder category set was replaced with eight categories derived from the app's real triggers —
  `post_published`, `post_failed`, `channels`, `comments`, `budget`, `media`, `announcements`,
  `streak` — each independently toggleable per channel (email/push/in-app) at `/user/me` →
  Notifications. The overloaded `system` catch-all and the never-fired `watchlist` category were
  removed (the unrelated analytics watchlist feature is untouched), and the dead
  `notifyInboxBacklog` / `notifyWatchlistTrend` / `notifySystem` convenience methods were deleted.
  The **streak reminder** is now a real, preference-gated category routed through the notification
  pipeline (it previously emailed every member directly, bypassing preferences, and now also appears
  in the in-app bell). **Transactional emails** (account activation, password reset, team invite,
  billing-cancel) are unified onto `NotificationService.sendEmail` as always-on sends (no
  preference toggle, no stray in-app row) — no email path bypasses `NotificationService` anymore.
  Category *renames* are code-only (categories persist as JSON and self-heal on read), but this
  release **does add schema** — the new `NotificationPreference`, `NotificationRead`,
  `NotificationDigestQueue`, and `PushToken` models plus `Notifications.type/title/metadata` — so a
  `prisma db push` is required. **Migration safety:** the legacy per-user email toggles
  (`UserProfile.sendSuccessEmails/sendFailureEmails/sendStreakEmails`) are **retained this release**
  as an expand-contract step; `BackfillService` copies any opt-OUT into
  `NotificationPreference.categories` on deploy (no manual script needed), and the columns are
  scheduled for **drop in the next release**. This prevents opted-out users from being silently
  re-opted-in (the defaults are opt-in). Run `pnpm run prisma-generate` after pulling.

### Added
- **Unified, versioned provider framework (v4.0.0).** All provider domains — AI, Media, Storage,
  Short-link, Social, VPN, Content Packs, Email, Auth — now resolve through a single
  `ProviderKernel` (`libraries/providers/kernel`) with one workspace package per provider
  (`libraries/providers/<id>`). Each provider config/ledger row carries a pinned `version`
  (`v1` today); resolution honors the pinned version so a future `v2` never silently changes an
  existing org's behavior. A `PROVIDER_KERNEL=legacy` env kill switch reverts to the old
  in-memory registries for the release window. New endpoints: `GET /providers/catalog?domain=`
  (public catalog) and `GET /admin/providers/health?domain=` (super-admin health). See
  `docs/developer-docs/provider-framework.md` and `docs/reference/provider-versions.md`.
- **Campaign comments — view & reply, folded into the dashboard.** Each campaign's dashboard gains a
  full **Comments** section over its posts' synced comments: filter by status, **channel**, assignee,
  or unread; **reply** inline (with AI draft), like, cycle status, assign, and mark handled —
  individually or in bulk. It reuses the existing cross-channel inbox endpoint, now with optional
  `campaignId` + `integrationId` filters, plus a shared `CommentCard` (also adopted by the standalone
  `/comments` inbox). The dashboard's **"Comments" KPI and `comments` goal now count the synced,
  replyable comments** (matching the section and the public report) rather than the platform-reported
  engagement total. Additive — no schema change.
- **Channels settings: many named credential sets per provider.** Settings → Channels now manages
  *named* OAuth-app credential sets — an org can add **multiple sets for the same provider**, each
  with a required **name** and its **own auth** (client id/secret/scopes/redirect). Configuration
  opens in a **modal**; the **Add channel** picker browses providers with their capability tags and a
  single **Capabilities** checkbox-dropdown filter (replacing the old row of filter buttons); the page
  heading was removed. Backed by an additive, db-push-safe schema change: `OrgProviderConfiguration`
  drops its `(organizationId, identifier)` unique in favour of `(organizationId, identifier, name)`
  and is resolved by row `id`, and `Integration` gains a nullable `providerConfigId` FK
  (`onDelete: SetNull`) binding each connected account to the credential set it used. Credential
  resolution falls back to the org's primary set for unbound/legacy connections. When linking a new
  account, if a provider has more than one credential set the connect flow **prompts which set to
  use** (one set ⇒ bound automatically; none ⇒ legacy primary-config flow); the choice rides through
  the OAuth `?config=<id>` binding.

### Changed
- **Notifications v2 surfaces split to their correct homes.** The combined Settings → Notifications
  tab is gone: per-user notification preferences (channels × categories + digest) now live in the
  **Notifications tab of `/user/me`** (replacing the old email-only toggles), and the admin broadcast
  composer is its own **Settings → Broadcast** tab under the **Workspace** heading (gated on
  `notifications:manage`). This also fixes two bugs — saving preferences failed validation because
  `UpdateNotificationPreferenceDto.masters` was typed as nested channel objects instead of flat
  booleans, and the broadcast panel's `<form>` nested inside the settings form threw a React
  `validateDOMNesting` console error on load (the broadcast composer no longer uses a `<form>`).
  The legacy `EmailNotificationsComponent` and its `GET`/`POST /user/email-notifications` shim
  (success/failure/streak email toggles) were removed — they were a thin adapter over the same v2
  preferences (streak = the `system` category's email channel), so nothing is lost.
- **Brand editor redesigned for beginners.** The previously-overwhelming single scroll (Brand Voice +
  Brand Kit + Knowledge Base stacked) is now split into three tabs — **Voice & Tone**, **Brand Kit**,
  **Knowledge** — each with a one-line "what this does" hint, and all copy rewritten in plain language
  for non-technical users. The Knowledge tab's technical cards (Vector Database, Auto-Index) are tucked
  behind an "Advanced settings (most people can skip these)" toggle so the default view stays simple.

### Added
- **Campaign Hub.** Campaigns now have a dedicated dashboard (`/campaigns/:id`) with KPIs,
  recent changelog, planning workspace, tagged items (tags, media, notes, tasks, personas, tone,
  messages, goals, KPIs), and a post section. Draft approval flow: drafts inside a campaign must be
  marked `approved` before they can be promoted to scheduled posts. Campaign-level UTM tagging
  (`utmEnabled`) automatically appends `utm_campaign`, `utm_source`, and `utm_medium` to outbound
  links. Campaigns can be copied with optional date shifting, cloning only draft posts and re-tagging
  all campaign items. A shareable public report (`/public/campaign-report/:token`) exposes a read-only
  JSON view when enabled, plus CSV/PDF export for org members. Daily cron `campaign-tag-purge`
  soft-deletes/expunges stale campaign items after `CAMPAIGN_PURGE_DAYS` (default 30). Backend:
  `CampaignsController`, `CampaignsService`, `CampaignReportService`, `CampaignActivity`,
  `CampaignReportActivity`, `CampaignTagPurgeActivity`. Frontend:
  `apps/frontend/src/components/campaigns/`.
- **VPN provider settings surface.** Settings → VPN is a new credential-only provider page that
  mirrors AI/Shortlinks: provider cards with brand icons, configured/enabled badges, search, and
  per-provider configuration. Adapters are included for 15 consumer VPN providers: **NordVPN**,
  **ExpressVPN**, **Surfshark**, **Proton VPN**, **Mullvad**, **CyberGhost**, **Private Internet Access**,
  **IPVanish**, **Windscribe**, **TunnelBear**, **Hotspot Shield**, **PureVPN**, **VyprVPN**,
  **hide.me**, and **Mozilla VPN**. Credentials are encrypted at rest in the new `OrgVpnConfig` table
  and never returned to the browser. Endpoints: `GET /settings/vpn/config`,
  `GET /settings/vpn/providers`, `PUT/DELETE /settings/vpn/config/:identifier`,
  `POST /settings/vpn/config/:identifier/test`.
- **Per-channel VPN egress (multi-region, live routing).** A channel config (Settings → Channels →
  edit) gains an optional **2-column VPN row** — an Enabled/Disabled switch (off by default) plus a
  filterable **`provider: region`** combobox. The row is hidden when the org has no enabled VPN
  regions. Proxy-capable providers (NordVPN, Private Internet Access) now declare a catalog of
  **egress regions**; Settings → VPN gains a per-provider region multi-select, and the enabled
  provider×region combinations populate the channel picker. When a channel has an enabled selection,
  **every outbound posting request that provider makes routes through that region's proxy** — a
  per-request undici dispatcher (SOCKS5 via the `socks` package, HTTP-CONNECT via undici `ProxyAgent`)
  injected through `AsyncLocalStorage` at publish time and picked up in `SocialAbstract.fetch()`.
  SSRF protection is preserved: the proxy endpoint is validated as public, the proxy-connect leg keeps
  the private-IP DNS pin, and the destination is re-checked as public HTTPS before dispatch.
  Dispatchers are pooled per `(org, provider, region, creds-fingerprint)` and invalidated on any VPN
  config change. Additive, db-push-safe schema: `OrgVpnConfig.regions` (JSON id list) and
  `OrgProviderConfiguration.vpnSelection` (JSON `{enabled, identifier, regionId}`). **Scope/limits:**
  only SOCKS5/HTTP-CONNECT-capable providers route (WireGuard/OpenVPN tunnels are out of scope);
  providers that call raw `fetch`/`axios` instead of `this.fetch()` (Medium, parts of LinkedIn auth,
  Bluesky) are not yet proxied. Region endpoints/credential schemes are source-grounded and need a
  live smoke test.
- **Bring-your-own-proxy: a "Custom VPN / Proxy" provider.** Alongside the consumer-VPN catalog,
  Settings → VPN now offers a generic provider where the org enters its **own** SOCKS5 / HTTP-CONNECT
  endpoint (connection name, host, port, protocol, optional username/password) — e.g. a proxy on your
  office network — and channels using it egress from that proxy's IP. Its single region is **derived
  from the stored config** (no fixed catalog, no per-region checklist); auth is optional for open
  proxies. The proxy must be reachable from the Postmill server (a public host, or a private address
  with `SSRF_ALLOWED_PRIVATE_CIDRS` set on a self-hosted instance).
- **Brand Voice is now per-language.** Language moved to the top of the Brand Voice editor and now
  scopes the dataset: each language has its own instructions **and** its own optional per-channel
  overrides; switching the language shows a fresh dataset. Backed by a new additive
  `AIBrandProfile.languageProfiles` JSON column (`{ [lang]: { instructions, overrides } }`,
  db-push-safe); the active language's profile is mirrored into the legacy
  `instructions`/`platformInstructions` columns so `_loadBrandVoice` (the only reader) keeps working,
  and brands that predate the column migrate their single set into the active language on first edit.
  Channel overrides are keyed by the connected channel (integration id), chosen from a dropdown of the
  org's active channels. (Per-channel overrides are stored but not yet consumed at generation; the
  per-language global instructions are.)
- **RAG vector database — remote pgvector + Pinecone, alongside Qdrant.** The Knowledge Base vector
  store now offers four options: **Postmill (Default)** (built-in pgvector, no config), **PG Vector
  (Remote)** (external Postgres via a `pg` pool — new `RemotePgVectorStoreAdapter`), **Qdrant
  (Remote)**, and **Pinecone (Remote)** (new `PineconeVectorStoreAdapter`, REST via `safeFetch`, no
  SDK dependency). The `VectorStoreAdapter` selection was generalised from pgvector-vs-qdrant to a
  `local | external` dispatch; remote stores are lazily built from settings, probed, and fall back to
  the built-in store when unreachable. Each remote has a **Test Connection** button. Secrets (remote
  DB connection string, Qdrant/Pinecone API keys) are now stored **encrypted** in
  `AISystemSettings.secretSettings` (fixing a pre-existing bug where the Qdrant key was written in
  cleartext) and never returned to the client. No schema migration (settings are JSON).
- **Brand assets in Settings → Brands.** The brand editor now surfaces a brand kit that previously
  only the Designer could edit: a **colour palette**, **attached assets** (logos / reference imagery
  picked via `MediaSelectorModal` — stock picks are imported to Files so they persist — each with an
  optional caption), and the **brand-enforcement** toggle, all saved through the existing
  `PUT /brands/:id`. New additive `AIBrandProfile.assets Json[]` column (`{fileId,url,caption}`,
  db-push-safe) backs the attachments; `CreateBrandDto`/`UpdateBrandDto` + service/repo carry it. The
  brand list shows a colour-swatch + asset-count preview, the delete uses the shared confirm dialog,
  and a dead `useT()` local was removed.
- **Unified "Content" settings page.** Settings now has a single **Content** tab with sub-tabs for
  **AI Media**, **Content Packs**, **Sets** and **Signatures** (replacing the standalone AI Media,
  Content Packs, Sets and Signatures entries). Sub-tabs respect their existing gates (Content Packs on
  `media-config:manage`; Sets/Signatures on paid tiers). The old `?tab=media_providers`,
  `?tab=content_packs`, `?tab=sets` and `?tab=signatures` deep-links still resolve to the right
  Content sub-tab.
- **Signatures — channel scope, logo/sticker, usage tracking & auto-add wiring.** Signatures gained
  a `name`, a `channels[]` scope (integration ids; empty = all channels), a `usageCount`, and an
  optional `pictureId → File` logo/sticker. New endpoints: `GET /signatures/auto` (all auto-add
  signatures) and `POST /signatures/:id/track-usage`. The Settings → Signatures tab was rebuilt
  (channel-scope avatar chips, logo picker via `MediaSelectorModal`, usage, modern card list) and the
  broken auto-add toggle was fixed. New posts are now **seeded with each auto-add signature's text and
  logo**, gated by channel scope — baked into the composer's initial value (the only path the TipTap
  editor honours); applying a signature (auto or manual) tracks usage. The single-auto-add restriction
  was removed so several channel-scoped auto-add signatures can coexist. *(Schema: additive columns
  on `Signatures` + a `File.signatures` back-relation, db-push-safe.)*
- **Sets — media-rich list + RBAC gating.** The Sets list (which previously showed blank channels and
  a `0` post count because it parsed the composer payload as an array) now reads `content.posts`:
  real post count, channel avatars (joined against `/integrations/list`), and a media-thumbnail stack,
  in a modern card layout. `SetsController` is now gated on the `posts` RBAC resource
  (`OrgRbacGuard` + `@RequirePermission`) — it was previously ungated.
- **Recraft, Ideogram, and Leonardo.ai media studios** (`/media/recraft`, `/media/ideogram`,
  `/media/leonardo`) — three own-key image-generation Studio Kit studios configured at Settings → Media.
  **Recraft** (Bearer) for raster + vector/SVG + icons; **Ideogram** for accurate in-image text (key as
  `Api-Key` header, multipart/form-data body, single v3 endpoint); **Leonardo.ai** (Bearer) across its
  fine-tuned model family — its API is async (create → poll), so the adapter polls internally to keep
  the synchronous image contract (the BFL/Qwen pattern). All three return hosted URLs and land artifacts
  in `/files`. Built source-grounded against each official API reference (no live key).
- **Google AI Studio media studio** (`/media/google-ai`, registry id `google`) — a full Studio Kit
  studio for the **Gemini Developer API**. Image tab covers **Nano Banana** (`gemini-2.5-flash-image`
  via `:generateContent`) and **Imagen** (`imagen-*` via `:predict`), routed by the chosen model; Video
  tab runs **Veo** (`veo-*` via `:predictLongRunning`, polled to completion — no webhook → poll-cron).
  It is a **universal-credential** provider: it reuses the org's existing Settings → AI "Google Gemini"
  key (added to `UNIVERSAL_AI_CREDENTIAL`, the Qwen pattern) — configure once, works for both LLM and
  media. Veo's finished MP4 is auth-only bytes at the returned file URI, so `pollJob` downloads it with
  the key and returns it inline as a `data:video/mp4` URL (the Sora pattern). Built source-grounded
  against the official `ai.google.dev` reference (no live key).
- **Sora media studio** (`/media/sora`) — a branded Studio Kit studio for OpenAI Sora that reuses the
  org's existing OpenAI key (`descriptor.provider: 'openai'`, the Pika-rides-fal pattern). Video-only
  with Text→Video and Image→Video tabs (`sora-2` / `sora-2-pro`). `generateVideo` + `pollJob` were added
  to the OpenAI media adapter (async Videos API: `POST /v1/videos` → poll `GET /v1/videos/{id}`, no
  webhook → poll-cron). Because the finished MP4 is auth-only bytes at `/v1/videos/{id}/content` (no
  public URL), `pollJob` downloads it with the key and returns it inline as a `data:video/mp4` URL so the
  lifecycle decodes it directly. Image-to-video uploads the source frame as multipart `input_reference`.
  Built source-grounded against the official OpenAI Videos API (no live key).
- **LTX Studio media studio** (`/media/ltx`) — an own-key Studio Kit studio for LTX Studio (Lightricks,
  `api.ltx.video`), video-only on the LTX-2 / LTX-2.3 model family. Three tabs: **Text→Video**,
  **Image→Video** (source + optional last-frame), and **Audio→Video** (Pro models only). Single Bearer
  key at Settings → Media. All async submit-and-poll (`POST /v2/<op>` → `{ id }`, poll
  `GET /v2/<op>/{id}` → `result.video_url`, no webhook → poll-cron). The sub-operation is routed by the
  media inputs present, and the adapter namespaces the job id as `<op>:<id>` so polling hits the right
  status endpoint. Built source-grounded against the official `docs.ltx.video` reference (no live key) —
  resolution-string formatting may need a live smoke test.
- **Pika media studio** (`/media/pika`) — a branded Studio Kit studio for Pika, served through the
  existing fal.ai adapter (Pika's official API is fal-hosted per pika.art/api), mirroring the Kling
  pattern: `provider: 'fal'`, the `model` field carries the fal endpoint id, reuses the org's fal key.
  Three tabs: Text→Video and Image→Video (`fal-ai/pika/v2.2/*`) plus **Pikaffects**
  (`fal-ai/pika/v1.5/pikaffects`, 16 one-click VFX). Frontend-only — no new adapter or registry id.
- **Higgsfield media studio** (`/media/higgsfield`) — an own-key Studio Kit studio for Higgsfield
  (`platform.higgsfield.ai`) with three tabs: **Soul** Text→Image (+ optional reference image), **DoP**
  Image→Video (`dop-lite/turbo/standard`), and **Speak** (portrait + audio → talking video). Two-part
  credential (`keyId` + `keySecret`, `Authorization: Key <id>:<secret>`) configured at Settings → AI
  Media via the multi-field modal. Submit-and-poll (`POST {endpoint}` → poll `/requests/{id}/status`):
  image bounded-poll-synchronous, video poll-cron. Built source-grounded against the official
  higgsfield-js SDK — no live key, so Soul size presets may need a smoke test.
- **Wan media studio** (`/media/wan`) — a dedicated, Wan-branded Studio Kit studio for Alibaba Wan
  (Tongyi Wanxiang) on **Alibaba Cloud Model Studio** with three tabs: Text→Image (`wan2.2-t2i*` /
  `wanx2.1-t2i*`), Text→Video and Image→Video (`wan2.x-t2v*` / `wan2.x-i2v*`). Same DashScope
  async-task protocol as the Qwen studio (`X-DashScope-Async` → poll `GET /tasks/{id}`; image
  bounded-poll-synchronous, video poll-cron) pointed at the **international** host
  `dashscope-intl.aliyuncs.com`. **Own-key** provider configured at Settings → AI Media (not a
  credential-reuse hub). Built source-grounded against Alibaba's public Model Studio API reference —
  the exact intl host/region may need a live smoke test.
- **AI-hub media studios** (`/media/{togetherai,siliconflow,groq,openrouter,fireworks,deepinfra,gateway,bedrock,azure}`)
  — The AI hub/aggregator providers from Settings → AI now also expose their **media** catalogs as
  full Studio Kit studios, each **reusing the org's existing AI key** (the Qwen
  `UNIVERSAL_AI_CREDENTIAL` pattern, now 10 providers). Coverage per hub: Together (image + async
  video + TTS), SiliconFlow (image + Wan2.x video + TTS), DeepInfra (image + video + TTS), Groq (TTS),
  OpenRouter (image), Fireworks (image), Vercel AI Gateway (image + video via AI SDK v6
  `experimental_generateVideo`), Amazon Bedrock + Azure OpenAI (image, via AI-SDK delegation so SigV4 /
  Azure-deployment auth is handled by the provider packages — no hand-rolled signing).
  - **Dynamic model discovery** — because these catalogs are large and change often, the studio model
    dropdown is populated **live** from each hub's `/v1/models` (filtered by modality) via a new
    `GET /media/studio/:provider/models?operation=` route (Redis-cached) and a `source: 'models'`
    searchable combobox in the Studio Kit; it also accepts a typed model id so an incomplete catalog
    never blocks a render.
  - Native-REST adapters share an `openai-compatible-media.adapter.ts` base (Together/SiliconFlow);
    Bedrock/Azure/Gateway delegate image to the AI registry via a static-injected helper, keeping
    `MediaStudioService` provider-agnostic. No schema migration; no env fallback.
- **Studio Kit + AI Video studios** (`/media/{runway,luma,minimax,kling}`) — A reusable scaffold so a
  new media-provider studio is mostly a descriptor, not a from-scratch build. Shared shell, render
  queue, and the three handoffs (Save-to-Files / Edit-in-Designer / Post-to-Composer) are write-once;
  each provider supplies a declarative descriptor whose field names are the provider's native API
  params, so studios are **full-featured** (no lowest-common-denominator cap), with a `custom` escape
  hatch for structured tools.
  - **Four full-featured video studios:** Runway (image→video + text→image), Luma (text/image→video
    with keyframes + loop), MiniMax (text/image→video + subject reference), Kling via fal
    (text/image→video). All land renders in `/files` via the existing media-job pipeline
    (webhook-first, poll-cron fallback).
  - One **generic backend endpoint** serves every simple provider (no per-provider controller):
    `GET/POST /media/studio/:provider/{status,jobs,generate}` (`MediaStudioController` +
    `MediaStudioService`), dispatching to the registry adapter by operation. Runway/Luma/MiniMax
    adapters enriched with native-param passthrough; no schema migration.
  - Frontend kit at `media-tools/studio-kit/`; HeyGen and Replicate keep their bespoke
    implementations (not retrofitted). Veo (Vertex) deferred pending OAuth credential confirmation.
- **AI Image studios** (`/media/{black-forest-labs,stability-ai,openai}`) — Three full-featured
  image-generation studios on the Studio Kit, one per provider (not a bundled multi-provider form):
  Black Forest Labs (FLUX 1.1 Pro/Ultra/Pro/Dev — width/height, aspect ratio, prompt upsampling,
  safety tolerance, seed), Stability AI (Stable Image Core/Ultra/SD3 — aspect ratio, negative prompt,
  style presets, output format, seed), and OpenAI (gpt-image-1 and DALL·E 3 as separate fixed-model
  tabs with each model's correct size/quality/background/style params). `operation: 'image'` completes
  synchronously and lands in `/files`. The `black-forest-labs`, `stability-ai`, and `openai-media`
  adapters gained the same native-param `options.input` passthrough (back-compatible — legacy defaults
  apply when `input` is absent); no schema migration.
- **Qwen media studio** (`/media/qwen`) — Alibaba DashScope added as a media provider with a
  three-tab Studio Kit studio: Text→Image (Qwen-Image), Text→Video and Image→Video (Wan2.x). Both are
  DashScope **async task APIs** (`X-DashScope-Async` → `task_id` → poll `/tasks/{id}`): image keeps the
  synchronous contract via bounded internal polling; video completes via the poll-cron (no webhook).
  The adapter routes `prompt`/`negative_prompt`/`img_url` into DashScope's `input` and all other native
  params into `parameters`. **The DashScope key is shared with the Qwen LLM provider** — Qwen is a
  *universal-credential* provider, so the media surface falls back to the org's existing Settings → AI
  Qwen key when no dedicated media credential exists (read from `AIOrgProviderConfig` via
  `OrgAiSettingsRepository`, decrypted with the media `EncryptionService`). Configure the key once on
  either surface; no schema migration, no env fallback.
- **AI Voiceover + Avatar-video studios** (`/media/{elevenlabs,did,hedra,tavus}` + an OpenAI TTS tab) —
  The remaining kit-fit media providers, completing the Studio Kit's `audio` and avatar-`video` paths:
  - **Audio (TTS)** — **ElevenLabs** (model, premade voice, stability, similarity boost, style,
    speaker boost) and a third **Text → Speech** tab on the existing **OpenAI** studio (model, voice,
    MP3/WAV, speed). `operation: 'audio'` completes synchronously — the clip returns inline as a
    `data:audio/…;base64,` URL and lands in the org's audio files (no webhook).
  - **Avatar / character video** — **D-ID** (talking-head from a portrait + voice provider/id),
    **Hedra** (character video from a keyframe + aspect ratio), **Tavus** (replica video from a replica
    id + script). `operation: 'video'`, completed webhook-first (poll-cron fallback); the source image
    is resolved server-side to a provider-reachable URL.
  - The `elevenlabs`, `openai-media`, `did`, `hedra`, and `tavus` adapters gained the same
    native-param `options.input` passthrough (back-compatible — legacy `AiMediaService` defaults apply
    when `input` is absent); no schema migration. **Deepgram** (STT → text) is intentionally not a kit
    studio.
- **Deepgram studio** (`/media/deepgram`) — transcription / captions tool; the last media adapter
  without a studio now has one. STT returns text (not a `/files` artifact), so it can't use the
  generic kit pipeline: it reuses the Studio Kit `StudioShell` chrome with a bespoke `custom` panel
  over a dedicated `/media/deepgram` backend (`DeepgramController` → `DeepgramService`). Reads source
  bytes straight from storage (`readFile`, no SSRF surface), transcribes via the `deepgram` adapter,
  and returns transcript + phrase-chunked caption segments. Exports `.srt` / `.vtt` / `.txt`
  client-side (no allowlist change), plus copy and a Send-to-composer handoff. Adapter
  `speechToTextWords` gained opt-in `smart_format`/`punctuate` + `language` passthrough (the Designer
  timeline's auto-caption call is unchanged). No schema migration.
  - **Transcript history in the render queue** — Save-to-Files persists the transcript as a completed
    `stt` `AIMediaJob` (via `completeJobWithBuffer`), surfaced through the existing studio jobs
    endpoint; the shared `RenderQueue` gained an additive `stt` text card (Copy / To composer).
  - **Edit in Designer (captions, no re-transcribe)** — for a video source, hands the clip + word
    timings to the Designer (`?captions=1` + `sessionStorage`), which builds a video project with a
    caption track pre-built from the words — the only path that loads a video onto the Designer
    timeline from a URL.
- **Kling studio name** — the `fal` media adapter's display name is now **"Kling"** (was "fal.ai") so
  Settings → Media matches the studio (`/media/kling`, nav + title "Kling"). Config identifier stays
  `fal` (unchanged at-rest key).
- **Vertex AI studio** (`/media/vertex`) — Google **Veo** (Text → Video) and **Imagen** (Text →
  Image) as a two-tab kit studio. Unlike every other media provider, Vertex uses GCP credentials, not
  a single API key: the adapter declares a `credentialFields` schema (project + location +
  service-account JSON, matching the AI Vertex adapter) and the Settings → Media modal renders those
  fields dynamically (single `apiKey` remains the default for all other providers). A short-lived
  access token is **minted per request** from the service-account key via `google-auth-library` — a
  stored static token would expire in ~1h. Veo has no completion webhook, so it completes via the
  `media-jobs-poll` cron (like Runway); Imagen completes synchronously inline. No schema migration.
- **HeyGen Studio** (`/media/heygen`) — Native AI avatar-video workspace built on the AI Media
  provider stack (per-org `MediaProviderConfig` `'heygen'`, encrypted key in Settings → Media; no
  env-var fallback).
  - **Storyboard** canvas: multi-scene avatar video via HeyGen `video_inputs[]` — each scene is an
    avatar + voice + script + color/file background, with add/remove/reorder and 16:9 / 9:16 / 1:1.
  - **Talking Photo**: turn a `/files` image into a talking avatar (uploads to mint a `talking_photo_id`).
  - **Voiceover**: text-to-speech into the Files audio folder.
  - **Translate**: lip-synced video translation, one render per target language.
  - Avatar/voice catalogs cached per-org (Redis); voice previews in-picker. Live **Render queue**
    polling `GET /media/heygen/jobs`.
  - Every render saves to `/files` via the existing media-job pipeline, then offers **Edit in
    Designer** and **Post** to the composer.
  - Backend `HeyGenService` + `/media/heygen` controller; reuses `MediaJobLifecycleService`. Async
    poll routing is operation-namespaced (`video:` / `tts:` / `translate:`) in `HeyGenAdapter.pollJob`
    (backward-compatible with the generic media-provider path). No schema migration.
- **Replicate Studio** (`/media/replicate`) — Native generative media workspace powered by Replicate.
  - 18 categories: text-to-image, image-to-image, inpaint, upscale, background removal, text-to-video,
    image-to-video, video-to-video, caption, text-to-speech, speech-to-text, voice clone, music
    generation, music-to-music, meme generator, and video merge.
  - Warm official models by default with instant cost badges; optional community-model toggle with
    usage-based pricing.
  - Dynamic input forms per model, live cost estimation, and folder-aware async delivery for
    video/audio jobs.
  - Native mask painter for inpainting, ffmpeg-based merge editor for up to 6 clips, and a canvas
    meme generator with draggable text layers.
  - Audio enablement: upload, preview, and select audio files in Files; audio inputs for voice clone
    and music-to-music.
  - Per-org Replicate token configuration in Settings → Media Providers; no env-var fallback.
- **Designer** — Native open-source design editor replacing the proprietary Polotno SDK.
  - Built on react-konva (MIT), no license key required.
  - Full canvas editor with text, image, and shape elements; drag/resize/rotate via Konva Transformer.
  - Per-mount Zustand store (no singleton; resets on unmount).
  - Autosave, export to PNG via `POST /files/upload-simple`, and "Use in post" flow.
  - Channel size presets + safe-zone overlays from `channel-presets.ts`.
  - 9 side panels: Templates, Text, Elements, Photos/Videos, Uploads, Background, Layers, AI, Brand.
  - AI image generation via existing `/media/generate-image` endpoint (tenant's own AI providers).
  - Brand kit (logos, palette, fonts) via additive fields on `AIBrandProfile`.
  - Magic resize (proportional scaling to channel presets).
  - "Open in Designer" from stock photo/video preview.
  - Route: `/media/designer`, with navbar tab under Media Tools.
  - Backend: `Design` + `DesignTemplate` Prisma models, `/media/designs`, `/media/design-templates`, `/media/designer/proxy` endpoints.
- **Designer Phase 2** (`dev/MEDIA_PHASE_2.md`) — completeness pass on the editor:
  - **Editing:** selection-aware right Inspector + contextual selection toolbar; premium controls
    (color swatch/popover, slider, segmented, stepper, font-preview picker); opacity, flip, image
    replace, and crop.
  - **Canvas:** multi-select (shift/⌘ + marquee), group-aware selection, group/ungroup, snapping &
    alignment guides, custom transformer handles + dimension HUD, drag-and-drop from panels,
    clipboard (copy/cut/paste), and a full keyboard-shortcut matrix with a help overlay.
  - **Panels:** text effects (shadow/outline) + self-hosted OFL fonts, icons/stickers, gradient &
    image backgrounds, skeleton/retry loading states, and AI panel queued/failed/cancel states.
  - **Multi-page & export:** page thumbnails strip (add/duplicate/reorder/remove), high-res
    `pixelRatio` export, transparent-PNG, carousel (multi-page → multi-image) export, and export
    reusing `SaveToFilesModal`.
  - **AI & brand:** background-removal / inpaint / upscale endpoints (`/media/remove-background`,
    `/media/inpaint`, `/media/upscale`, credit-checked); brand-kit logo/palette/font write API;
    AI panel gated on an active org provider; magic-resize and safe-zone overlays wired.
  - **Video & animation (Phase 4):** per-element entrance animations + a timeline with live preview
    and WebM export (via `MediaRecorder`, no ffmpeg dependency).
  - **Server-side rendering (Phase 4):** headless `DesignRenderService` (node-canvas) renders a
    design doc to PNG/PDF (`/media/designs/render`); data-driven bulk generation
    (`/media/designs/bulk-generate`) substitutes `{{variables}}` per row.
  - **Stock surface:** masonry photo grid, infinite scroll, personality empty/error states, color
    swatch filters, responsive layout.
  - **Not included:** real-time multi-user collaboration (O5) — requires adding a WebSocket platform
    + CRDT (Yjs); tracked in `dev/MEDIA_PHASE_2.md` as the one deferred item.
- **Stock surface UX hardening** — Grid tiles are now keyboard-accessible buttons; error states don't wipe toolbar; skeleton grid loading; search magnifier + clear button; custom select styling; hover affordances.
- **Stock content expansion** — Free stock browsing now covers vectors (Pixabay), stickers (GIPHY),
  and icons (Iconify) alongside existing photos (Unsplash) and videos (Pexels). Each source carries
  `source`, `license`, and `attribution` metadata through preview, Designer open, and the
  `/files/import` save path.
- **Content Packs (premium BYOK)** — Per-organization premium stock packs via **Settings → Content
  Packs**. Magnific is the first supported pack: add a Magnific API key, set it active, and search
  results for photos/vectors/icons/videos are served from your own Magnific plan before falling back
  to free catalogs. Keys are encrypted at rest; minted download URLs are used for import.

### Removed
- **Legacy `/third-party` integration platform** — Removed the Gitroom-era third-party provider
  subsystem: the `/third-party` route + `third-parties/` UI, the `@ThirdParty` decorator,
  `ThirdPartyManager`/`ThirdPartyService`/`ThirdPartyController`, the HeyGen and ReelFarm providers,
  the `DEV_DISABLE_THIRDPARTY` flag, and the composer/Files "insert third-party media" path. AI
  avatar video now lives only in the new **HeyGen Studio**. The shared `slider.component` used by the
  TikTok/Instagram composer previews was moved to `components/ui/`. The "Integrations" nav entry was
  removed and the miswired "Connect a Social Channel" CTAs repointed to `/settings?tab=channels`.
  The `ThirdParty` Prisma model + `Organization.thirdParty` relation were dropped from the schema.

### Changed
- **Renamed "Vercel AI Gateway" / "AI Gateway" → "Vercel AI"** across the AI provider, media provider,
  the `/media/gateway` studio title, and the media nav. Identifier unchanged (`gateway`); display-name
  only.
- **Renamed "Google Vertex AI" → "Google Vertex"** across the AI provider, media provider, the
  `/media/vertex` studio title, and the media nav — disambiguating the enterprise GCP path (`vertex`,
  service-account auth) from the new consumer Gemini-key path (Google AI Studio, `google`). Identifier
  unchanged (`vertex`); display-name only.
- **Polotno removal** — Removed all `polotno`, `polonto`, `plontoKey` references across the codebase.
  - Deleted: `polonto.tsx`, `polonto/` directory, `polonto.css`, global.scss imports/rules.
  - Removed: `NEXT_PUBLIC_POLOTNO` from `.env.example`, `docker-compose.yaml`, and docs.
  - Removed: `plontoKey` from `VariableContext`, all three `layout.tsx` files.
  - Removed: `@blueprintjs/core` and `@blueprintjs/icons` (indirect deps no longer pulled in).
  - Gating: Designer opens on `media:read` for all members (previously `user?.tier?.ai` on multi-file picker).
- **Inngest migration** — Replaced Temporal with Inngest Cloud for durable background jobs.
  - Removed `RUN_CRON`, `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and Temporal/Elasticsearch
    services from Docker Compose and Coolify compose.
  - Added Inngest env vars (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_DEV`,
    `INNGEST_BASE_URL`, `USE_INNGEST`, etc.) to `.env.example` and configuration docs.
  - Added `ConfigurationChecker.checkInngest()` / `checkInngestUrl()` validation.
  - Updated frontend empty states/banners to remove `RUN_CRON` messaging.
  - Renamed `docs/operations-guide/temporal-and-cron.md` to `inngest-and-cron.md` and rewrote it
    for Inngest cron triggers, dev server, and env vars.

## [3.8.10] — 2026-06-11

### Breaking changes (single destructive push)
- Dropped dead Gitroom marketplace/GitHub-stars tables and columns.
- Legacy `UserOrganization.role` enum column removed (replaced by AppRole-based RBAC).
- `AIOrgProviderConfig.imageModel` / `AIProviderConfig.imageModel` columns removed (moved to Media providers).

### New features
- **RBAC system**: `AppRole`, `Permission`, `AppRolePermission` models with `@RequirePermission` decorator and `OrgRbacGuard` (HTTP 403 orthogonal to billing HTTP 402).
- **Identity/Profile split**: `UserProfile` model (1:1 with User) carrying profile/notification fields.
- **Sessions**: `Session` model with refresh-token rotation, device list, per-session revoke.
- **Platform admin panel**: `/admin` with DB-managed auth providers (incl. OIDC SSO), encrypted at rest.
- **Multi-brand**: `AIBrandProfile` now supports many brands per org with per-post brand selection via `Post.brandId`.
- **AI provider config**: 2-step auth + model defaults with reasoning/non-reasoning split.
- **Media providers**: `MediaProviderConfig` model + adapter interface with storage binding.
- **Storage**: UI redesigned to mirror AI page, render-bug fixed, per-tenant partition, unique-account enforcement. New env var `LOCAL_STORAGE_QUOTA_GB` (default 5) drives the default local quota.
- **Shortlinks**: UI redesigned with real icons, multi-account support, preference card removed from Settings.
- **Schedule dedicated pages**: `/schedule/post` (create) and `/schedule/post/:id` (edit) with tz-aware time picker.
- **Shared foundation**: `ProviderIcon`, `accountFingerprint`, `ProviderListShell` reused across all provider surfaces.

## [3.8.9] - 2026-06-11

### Fixed
- **Per-request ~2s stall on every authenticated API call (dev AND prod):** the RAG index queue
  worker ran a blocking `BRPOPLPUSH` (2s timeout, tight loop) on the shared `ioRedis` connection.
  ioredis pipelines all commands on one connection, so the global throttler check — which runs on
  every authenticated request — queued behind the block. Blocking pops now run on a dedicated
  duplicated connection. Measured: `/user/self` 2.0s → 6ms, analytics overview (repeat) 4.0s → 8ms.
- **Analytics overview recomputed on every view:** the 60s Redis cache was skipped whenever the
  range ends today — the dashboard default — so the default view never cached, and
  channel/posts/recommendations (which all funnel through `getOverview`) recomputed everything
  several times per render. The overview is now always cached for 60s.
- **Live-fallback hot loop:** failing integrations were never negative-cached, so the per-view
  live provider fan-out (token refresh, external API calls, `refreshWait` sleeps) re-fired on
  every analytics view. Failures (including token-refresh failures) now negative-cache for
  60s (dev) / 10min (prod).
- **LinkedIn Page analytics crash:** `analytics()` destructured `elements` from three LinkedIn
  responses unguarded — any error body threw `elements2 is not iterable`, which also broke the
  nightly snapshot sweep for the channel, keeping coverage low and the live fallback permanently
  engaged. Defaults added (matches the Facebook provider's defensive pattern).
- **Dev watch-restart orphans:** `nest start --watch` kills only the wrapper shell on recompile;
  the old backend stayed alive (~700 MB each), held port 3000, and served stale code while the
  new instance died with `EADDRINUSE`. A dev-only parent-death watchdog in backend + orchestrator
  `main.ts` now exits orphaned instances.
- **Frontend CSP `connect-src`:** the backend origin (from `NEXT_PUBLIC_BACKEND_URL`) is now
  included, fixing "Failed to fetch" on login in cross-origin dev splits; harmless in same-origin
  deployments.

### Added
- **Docker live-dev environment:** `Dockerfile.dev-live` + `docker-compose.dev-app.yaml` +
  `var/docker/dev-entrypoint.sh` — repo bind-mounted with watchers in the container
  (`START_FRONTEND`/`START_ORCHESTRATOR` opt-outs, `restart: unless-stopped`, polling tsc watcher
  for reliable rebuilds across the bind mount), and `scripts/seed-test-data.js` for UI-testing data.
- **Turbopack dev memory cap:** `experimental.turbopackMemoryLimit` (3 GB, dev only) in
  `next.config.ts` — Turbopack's native cache is unbounded by default and not governed by
  `--max-old-space-size`.

## [3.8.8] - 2026-06-10

### Added
- **Dashboard:** New `/dashboard` landing page with KPIs, charts, upcoming posts, and recommendations
- **Dashboard setup:** In-page onboarding checklist replacing the old modal overlay
- **Per-user API keys:** Hashed, show-once API keys with create/rotate/revoke (pm_live_... format)
- **API key management UI:** Full key lifecycle management in Settings → Developers
- **Settings reorganization:** Removed redundant "Settings" tab; moved shortlink preference into Shortlinks tab
- **DataTable component:** Reusable typed DataTable with sorting, pagination, selection, status pills, loading/empty/error states
- **EmptyState component:** Standardized empty state with icon, title, description, and optional action
- **PageHeader component:** Consistent page header with title, description, and action slot
- **Comments inbox sync:** On-demand sync via "Sync now" button + `POST /posts/inbox/sync` endpoint

### Changed
- **Branding:** Logo wordmark updated to "Postmill"; DataFast analytics domain updated to postmill.com
- **Theme de-purpled:** All purple, violet, indigo, magenta, and pink colors remapped to primary blue (#2b5cd3) family
- **Calendar cards:** Increased min-height for better content + stats fit; no more overlap
- **Button primitive:** Upgraded to canonical rounded-[8px] with hover/focus/active states and danger variant
- **Input/select primitives:** Focus rings, error-state borders, consistent disabled styling
- **Shortlinks tab:** Provider icons with brand-color fallbacks for all 19 providers
- **Login page:** Replaced inherited Postiz testimonials with product highlights panel
- **Error page:** Fully rebuilt with proper layout, logo, and actions
- **Integrations page:** Empty state now uses standard EmptyState component
- **Settings sidebar:** Section grouping with icons (Workspace, Providers, Automation, Developer)
- **Charts restyled:** Gradient fills, rounded bars, dotted gridlines, themed tooltips
- **Navigation:** Active item styling with accent bar; consistent icon sizing; comment badges as btnPrimary pills
- **Scrollbars + selection:** Custom styled for polished feel
- **Legacy token migration:** 100+ component files migrated from deprecated customColor/bg-sixth/border-fifth/bg-forth tokens to canonical design tokens

### Fixed
- Comments inbox showing empty despite real comments: added on-demand sync + clarified background-jobs requirement
- Onboarding overlay leaking onto analytics page: removed global overlay; replaced with in-page dashboard section
- Analytics empty state masked by onboarding overlay: added proper empty state with cron guidance
- Media settings tab "Failed to load" error: endpoints already corrected to user-scoped /ai/media-providers
- Plaintext org API key exposed in /user/self response: replaced with per-user hashed key system
- Calendar card content overlapping stats: increased min-height and removed hard caps
- Onboarding checklist "first post" step permanently incomplete: rewired to real post count
- Broken var(--purple-light) CSS reference: repointed to var(--new-boxFocused)

## [3.8.4] - 2026-06-10

### Fixed
- Amazon SES email webhook: SNS subscription confirmation handling corrected; bounce, complaint, and
  delivery event processing no longer silently drops events
- Email webhook signature verification for SendGrid, Mailgun, Postmark, and Resend aligned with
  provider specifications
- Documentation: backfill v3.8.0→v3.8.1 upgrade notes, restructure upgrading guide, add short-link
  provider credential reference, document email provider setup per-provider

## [3.8.3] - 2026-06-10

### Added
- Calendar stats: live-fallback enrich shows views/likes/comments on post cards without requiring a cron sweep
- User avatar menu now includes Profile link

### Changed
- Calendar → **Schedule**; route `/launches` → `/schedule` (with permanent redirect)
- Settings tabs now sorted alphabetically (General/Settings pinned first)
- Storage: LOCAL is always-on base storage; other providers mount onto it; no default provider concept
- Header top-bar icons aligned to consistent 36×36 sizing

### Removed
- Profile tab from settings panel (moved to user avatar menu)
- Settings gear icon from top header bar (accessible via avatar menu)
- `StorageProviderConfig.isDefault` column and all related backend/frontend code
- `POST /settings/storage/:id/set-default` API route

### Fixed
- Storage UI bugs (diagnosed and fixed in provider-form.modal, provider-card, and storage.tab)

## [3.8.2] - 2026-06-10

### Added
- `StorageService.getLocalAdapterForOrg(orgId)` — always returns the org's LOCAL adapter
- Large-file streaming upload — `/media/upload-server` limit configurable via `MEDIA_UPLOAD_MAX_BYTES` (default 1 GB)
- CI guard for removed legacy storage env vars (`CLOUDFLARE_*`, `STORAGE_PROVIDER`) and deleted module imports

### Changed
- **Avatars (C1, C2)** — `IntegrationRepository.updateIntegration` and `IntegrationService.createOrUpdateIntegration` now upload avatars through `StorageService.getLocalAdapterForOrg(orgId)` (LOCAL storage). The `CLOUDFLARE_BUCKET_URL` dedup guard and `imagedelivery.net` passthrough are removed.
- **Media writes (C3, C4, C10)** — `MediaService.generateVideo`, `PostsService.updateMedia`, and `MediaController` endpoints (`/upload-server`, `/upload-simple`, `/generate-image-with-prompt`, `/save-media`) use `StorageService.getLocalAdapterForOrg(orgId)`.
- **AI/agent writes (C5, C6, C7, C8)** — `AgentGraphService.uploadPictures`, `ImagesSlides.process`, `UploadFromUrlTool`, and `GenerateImageTool` use `StorageService.getLocalAdapterForOrg(orgId)`.
- **Public API uploads (C9)** — `PublicIntegrationsController` upload endpoints use `StorageService.getLocalAdapterForOrg(orgId)`.
- **Third-party controller** — uploads use `StorageService.getLocalAdapterForOrg(orgId)`.
- `VideoAbstract.process()` now accepts an optional `orgId` parameter; `Veo3` and `ImagesSlides` updated.
- `updateMedia(id, imagesList, convertToJPEG, orgId?)` now accepts an optional `orgId` — threaded from all 4 callers (2 in `posts.service.ts`, 2 in orchestrator `post.activity.ts`).
- Frontend: `/uploads` redirect/rewrite in `next.config.js` is unconditional (no longer gated on `STORAGE_PROVIDER === 'local'`). The media uploader always uses the XHR (local) plugin.
- Frontend layouts: all three layouts hard-pin `storageProvider` to `'local'` and drop `cloudflareUrl`.

### Removed
- `UploadFactory`, `cloudflare.storage.ts`, `r2.uploader.ts` — deleted
- `UploadModule` — `UploadFactory` removed from providers/exports
- `MediaController`: multipart-upload catch-all `@Post('/:endpoint')` and `handleR2Upload` import deleted; `MultipartUploadService` DI removed
- `uppy.upload.ts`: `'cloudflare'` case deleted (always uses `XHRUpload`)
- Env vars: `STORAGE_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_KEY`, `CLOUDFLARE_SECRET_ACCESS_KEY`, `CLOUDFLARE_BUCKETNAME`, `CLOUDFLARE_BUCKET_URL`, `CLOUDFLARE_REGION` — removed from `.env.example`, `.env.coolify`, and `docker-compose.yaml`
- Frontend: `cloudflareUrl` removed from `VariableContextInterface`; `storageProvider` hard-pinned to `'local'`
- All `UploadFactory.createStorage()` field initializers across 9 consumer files replaced with DI of `StorageService`
- Config `StorageService` is the only write path for avatars and app-internal images; cloud providers (S3/R2/B2/iDriveE2) remain configurable per-tenant in Settings → Storage
- No backwards compatibility for old env vars — fresh deployers need only `UPLOAD_DIRECTORY` + `FRONTEND_URL`

## [3.8.1] - 2026-06-10

### Added
- Pluggable email provider system — 6 adapters (Resend, SendGrid, Mailgun, Postmark, Amazon SES, SMTP) selected globally by `EMAIL_PROVIDER`
- Standardized env scheme: `EMAIL_API_KEY` + provider-specific vars (`EMAIL_SMTP_*`, `EMAIL_MAILGUN_DOMAIN`, `EMAIL_SES_*`) — all documented in `.env.example`
- Delivery-lifecycle email log (`EmailLog` Prisma model) — metadata only, no HTML body. Status advances through `queued` → `sent` → `delivered`/`bounced`/`complained`/`opened`/`clicked` via webhooks
- `POST /webhooks/email` endpoint — signature-verified, CSRF-exempt. SES handles SNS `SubscriptionConfirmation`
- Best-effort email log retention prune in the daily analytics sweep (`EMAIL_LOG_RETENTION_DAYS`, default 90)
- CI guard (security-audit.yml) — fails if removed legacy vars (`RESEND_API_KEY`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`) are reintroduced

### Changed
- `EmailService` rewritten to use `EmailAdapterRegistry` + `EmailLogService` — same public API, no consumer signature changes
- Adapters construct SDK clients lazily inside methods (not at module load) — unit-testable, no boot crashes when unconfigured
- `EmailAdapterRegistry` + `EmailLogRepository`/`EmailLogService` wired into `DatabaseModule`
- `.env.example` and `docker-compose.yaml` updated with the new standardized email env scheme
- Docs updated: configuration, architecture, data-model, temporal-and-cron, changes-from-upstream

### Removed
- Old env vars: `RESEND_API_KEY`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`
- Old provider classes: `email.interface.ts`, `resend.provider.ts`, `node.mailer.provider.ts`, `empty.provider.ts`

## [3.8.0] - 2026-06-10

### Added
- Tenant-configurable short-link provider system — 19 providers (Bitly, TinyURL, T.LY, Short.io, Rebrandly, Dub.co, Cutt.ly, Tiny.cc, is.gd, v.gd, BL.INK, T2M, Linkly, Replug, Switchy, PixelMe, Sniply, Ow.ly, CleanURI)
- Per-org short-link provider configuration in Settings → Shortlinks with searchable dropdown, credential management, and test connection
- `OrgShortLinkConfig`, `ShortLink`, `ShortLinkSnapshot` Prisma models for provider config, link ledger, and daily click snapshots
- Daily short-link click analytics collection via Temporal sweep (best-effort, never crashes)
- Analytics v2 endpoints: `GET /analytics/v2/shortlinks` and `GET /analytics/v2/shortlinks/timeseries`
- New analytics dashboard **Links** tab showing top links and click timeseries
- `ShortLinkService` rewrite: per-call per-org provider resolution, ledger recording, non-fatal Empty behavior when no provider is active
- `safeFetch` used for all short-link provider HTTP calls (SSRF safety)
- Credentials encrypted at rest via `EncryptionService` (AES-GCM)

### Changed
- Short-link provider config moved from env vars (`DUB_TOKEN`, `SHORT_IO_SECRET_KEY`, `KUTT_API_KEY`, `LINK_DRIP_API_KEY`) to per-org DB-backed, admin-configured settings
- `ShortLinkService` is now a proper `@Injectable` with constructor DI — no static module-level provider
- `orgId` threaded through all `ShortLinkService` methods; `getStatistics` and `askShortLinkedin` signatures updated
- `/should-shortlink` endpoint now resolves org server-side (frontend unchanged)

### Removed
- Old env-based short-link providers: Dub, Short.io, Kutt, LinkDrip, Empty (all `short-linking/providers/*.ts`)
- Legacy `short-linking.interface.ts` replaced by `short-link.interface.ts`
- All 10 short-link env vars removed (no env fallback — consistent with v3.6.3/v3.7.1 AI provider pattern)
- Static `getProvider()` env-precedence function

## [3.7.1] - 2026-06-09

Removes the last remaining `process.env` credential reads from social providers, deletes the
env-migration helpers (no longer needed since all credentials are DB-backed), and prunes the
configuration surface (`.env.example`, `docker-compose.yaml`, docs). The env var fallback for
channel and AI credentials is now **gone** — every provider reads from the database, encrypted
at rest.

### Removed — Env var fallbacks from 3 providers

- **YouTube** (`youtube.provider.ts:35-37`) — removed `process.env.YOUTUBE_CLIENT_ID` /
  `process.env.YOUTUBE_CLIENT_SECRET` fallback from `clientAndYoutube`. All callers pass
  `clientInformation?.client_id` / `clientInformation?.client_secret` already.
- **GMB** (`gmb.provider.ts:25-28`) — removed `process.env.GOOGLE_GMB_CLIENT_ID` /
  `process.env.GOOGLE_GMB_CLIENT_SECRET` (and the secondary `YOUTUBE_*` fallback chain) from
  `clientAndGmb`.
- **Telegram** (`telegram.provider.ts:91,187,439`) — removed 3 remaining `process.env.TELEGRAM_TOKEN`
  fallbacks from `getBotId`, `sendMessage`, and `botIsAdmin`. All paths now rely on
  `getOrgCredential(orgId, 'telegram', 'clientId')` or the explicitly-passed `botToken`.

### Removed — Migration services

- **`ChannelEnvMigrationService`** — the `OnModuleInit` service that seeded `OrgProviderConfiguration`
  rows from per-provider env vars (24 providers) on first boot after upgrade. Credentials are now
  DB-only, so the migration path is history.
- **`AiEnvMigrationService`** — the equivalent service that seeded `AIOrgProviderConfig` rows from
  `OPENAI_API_KEY`. Removed for the same reason.
- **Registrations** — both services removed from `app.module.ts` imports and providers array.

### Removed — `getEnvOr()` function

- **`credentials.ts`** — the `getEnvOr(envKey, ...)` function (deprecated since v3.6.0) is deleted.
  All credential reads must go through `getOrgCredential(orgId, identifier, key)` or via
  `clientInformation` passed from `OrgProviderConfiguration`.

### Changed — Configuration surface

- **`.env.example`** — all per-tenant channel/AI provider keys removed. Kept: infra vars, login-SSO
  (GITHUB_* for GitHub OAuth), storage Cloudflare, email, Stripe, OIDC SSO, short-link services, and
  misc/developer vars. Added header noting channel/AI config is now in-app.
- **`docker-compose.yaml`** — all per-tenant channel/AI env vars removed (was ~30 vars), plus dead
  `NEXT_PUBLIC_UPLOAD_DIRECTORY` and `STRIPE_SIGNING_KEY_CONNECT` / `FEE_AMOUNT` / `NX_ADD_PLUGINS`.
  Kept: infra vars, SSO, storage, Stripe, misc. Container still boots correctly.

### Changed — Docs

- **`configuration.md`**, **`env-vars.md`** — social-provider and AI sections updated to v3.7.1:
  removed env var lists, noted DB-only encrypted credentials.
- **`channels.md`** — "Credential Resolution & Fallback" section rewritten: no more env var fallback
  description. Migration script section removed (script no longer exists).
- **`setup-per-provider.md`** — GMB fallback note removed from Google family table; env var removal
  version updated from v3.6.0 to v3.7.1.
- **`AGENTS.md`** — added "Channel credentials" architecture note: DB-only, encrypted, no env fallback,
  no `getEnvOr`/`ChannelEnvMigrationService`.
- **`CHANGES_FROM_UPSTREAM.md`** — added v3.7.1 section covering the env-var removal.
- **`CHANGELOG.md`** — this section.

### Added — CI guard

- **`security-audit.yml`** — added a check step that greps for `getEnvOr(` calls and any
  `process.env.<CHANNEL_VAR>` reads in `libraries/nestjs-libraries/src/integrations/social/`,
  failing the workflow if any are found.

## [3.7.0] - 2026-06-09

Brand cutover: the fork is renamed **Postiz → Postmill**. This release rebrands every
user-facing surface and most internal identifiers, publishes a renamed SDK, and carries
several **breaking** infrastructure renames (env vars, Docker stack, chat-agent id) for
self-hosters. No application schema changes. Website/domain URLs (`*.postiz.com`) are
intentionally left in place until the new site/domain is live.

### Changed — Branding

- **Product name** — `Postiz` → `Postmill` across all UI copy, page `<title>` metadata,
  email/notification text, the OpenAPI title, and every translation locale JSON.
- **Display toggle collapsed** — the `isGeneralServerSide()` / `isGeneral` "Postiz vs Gitroom"
  title/label toggles now always render **Postmill**; the now-unused helper imports were removed.
- **Brand color** — primary `#612bd3` → `#2b5cd3` (CSS vars, chart palettes, logos). The MCP
  creation badge and media "video" operation chip were given distinct non-colliding colors.
- **Logos/assets** — Postiz logo assets replaced with Postmill; design sources (`*.psd`) and
  font archives (`*.zip`) are now gitignored out of the web-served `public/` directory.
- **Browser extension** — manifest name/description rebranded to Postmill.

### Changed — Packages & SDK

- **Workspace package names** — root `gitroom` → `postmill`; `postiz-*` app packages →
  `postmill-*`. (Internal only; scripts target apps by path, so no functional impact.)
- **Node SDK** — renamed `@postiz/node` → **`@reaatech/postmill-sdk`** (published to npm at
  `0.1.0`) and its install/import docs updated. The SDK's `publish` script was renamed to
  `release` (+ added `release:dry` / `build`) to avoid recursing through npm's `publish`
  lifecycle hook.

### Changed — Configuration (BREAKING)

- **Env vars** — all `POSTIZ_*` variables hard-renamed to `POSTMILL_*`
  (`POSTMILL_GENERIC_OAUTH`, `POSTMILL_OAUTH_*`, `POSTMILL_API_KEY`, `POSTMILL_CONTAINER`),
  including the `NEXT_PUBLIC_POSTMILL_OAUTH_*` build-time vars. **The old names are no longer
  read** — existing deployments must rename their env vars. Updated in `.env.example` and the
  self-hosting/reference docs.

### Changed — Self-hosting / Docker (BREAKING)

- **Image** — published image is now `ghcr.io/reaatech/postmill-app`; the bundled
  `docker-compose.yaml` and CI build target updated to match.
- **Compose identifiers** — services, container names, network, volumes, and the Postgres
  role/database renamed `postiz-*` → `postmill-*`. The Postgres **data** volume
  (`postgres-volume`) is unchanged, so data persists. Existing installs must migrate their
  uploads/config volumes and rename the Postgres role/db (or keep the old names) — see the new
  **"Migrating from a Postiz-branded deployment"** section in `docs/self-hosting/upgrading.md`.
- **Helper script** — `scripts/postiz-migrate.sh` → `scripts/postmill-migrate.sh`.
- The throwaway `docker-compose.dev.yaml` stack and local image build tags were fully rebranded.

### Changed — Internal identifiers (BREAKING for chat memory)

- **Mastra chat agent** — agent id/name `postiz` → `postmill` and memory store
  `postiz-store` → `postmill-store`, wired through the chat/copilot/MCP surfaces. **Persisted
  chat memory keyed under the old id is orphaned** (effectively a one-time reset).
- **MCP server** — server display name and the in-app setup snippets (Claude/Cursor/VS Code/
  Windsurf/Amp/Codex/Gemini/Warp) now use `postmill`.
- **Observability** — OpenTelemetry tracer/logger `postiz-ai` → `postmill-ai`; C2PA media
  provenance claim generator `postiz/ai-media` → `postmill/ai-media`.

### Changed — Legal / governance

- Product name rebranded to Postmill in `LICENSE`, `CONTRIBUTING.md`, `CCLA.md`, `ICLA.md`,
  and `SECURITY.md`, preserving original copyright (Nevo David), AGPL text, and CLA links.
- `SECURITY.md` scope and reporting target retargeted to the fork (repo
  `reaatech/postmill-app`, `@reaatech` npm, `reaatech` GHCR org).

### Not yet changed (intentional)

- **Website/domain URLs** (`postiz.com`, `docs/discord/api/platform.postiz.com`, the Plausible
  `data-domain`, the domain toggle, upstream `gitroomhq/postiz-app` references) — pending the
  new site/domain going live.
- **CLI install snippets** (`npm install -g postiz`) — pending the CLI being published under the
  new name.
- **Translation keys** (e.g. `faq_can_i_trust_postiz`) — internal identifiers, never displayed.
- **`@gitroom/*` TypeScript path aliases** — internal-only; a separate effort from this rename.
- `SECURITY.md` urgent-contact email and the CCLA/ICLA contribution-assignment entity still
  point upstream — left for a deliberate legal decision.

## [3.6.0] - 2026-06-08

A major user-facing release: a proper user profile page, per-tenant storage/adapter system,
per-tenant OAuth and AI provider credentials, a rebuilt media manager, and full-suite datatable
rebuilds. The admin section moves into tenant settings; admin-only pages are removed and most global
env vars are deprecated (kept as fallback; new per-tenant DB config takes precedence). Schema
migration is additive (nullable columns, new models).

### Added — User profile & settings

- **User profile page** (`/settings/profile`) — three tabs: **Profile** (avatar, name, bio), **Security**
  (password change), and **Notifications** (email preferences).
- **Settings reorganization** — the settings sidebar now follows the tab order: Settings, Profile, Teams,
  Channels, AI, Brand, Media, Storage, Webhooks, Auto Post, Sets, Signatures, Developers, Approved
  Apps. The old admin-level pages are gone — every setting is now tenant-scoped.

### Added — Datatable rebuilds

- **Teams** — full datatable rebuild with search, sort, pagination, an inline invite flow, and inline
  create-user. No more bare list.
- **Webhooks** — rebuilt datatable with an educational header (explains what webhooks are), test ping
  button, event-type selection, and HMAC signing support.
- **Auto Post / Sets / Signatures** — each rebuilt as a proper datatable with educational empty states
  and guidance for first-time users.

### Added — Media manager

- **Folder tree** — browse and organize media in a hierarchical folder structure.
- **Drag-and-drop between folders** — drag file thumbnails onto folder tree items to move them.
- **Bulk actions** — select multiple files for batch operations (move, delete, tag).
- **File details panel** — view metadata, tags, description, and preview for each file.
- **Search, sort, and pagination** — find assets by name/tag, sort by date/size/name, paginate
  through results.
- **Trash & restore** — delete files with soft-delete (`Media.deletedAt` set); view them in a trash
  modal (🗑️ button in toolbar); restore to original folder or permanently delete. Restored files
  bypass permanent deletion until explicitly purged again.

### Added — Storage adapter system

- **Per-tenant storage** — each organization mounts its own storage provider: S3, R2, Backblaze B2,
  IDrive e2, or local disk.
- **Storage settings tab** (`/settings/storage`) — mount and unmount providers per tenant with a
  four-panel interface: Providers (cards showing type, mount status, usage %), Quota Status (usage
  meter with 80%+ warning), Usage Breakdown (by folder and by provider), and Audit Log (all storage
  operations with pagination).
- **`StorageProviderConfig` model** — per-tenant storage credentials stored encrypted in the database.
  `localStorageQuotaBytes` defaulted to 5 GB per organization. New fields: `lastHealthCheck` (timestamp
  of last test), `lastHealthError` (error message if failed), `defaultFolderId` (folder-level routing
  for uploads).
- **Storage health tracking** — the UI shows green/amber/red badges (Last checked: <time>) and all
  health checks are timestamped for audit purposes. `GET /settings/storage/audit-log` lists all
  storage mutations (create, update, delete, mount, unmount, health-check, migrate, set-default-folder).
- **Quota status API** — `GET /settings/storage/quota-status` returns used bytes, quota bytes, percentage,
  and warning flag (true when ≥80% used). The UI shows an amber warning banner when approaching limit.
- **Usage breakdown API** — `GET /settings/storage/usage-breakdown` returns storage by folder and by
  provider (bytes), powering the breakdown tab with pie charts or tables.
- **Folder-aware upload routing** — files uploaded to a folder use that folder's assigned provider
  if set, otherwise fall back to a mounted provider. `POST /settings/storage/:id/set-default-folder`
  configures the mapping per provider, stored in `StorageProviderConfig.defaultFolderId`.

### Added — Per-tenant provider credentials

- **Channel provider OAuth** — each org can now use their own OAuth app credentials (client ID/secret)
  for channel providers. Configured in the **Channels** settings tab (`/settings/channels`). Eliminates
  the need for global env vars like `LINKEDIN_CLIENT_ID`, `FACEBOOK_APP_ID`, etc.
- **AI provider config** — each org configures their own AI provider, model, and API keys in the **AI**
  settings tab (`/settings/ai`). Org-level active provider takes precedence. `OPENAI_API_KEY` is
  **deprecated** for model resolution (no longer read by `AIModelProvider`; deprecation warning
  logged at boot if set).
- **Brand voice + RAG knowledge base** — **Brand** settings tab (`/settings/brand`) with brand voice
  profiles and a RAG knowledge base UI for uploading and indexing org content by text, URL, or
  file upload (`.txt`, `.pdf`, `.md`, `.csv`).
- **Media provider settings** — **Media** settings tab (`/settings/media`) for configuring per-tenant
  media pipeline providers (image, video, TTS, STT, etc.).

### Fixed — Comments inbox

- Proper error and permission states now render instead of crashing or showing blank screens.
- A **`RUN_CRON` banner** informs users when background comment sync is not active.

### Fixed — Analytics v2

- **Dark mode fix** — Chart.js now reads CSS custom properties (`--chart-*`) properly in dark mode,
  so charts are visible on dark backgrounds.
- **Performance** — skeleton loaders replace the full-page spinner; charts and stats load progressively.

### Added — Post-audit UX enhancements

- **Channel health dashboard** — the Channels tab now shows a Connection Status panel with
  color-coded badges for each provider (connected, token expiring, expired, or error) and a
  "Reconnect" link. Backed by `GET /channels/health`.
- **Storage migration** — migrate files between storage providers (e.g., local → S3) from the
  Storage tab with a progress bar and per-file error reporting. `POST /settings/storage/:id/migrate/:targetId`.
- **Session management** — the Profile Security tab shows your current device, last login timestamp,
  and a "Log out all sessions" button.
- **Onboarding checklist** — new users see a 4-step setup overlay (connect channel, configure AI,
  create post, invite team) with auto-detected progress.
- **Env migration helpers** — on first boot after upgrade, `OPENAI_API_KEY` and all 24 channel OAuth
  env vars are automatically seeded into the database as per-org configs. No silent breakage on upgrade.

### Fixed — Calendar

- Card stats footer now reliably displays for all published posts (views/likes/comments).
- Comment badge on calendar cards shows correct unread count.

### Changed — Campaigns

- Educational header added with campaign management guidance.
- Stats summary row shows aggregate metrics across all campaigns.
- Archive/unarchive toggle on each campaign card.
- Engagement data panel (total views, likes, comments) and top-performing post displayed
  per campaign.

### Changed — Admin pages removed

- All admin-only routes and pages (`/admin/channels`, `/admin/ai`, `/admin/dashboard`, etc.) are
  deleted. Their functionality has moved to the per-tenant settings tabs. The settings sidebar now
  serves both regular users and super-admins equally.

### Schema changes

- **New models:** `MediaFolder`, `StorageProviderConfig`, `OrgProviderConfiguration`.
- **Media additions:** `Media.folderId` (nullable FK), `Media.tags` (JSON), `Media.description` (text).
- **Organization addition:** `Organization.localStorageQuotaBytes` (default `5368709120` = 5 GB).
- **AI addition:** `AIOrgProviderConfig.isActive` (boolean, default `false`).
- **Deprecated models:** `ProviderConfiguration`, `AIProviderConfig`, `AISystemSettings` — kept for
  backward compatibility during migration; new code uses `OrgProviderConfiguration`.

### Deprecated env vars (kept as fallback; deprecation warning logged at boot)

- **Storage:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_KEY`, `CLOUDFLARE_SECRET_ACCESS_KEY`,
  `CLOUDFLARE_BUCKETNAME`, `CLOUDFLARE_BUCKET_URL`, `CLOUDFLARE_REGION`, `STORAGE_PROVIDER`.
- **Channel OAuth:** All per-provider OAuth env vars (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
  `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `X_API_KEY`, `X_API_SECRET`, `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`, `PINTEREST_CLIENT_ID`,
  `PINTEREST_CLIENT_SECRET`, `DRIBBBLE_CLIENT_ID`, `DRIBBBLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `SLACK_ID`, `SLACK_SECRET`, `MASTODON_CLIENT_ID`,
  `MASTODON_CLIENT_SECRET`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `KICK_CLIENT_ID`,
  `KICK_SECRET`, `TUMBLR_CLIENT_ID`, `TUMBLR_CLIENT_SECRET`, `THREADS_APP_ID`,
  `THREADS_APP_SECRET`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `YOUTUBE_CLIENT_ID`,
  `YOUTUBE_CLIENT_SECRET`, `GOOGLE_GMB_CLIENT_ID`, `GOOGLE_GMB_CLIENT_SECRET`, `REDDIT_CLIENT_ID`,
  `REDDIT_CLIENT_SECRET`, `NEYNAR_CLIENT_ID`, `NEYNAR_SECRET_KEY`, `TELEGRAM_TOKEN`, and others).
  These are still read by ~185 `getEnvOr()` calls in provider implementations and remain
  functional. Migrate to in-app per-tenant credentials incrementally.
- **AI:** `OPENAI_API_KEY` — deprecation warning logged at boot; no longer used for model resolution.

## [3.5.10] - 2026-06-08

A stabilization release: it gets v3.5.9 **actually booting** and closes a batch of UI/API bugs found
by a comprehensive end-to-end (Playwright) audit of the real interface. v3.5.9 shipped without ever
booting — six chained boot blockers (a drifted lockfile plus DI/route/workflow regressions from the
dependency major-bumps in `7c5a34e`) returned 502 on every `/api/*`. All are fixed; the remainder are
functional bugs and completeness gaps surfaced by driving the UI. No schema changes.

### Fixed — boot blockers (production was down on v3.5.9)

- **#1** — Regenerate `pnpm-lock.yaml` so `node-telegram-bot-api` resolves to `0.66.x` (the CommonJS API the code targets) instead of the ESM-only `1.0.0-rc.0` the drifted lockfile pinned, which crashed the backend with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `package.json` reverted to `^0.66.0`. Also: use `reply_to_message_id` (Bot API <7) instead of `reply_parameters` in `telegram.provider.ts`, and add a pnpm override bumping the deprecated `request` chain's `form-data` to the patched `2.5.x` (closes a critical CVE, GHSA-fjxv-7rqg-78g4).
- **#2** — `ProviderHealthService`: make `_defaultThreshold` a plain field, not a primitive constructor param (Nest tried to DI-resolve it → boot crash).
- **#3** — Register `IdempotencyFactory` in `AiModule` so `startMcp` can resolve it (unregistered → `UnknownElementException` → process exit).
- **#4** — Migrate bare `*` middleware routes to `{/*splat}` for path-to-regexp v8 (Express 5 / Nest 11).
- **#5** — Orchestrator imports `AiModule` + `ThrottlerModule` so `PostsService`'s `RagService` dependency resolves (it is a separate Nest app).
- **#6** — Temporal workflows use replay-safe `uuid4()` instead of `makeId()` (which imports `crypto`, banned in the workflow sandbox).

### Fixed — API & validation

- **#7** — Composer can save/schedule/publish again: `POST /posts/valid` and `/posts/preflight` now bind a lenient `ValidatePostsDto` (only `posts` required; per-post `settings` pass-through) instead of the strict `CreatePostDto`, which 400'd on the composer's partial pre-check body. Real `POST /posts` still uses the strict DTO.
- **#8** — Calendar renders posts again: add `display` to `GetPostsDto` (the global `forbidNonWhitelisted` pipe rejected `GET /posts?display=…` → empty calendar).
- **#17** — `/analytics/v2` no longer crashes: `LineChart`'s Chart.js config omitted the `type` field, so Chart.js got `type: undefined` and threw `"undefined" is not a registered controller`, tripping the whole dashboard's error boundary ("Something went wrong"). Add `type: 'line'`. (TypeScript missed it — `datasets` was cast to `any[]`.)
- **#9** — CopilotKit no longer 403s on every authenticated page: the `<CopilotKit>` runtime now forwards the `csrf_token` cookie as the `x-csrf-token` header (cookie-auth POSTs require CSRF; the runtime wasn't sending it).
- **#10** — `GET /integrations/telegram/updates` no longer 500s when Telegram isn't configured (no `TELEGRAM_TOKEN`): the channel-connect poll wraps `getUpdates()` and returns empty on any error instead of spamming 500s.
- **#11** — `GET /user/agent-media-sso` degrades to `{ url: null }` (200) when unconfigured instead of throwing 400.
- **#20** — **Opening the Billing page logged you out of the entire app.** Root cause (verified by hitting the endpoint): on instances without Stripe, `StripeService` is constructed with the placeholder key `sk_nothing`, so `getPackages()` → `stripe.prices.list()` returns **`401 "Invalid API Key"`**. The frontend force-logs-out on *any* `401` (`layout.context.tsx` → `/auth/logout`), so loading Billing's pricing call silently destroyed the session — which is why every admin page and Settings then rendered as the login screen. **Fix:** `getPackages()` returns empty tiers (and never lets a Stripe error become a 401) when Stripe isn't configured. (Also removed a stray `ADMIN`-policy gate on the tiers route so pricing is readable by any authenticated user — cosmetic; it was not the cause.)

### Added

- **#14 — Team management completeness.** Change a member's role (`PUT /settings/team/:id/role`, level-guarded) from an inline selector, and click a member to view their profile. Previously the Teams screen only listed and removed members.
- **#18 — Admin error actions.** **Retry** a failed post (`POST /admin/errors/:id/retry` — re-queues it into the publish workflow via `changePostStatus`) and **Resolve**/dismiss an error (`DELETE /admin/errors/:id`) directly from `/admin/errors`.
- **CI boot guard** (`.github/workflows/boot-guard.yml`) — fails on lockfile drift (`--frozen-lockfile`) and boots the backend against ephemeral Postgres + Redis to assert it binds and answers (catches the #1–#6 class of failures that compile but crash-loop, which v3.5.9's build check missed).

### Changed

- **#12** — Global API throttle default raised `90 → 600` requests/hour (`API_LIMIT`). The SPA issues 15–30 calls per page navigation, so a 90/hr limit tripped during normal interactive use and rendered pages blank on 429. Sensitive routes keep their own tight per-minute limits.
- **#19 / #18 (a11y)** — Settings tabs and the admin channel-config row are now semantic, keyboard-focusable `<button>`s (were `<div onClick>` with no role); the channel row shows an explicit Edit/Close affordance.

### Docs

- `API_LIMIT` default corrected to `600` across the env-vars, configuration, and public-API reference pages.
- Documented the new admin **Retry/Resolve** error actions.

## [3.5.9] - 2026-06-08

A bugfix and UI-completeness release following a comprehensive codebase audit. Fixes 4 critical
cross-org security vulnerabilities, 5 runtime bugs, re-wires 6 disconnected UI surfaces, and adds
type safety and validation hardening across 56 code items. No schema changes — all fixes are
code-only.

### Security

- **1.0.0** — Add `organizationId` filter to Campaigns repository `update()` and `softDelete()` WHERE clauses, preventing cross-org data manipulation.
- **1.0.1** — Add `organizationId` filter to Watchlist repository `update()`, `softDelete()`, `setLastError()`, and `disableWithError()` WHERE clauses.
- **1.0.2** — Add `@CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])` to `POST /posts/bulk`, closing a quota-bypass vulnerability.
- **1.0.3** — Add `organizationId` filter to `bulkMarkRead()` in SocialComments repository, preventing cross-org comment access.
- **1.0.4** — Add org-ownership validation to `assignComment()` — verifies the post belongs to the requesting user's org before reassigning.
- **1.0.5** — Add `@CheckPolicies` to all five Campaigns controller endpoints (GET, POST, PUT, DELETE) and add `@GetOrgFromRequest()` to PUT/DELETE.
- **1.0.6** — Make `orgId` mandatory (no optional fallback) on `getPost()`, `getPostById()`, and `getPostsByGroup()` in Posts repository.
- **2.2.2** — Add `deletedAt: null` soft-delete filter to `getComments()` in Posts repository.

### Fixed

- **2B.1** — Fix comment inbox route conflict: move `SocialCommentsController` before `PostsController` in `api.module.ts` so `GET /posts/inbox` resolves to the inbox endpoint instead of failing as a UUID parse error on `GET /posts/:id`.
- **2B.2** — Calendar card stats footer now renders for all `PUBLISHED` posts regardless of whether analytics have run (individual stats gated on non-null values).
- **2B.3** — AI controller DI hardened: `api.module.ts` controller ordering + AI module init wrapped in try/catch.
- **2B.4** — Fix `timezones-list` import crash in `metric.component.tsx`: added `Intl.supportedValuesOf('timeZone')` fallback when the external package is unavailable.
- **2B.5** — Replace raw `dayjs` imports with `newDayjs` (timezone-aware wrapper) in calendar grid component for correct timezone display.
- **2.1.0** — Fix Helmet middleware condition: `||` → `&&` so `NOT_SECURED` correctly disables Helmet in production when set.
- **2.1.1** — Clarify CopilotKit budget check condition with explicit `inDevMode` variable.
- **2.1.2** — Fix 4 event listener memory leaks: `icons/index.tsx` (use `off` instead of `removeAllListeners`), `html.component.tsx` (add cleanup), `support.tsx` (match event name in cleanup), `new-modal.tsx` (add named handler cleanup).
- **2.2.1** — Replace per-integration `update()` loop in `disableIntegrations()` with a single `updateMany()` call.
- **2.2.3** — Add `id` tiebreaker to `getBestTimePosts()` pagination ordering (`[{ publishDate: 'desc' }, { id: 'desc' }]`).
- **2.2.4** — Wrap `useCredit()` operation in `$transaction()` to prevent concurrent-update race conditions.
- **2.3.0** — De-scope image moderation to text-only: remove `checkImage`/`imageUrl` parameters from AI moderation endpoint. Image moderation requires a configured vision provider (deferred feature).
- **2.4.0** — Add `campaignId?: string` field to `CreatePostDto`.
- **2.4.1** — Thread `campaignId` through `createPost()` and `bulkCreate()` to the repository's `createOrUpdatePost()`.
- **2.4.2** — Confirm `BestTimeEntry` interface is exported from `analytics.service.ts` (single source of truth).
- **2.4.3** — Replace `any` type annotations with `Integration` type in social comments service.
- **2.4.4** — Introduce `CommentStatus` const enum (`needs_reply`, `handled`, `ignored`) in social comments service, replacing hardcoded string arrays.
- **2.4.5** — Add null guard on comment status validation: `if (!status || !VALID_COMMENT_STATUSES.includes(status))`.
- **2.4.6** — Verify pricing tier types are consistent (no string-vs-number mismatches found).
- **2.5.0** — Add cursor date validation in `getInbox()` — throws `BadRequestException` on malformed ISO strings.
- **2.5.1** — Add array size limit (max 1000) to `bulkMarkRead` comment IDs.
- **2.5.2** — Create `AddWatchlistDto` with `@IsEnum` and `@MinLength(1)`/`@MaxLength(100)` validation on handle.
- **2.5.3** — Add `@IsIn` enum validation for comment status at controller level.
- **2.5.4** — Add `endDate > startDate` cross-field validation in Campaigns controller create/update.
- **2.5.5** — Wrap `response.text()` in try-catch within `probeAndRecord()` to prevent unhandled promise rejections.
- **2.5.6** — Add null check on `result.comments` in comment sync loop: `const comments = result.comments ?? []`.
- **2.5.8** — Add `{ integrationId, providerId }` context to analytics activity error log messages.
- **2.5.9** — Add status whitelist validation and assigneeId ownership check to inbox query parameters.
- **2.3.2** — Add proper try/catch with `BudgetExceeded`/`GuardrailViolation` re-throw pattern for TTS generation.
- **7A** — Add `@Throttle({ default: { limit: 30, ttl: 60000 } })` to 11 AI user endpoints (usage, brand-profile, prompt-templates, media, search, repurpose, translate, variants).

### UI / Frontend

- **2A.0** — Tier-gating in sidebar navigation confirmed correct (upstream behavior); no change needed.
- **3.0** — Uncomment `<SetTimezone />` in app layout.
- **3.1** — Uncomment `<BillingAddressElement />` in Stripe checkout.
- **3.2** — Uncomment `<NotificationComponent />` in billing page.
- **3.3** — Remove dead `CheckTikTokValidity` reference from TikTok provider (component does not exist).
- **3.4** — Uncomment FAQ section heading.
- **4A** — Add "Administration" collapsible section with links to AI Settings, Channels, Errors, and Stats in the sidebar for super-admins.
- **4B/6.0** — Create `ProfileComponent` with full name, bio, and picture fields; wire into GlobalSettings tab with form props. Add user avatar dropdown menu to the top navigation bar with Settings link and Logout button.
- **4D** — Create admin dashboard page at `/admin/dashboard` with links to all four admin sections.
- **4F** — Add a read-only "Media Providers" section to the Brand & AI settings tab, surfacing which media operations (image, video, TTS, STT, upscale, background removal, inpainting) are configured and active, backed by a new credential-free `GET /ai/media-providers` endpoint.
- **7B** — Add "Summarize" button to comment composer that calls the AI comment-reply endpoint with `action: 'summary'`.

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
- **Analytics: Competitor/watchlist tracking (3N)** — New `WatchedAccount`/`WatchedAccountMetric` models, watchlist service/repo, and analytics tab. Lightweight public-metric probes ride the existing collection sweep, are capability-gated, and gracefully auto-disable (logging `lastError`) on probe failure rather than crashing the sweep.
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
- **Social comments foundation (Track B)** — `ISocialMediaComments` provider capability interface, `SocialComment` and `PostCommentRead` Prisma models, social comments Controller/Service/Repository, and background `CommentsActivity` + `commentsCollectionWorkflow` (gated by background jobs configured, 30-min sweep cadence, configurable retention).

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
- Daily collection via background workflow (jobs-gated)
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



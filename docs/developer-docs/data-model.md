# Data Model

71 Prisma models in a single schema at `libraries/nestjs-libraries/src/database/prisma/schema.prisma`.
This page lists every model grouped by domain with a one-line purpose and key relationships.

---

## Core Identity (11)

| Model | Purpose | Key Relationships |
|---|---|---|
| `Organization` | Tenant — every resource belongs to an org | FK to `Subscription`; has many `Integration`, `UserOrganization`, `Post`, `Campaign` |
| `User` | Individual user account (email + provider login) | FK to `Media` (picture); has many `UserOrganization` |
| `UserOrganization` | Many-to-many join between users and orgs, with role | FK → `Organization`, `User` |
| `Tags` | Per-org color-coded tags for posts | FK → `Organization`; has many `TagsPosts` |
| `TagsPosts` | Many-to-many join between posts and tags | FK → `Post`, `Tags` |
| `Sets` | Named content blocks (reusable text/JSON) | FK → `Organization` |
| `Signatures` | Per-org post signatures with auto-add flag | FK → `Organization` |
| `Notifications` | Per-org notification feed entries | FK → `Organization` |
| `Errors` | Post-publish errors with platform and message | FK → `Organization`, `Post` |
| `ThirdParty` | Per-org third-party API keys (n8n, Zapier, etc.) | FK → `Organization` |
| `Announcement` | System-wide announcements (info/warning/error) | Standalone |

---

## Media (4)

| Model | Purpose | Key Relationships |
|---|---|---|
| `Media` | Uploaded media files (image/video), with path, type, thumbnail, tags | FK → `Organization`, `MediaFolder` |
| `MediaFolder` | Folder tree for organizing media, supports cloud-store mounting | FK → `Organization`, parent `MediaFolder`, `StorageProviderConfig` |
| `StorageProviderConfig` | Per-org cloud storage config (S3, R2, B2, IDrive E2, LOCAL) | FK → `Organization`; has many `MediaFolder` |
| `MultipartUpload` | Tracks ownership and state of multipart S3 uploads | FK → `Organization` |

---

## Channel Integrations (6)

| Model | Purpose | Key Relationships |
|---|---|---|
| `Integration` | Connected social/chat channel with encrypted OAuth tokens | FK → `Organization`, `Customer`; has many `Post`, `Plugs`, `AnalyticsSnapshot` |
| `Plugs` | Installed plug functions (analytics, comments, etc.) per integration | FK → `Organization`, `Integration` |
| `ExisingPlugData` | Cached plug data (e.g., page lists, group lists) | FK → `Integration` |
| `IntegrationsWebhooks` | Many-to-many join between integrations and webhooks | FK → `Integration`, `Webhooks` |
| `Webhooks` | Per-org webhook URLs (outbound notifications) | FK → `Organization` |
| `AutoPost` | RSS/feed-based auto-posting configuration | FK → `Organization` |

---

## Provider Configuration (2)

| Model | Purpose | Key Relationships |
|---|---|---|
| `OrgProviderConfiguration` | Per-org channel provider OAuth credentials (encrypted); replaces `ProviderConfiguration` | FK → `Organization` |
| `ProviderConfiguration` | **DEPRECATED v3.6.0** — global provider config; replaced by per-tenant `OrgProviderConfiguration` | Standalone |

---

## Posts & Content (2)

| Model | Purpose | Key Relationships |
|---|---|---|
| `Post` | Scheduled/social post — content, state (QUEUE/PUBLISHED/ERROR/DRAFT), publish date, media, settings, campaign | FK → `Organization`, `Integration`, `Campaign`; self-referential `parentPost` for threads |
| `Comments` | Internal team comments on posts | FK → `Organization`, `Post`, `User` |

---

## Analytics (4)

| Model | Purpose | Key Relationships |
|---|---|---|
| `AnalyticsSnapshot` | Daily per-integration metric snapshot (views, likes, followers, etc.) | FK → `Integration` |
| `PostAnalyticsSnapshot` | Daily per-post metric snapshot | FK → `Post`, `Integration` |
| `WatchedAccount` | Competitor/watchlist account being tracked | FK → `Organization`; has many `WatchedAccountMetric` |
| `WatchedAccountMetric` | Individual metric reading for a watched account | FK → `WatchedAccount` |

---

## Social Comments (2)

| Model | Purpose | Key Relationships |
|---|---|---|
| `SocialComment` | Synced platform comment — author, content, sentiment, status, assignment | FK → `Post`, `Integration`, `Organization`, `User` (assignee) |
| `PostCommentRead` | Per-user per-post last-read cursor for social comments | FK → `User`, `Post` |

---

## AI (10)

| Model | Purpose | Key Relationships |
|---|---|---|
| `AIOrgProviderConfig` | Per-org active AI provider + encrypted credentials + model selection | FK → `Organization` |
| `AISpendLog` | Cost ledger — input/output tokens, cost, provider, model, scope | FK → `Organization` (nullable), `User` (nullable) |
| `AIBrandProfile` | Per-org brand voice instructions + language localization | FK → `Organization` (unique) |
| `AIPromptTemplate` | Editable prompt templates (org-scoped or global, with key) | FK → `Organization` (nullable) |
| `AISettingsAudit` | Append-only audit of AI-settings changes | FK → `User` (nullable) |
| `AIMediaJob` | Media pipeline job — operation, status, artifact URL, provenance, cost | FK → `Organization`, `User` (nullable) |
| `AIPromptLibraryItem` | User-created reusable prompt library entries | FK → `Organization` |
| `AIContentIndex` | RAG index — chunk metadata + BM25 text; embeddings in side table | FK → `Organization` |
| `AIProviderConfig` | **DEPRECATED v3.6.0** — replaced by `AIOrgProviderConfig` | Standalone |
| `AISystemSettings` | **DEPRECATED v3.6.0** — active provider moved to per-tenant; kept for scope models and governance | Standalone |

---

## Campaigns (1)

| Model | Purpose | Key Relationships |
|---|---|---|
| `Campaign` | Grouping folder for posts — name, color, date range, archive state | FK → `Organization`; has many `Post` |

---

## OAuth (2)

| Model | Purpose | Key Relationships |
|---|---|---|
| `OAuthApp` | OAuth 2.0 application registration (client credentials, redirect URL) | FK → `Organization`, `Media` (picture) |
| `OAuthAuthorization` | OAuth authorization grant — PKCE, scopes, encrypted tokens, expiry, revocation | FK → `OAuthApp`, `User`, `Organization` |

---

## Billing & Marketplace (9)

| Model | Purpose | Key Relationships |
|---|---|---|
| `Subscription` | Billing subscription — tier, period, channel count, lifetime flag | FK → `Organization` (unique) |
| `Customer` | Marketplace customer name per org | FK → `Organization` |
| `Credits` | AI credit balance per org (type: `ai_images`/`ai_videos`) | FK → `Organization` |
| `UsedCodes` | Used promo/referral codes per org | FK → `Organization` |
| `Orders` | Marketplace orders (buyer ↔ seller) | FK → `User` (buyer), `User` (seller), `MessagesGroup` |
| `OrderItems` | Line items in an order (integration + quantity + price) | FK → `Orders`, `Integration` |
| `MessagesGroup` | Chat thread between buyer and seller orgs | FK → `User` (buyer), `Organization` (buyer), `User` (seller) |
| `Messages` | Individual messages in a chat thread | FK → `MessagesGroup` |
| `PayoutProblems` | Payout dispute/problem records | FK → `Orders`, `User`, `Post` (nullable) |

---

## Mastra Telemetry (8)

All 8 models have `@@ignore` or are managed by the Mastra framework. They are **not** accessed
through Prisma repositories — Mastra manages its own tables.

| Model | Purpose |
|---|---|
| `mastra_ai_spans` | AI span telemetry (ignored) |
| `mastra_evals` | Evaluation results (ignored) |
| `mastra_messages` | Agent messages |
| `mastra_resources` | Agent resources/working memory |
| `mastra_scorers` | Scoring/evaluation runs |
| `mastra_threads` | Conversation threads |
| `mastra_traces` | Trace data for observability |
| `mastra_workflow_snapshot` | Workflow state snapshots |

---

## Miscellaneous (10)

| Model | Purpose | Key Relationships |
|---|---|---|
| `GitHub` | Per-org GitHub integration (token, login, job) | FK → `Organization` |
| `Trending` | Trending topic snapshots per language | Standalone |
| `TrendingLog` | Log of trending fetches | Standalone |
| `ItemUser` | Key-value storage per user (feature flags, preferences) | FK → `User` |
| `Star` | GitHub star/fork metrics over time | Standalone |
| `SocialMediaAgency` | Agency profile listing in the marketplace | FK → `User`, `Media` (logo) |
| `SocialMediaAgencyNiche` | Agency niche tags | FK → `SocialMediaAgency` |
| `PopularPosts` | Curated popular post templates (category + topic + content + hook) | Standalone |
| `Mentions` | Cross-platform mention tracking | Standalone |
| `AuditLog` | DB-backed audit log for credential and storage mutations | FK → `Organization` |

---

## Enums

| Enum | Values |
|---|---|
| `State` | `QUEUE`, `PUBLISHED`, `ERROR`, `DRAFT` |
| `OrderStatus` | `PENDING`, `ACCEPTED`, `CANCELED`, `COMPLETED` |
| `SubscriptionTier` | `STANDARD`, `PRO`, `TEAM`, `ULTIMATE` |
| `Period` | `MONTHLY`, `YEARLY` |
| `Provider` | `LOCAL`, `GITHUB`, `GOOGLE`, `FARCASTER`, `WALLET`, `GENERIC` |
| `Role` | `SUPERADMIN`, `ADMIN`, `USER` |
| `ShortLinkPreference` | `ASK`, `YES`, `NO` |
| `CreationMethod` | `UNKNOWN`, `WEB`, `MCP`, `API`, `AUTOPOST`, `CLI` |
| `StorageProviderType` | `LOCAL`, `S3`, `CLOUDFLARE_R2`, `BACKBLAZE_B2`, `IDRIVE_E2` |
| `From` | `BUYER`, `SELLER` |

> Verified against v3.7.0

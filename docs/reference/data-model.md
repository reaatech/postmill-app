# Data Model

Key Prisma models grouped by domain. The schema is the source of truth:
`libraries/nestjs-libraries/src/database/prisma/schema.prisma`. See [Database](../developers/database.md)
for the `db push` model and schema-change rules.

> Model names below are taken from the schema.

---

## Core scheduling

| Model | Role |
|-------|------|
| `Organization` | Tenant boundary. Gains `localStorageQuotaBytes` (default 5 GB) in v3.6.0. |
| `User`, `UserOrganization` | Accounts and their org membership. |
| `Integration` | A connected channel (provider account). |
| `Post` | A scheduled/published post (with denormalized stats fields). |
| `Media` | Uploaded media. Gains `folderId` (nullable FK to `MediaFolder`), `tags` (JSON), and `description` (text) in v3.6.0. |
| `Tags`, `TagsPosts` | Tagging. |
| `Comments` | In-app post comments (distinct from synced social comments). |
| `Signatures`, `Sets`, `AutoPost`, `Plugs`, `ThirdParty` | Composition helpers and automations. |

## Provider configuration (v3.0 / deprecated in v3.6.0)

| Model | Role |
|-------|------|
| `ProviderConfiguration` | **Deprecated.** Encrypted, admin-managed channel credentials + enablement. Replaced by `OrgProviderConfiguration` (per-tenant) in v3.6.0. |

## Per-tenant provider configuration (v3.6.0)

| Model | Role |
|-------|------|
| `OrgProviderConfiguration` | Per-tenant channel/AI/storage provider credentials and settings, replacing `ProviderConfiguration`, `AIProviderConfig`, and `AISystemSettings`. |
| `StorageProviderConfig` | Per-tenant storage mount (S3, R2, B2, IDrive e2, or local disk). Encrypted credentials. |
| `MediaFolder` | Hierarchical folder tree for the media library. |

## Analytics (v3.1)

| Model | Role |
|-------|------|
| `AnalyticsSnapshot` | Daily per-channel metric snapshot (rolls up to weekly after retention window). |
| `PostAnalyticsSnapshot` | Daily per-post metric snapshot (pruned after retention window). |

See [Analytics](../features/analytics.md).

## Social comments (v3.3)

| Model | Role |
|-------|------|
| `SocialComment` | A synced platform comment on a post. |
| `PostCommentRead` | Per-user read state for synced comments. |

See [Social comments](../features/social-comments.md).

## AI system (v3.4) — deprecated/updated in v3.6.0

| Model | Role |
|-------|------|
| `AIProviderConfig` | **Deprecated in v3.6.0.** Replaced by `OrgProviderConfiguration`. |
| `AISystemSettings` | **Deprecated in v3.6.0.** Replaced by `OrgProviderConfiguration`. |
| `AISpendLog` | Recorded AI spend. |
| `AIOrgProviderConfig` | Per-org provider config. Gains `isActive` (boolean, default `false`) in v3.6.0. |
| `AIBrandProfile` | Brand voice/context for generation. |
| `AIPromptTemplate` | Saved prompt templates. |
| `AIPromptLibraryItem` | Shared prompt library entries. |
| `AISettingsAudit` | Audit trail of AI-settings changes. |
| `AIMediaJob` | Media generation jobs. |
| `AIContentIndex` | Indexed content for semantic search / RAG. |

See [AI architecture](../developers/ai-architecture.md).

`AIBrandProfile` gains a nullable `platformInstructions` (JSON, default `{}`) field in v3.5.0 for
per-platform brand-voice overrides.

## Campaigns, watchlist & uploads (v3.5)

| Model | Role |
|-------|------|
| `Campaign` | Campaign folder grouping posts/assets/analytics/comments (`name`, `color?`, `description?`, `startDate?`, `endDate?`, `archived`, soft-delete via `deletedAt`). |
| `WatchedAccount` | A tracked competitor/external account (`provider`, `handle`, `displayName?`, `enabled`, `lastError?`, soft-delete via `deletedAt`). |
| `WatchedAccountMetric` | A captured metric for a watched account (`metric`, `value`, `capturedAt`; cascade-deletes with its account). |
| `MultipartUpload` | Per-org multipart-upload ownership ledger (`uploadId`, `key`, `fileName?`, `fileHash?`, `expectedMime?`, `totalSize?`, `partCount`, `state`) — binds presign/complete/abort to the owning org. |

`Post` gains a nullable `campaignId` (FK to `Campaign`) so a post can belong to a campaign.

See [Public API → Internal app API additions](../api/public-api.md) and
[Analytics v2 API](../api/analytics-v2-api.md).

## OAuth hardening fields (v3.5)

`OAuthAuthorization` gains additive nullable fields for OAuth 2.0 / PKCE hardening: `redirectUri`
(exact redirect URI used at authorize), `codeChallenge` + `codeChallengeMethod` (PKCE S256), `scope`,
`tokenExpiresAt`, `refreshToken` (encrypted) + `refreshTokenExpiresAt`. All nullable, so the `db push`
stays non-destructive.

## Billing

`Credits`, `Subscription`, `Customer`, `Orders`, `OrderItems`, `PayoutProblems`,
`SocialMediaAgency`, `SocialMediaAgencyNiche`.

## Integrations & webhooks

`Webhooks`, `IntegrationsWebhooks`, `OAuthApp`, `OAuthAuthorization`, `ApprovedApps`.

## Messaging & misc

`Notifications`, `MessagesGroup`, `Messages`, `Mentions`, `Announcement`, `Errors`,
`PopularPosts`, `Trending`, `TrendingLog`, `Star`, `ItemUser`, `GitHub`, `UsedCodes`.

## Mastra agent persistence

`mastra_*` tables (`mastra_messages`, `mastra_threads`, `mastra_traces`, `mastra_ai_spans`,
`mastra_evals`, `mastra_scorers`, `mastra_resources`, `mastra_workflow_snapshot`) back the Mastra
chat agent.

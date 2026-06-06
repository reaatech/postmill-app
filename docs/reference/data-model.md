# Data Model

Key Prisma models grouped by domain. The schema is the source of truth:
`libraries/nestjs-libraries/src/database/prisma/schema.prisma`. See [Database](../developers/database.md)
for the `db push` model and schema-change rules.

> **Verified against v3.4.0.** Model names below are taken from the schema.

---

## Core scheduling

| Model | Role |
|-------|------|
| `Organization` | Tenant boundary. |
| `User`, `UserOrganization` | Accounts and their org membership. |
| `Integration` | A connected channel (provider account). |
| `Post` | A scheduled/published post (with denormalized stats fields). |
| `Media` | Uploaded media. |
| `Tags`, `TagsPosts` | Tagging. |
| `Comments` | In-app post comments (distinct from synced social comments). |
| `Signatures`, `Sets`, `AutoPost`, `Plugs`, `ThirdParty` | Composition helpers and automations. |

## Provider configuration (v3.0)

| Model | Role |
|-------|------|
| `ProviderConfiguration` | Encrypted, admin-managed channel credentials + enablement. See [Channels admin](../admin/channels.md). |

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

## AI system (v3.4) — 10 models

| Model | Role |
|-------|------|
| `AIProviderConfig` | A configured AI provider (encrypted credentials, model). |
| `AISystemSettings` | Global AI/governance settings + active provider. |
| `AISpendLog` | Recorded AI spend. |
| `AIOrgProviderConfig` | Per-org provider config (BYOK). |
| `AIBrandProfile` | Brand voice/context for generation. |
| `AIPromptTemplate` | Saved prompt templates. |
| `AIPromptLibraryItem` | Shared prompt library entries. |
| `AISettingsAudit` | Audit trail of AI-settings changes. |
| `AIMediaJob` | Media generation jobs. |
| `AIContentIndex` | Indexed content for semantic search / RAG. |

See [AI architecture](../developers/ai-architecture.md).

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

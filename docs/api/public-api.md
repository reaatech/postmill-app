# Public API (v1)

The stable, API-key-authenticated surface for automation. Base path: **`/public/v1`**.

> **Verified against v3.5.10.** Endpoints below are taken from the v1 public integrations controller.

---

## Authentication

Use your organization's API key. Allow-list your public IP for the token. The hourly request limit
is the global `API_LIMIT` (default `600`, raised from `90` in v3.5.10) — see
[Configuration](../self-hosting/configuration.md).

## Endpoints

### Media

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/public/v1/upload` | Upload media. |
| `POST` | `/public/v1/upload-from-url` | Upload media from a URL. |

### Posts

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/public/v1/posts` | List posts. |
| `POST` | `/public/v1/posts` | Create/schedule a post. |
| `DELETE` | `/public/v1/posts/:id` | Delete a post. |
| `DELETE` | `/public/v1/posts/group/:group` | Delete a post group. |
| `GET` | `/public/v1/find-slot/:id` | Find an available scheduling slot. |
| `GET` | `/public/v1/posts/:id/missing` | Missing-content check for a post. |
| `PUT` | `/public/v1/posts/:id/status` | Update a post's status. |
| `PUT` | `/public/v1/posts/:id/release-id` | Set the release id. |

### Integrations (channels)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/public/v1/integrations` | List connected channels. |
| `GET` | `/public/v1/is-connected` | Connection check. |
| `GET` | `/public/v1/groups` | List groups. |
| `GET` | `/public/v1/social/:integration` | Social details for a channel. |
| `GET` | `/public/v1/integration-settings/:id` | Channel settings. |
| `DELETE` | `/public/v1/integrations/:id` | Disconnect a channel. |
| `POST` | `/public/v1/integration-trigger/:id` | Trigger a channel action. |

### Media generation

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/public/v1/generate-video` | Generate a video. |
| `POST` | `/public/v1/video/function` | Video function call. |

### Analytics

| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| `GET` | `/public/v1/analytics/:integration` | Channel analytics. | **Legacy — frozen response shape.** |
| `GET` | `/public/v1/analytics/post/:postId` | Post analytics. | **Legacy — frozen response shape.** |
| `GET` | `/public/v1/analytics/overview` | Multi-channel overview. | v2-style addition. |

> **Backward compatibility:** the two legacy analytics routes keep their original shape for
> n8n/Zapier/Make. The overview route was added in parallel. See [Analytics v2 API](./analytics-v2-api.md).

### Notifications

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/public/v1/notifications` | List notifications. |

## Automation tools

n8n, Make, and the Node SDK call this surface. See [Automation](./automation.md).

---

## Internal app API additions (v3.5.0)

The following endpoints live on the **internal app API** (session/JWT, base path `/`), not on
`/public/v1`. They back the frontend and are documented here for completeness; they are not a stable
public contract (see [Overview](./overview.md)). The full set is in [`openapi.yml`](../../openapi.yml).

### AI utilities (`AiUserController`)

All new AI endpoints carry an explicit `@Throttle` (rate cap on top of budget governance) and require
the `Create`/`Read` policy on the `AI` section.

| Method | Path | Purpose | Throttle |
|--------|------|---------|----------|
| `POST` | `/ai/hashtags` | Platform-aware hashtag generation (`{ content, platform }`). | 30/min |
| `POST` | `/ai/comment-reply` | Draft a reply, **or** `action: 'sentiment' \| 'summary'` over a comment thread (`{ commentId, postContent, action? }`). | 30/min |
| `POST` | `/ai/best-time` | LLM best-time-to-post suggestion (`{ suggestion, hasAnalyticsData }`). | 30/min |
| `POST` | `/ai/compliance` | Content compliance / brand-safety check (`{ content, platform? }` → `{ passed, violations[], suggestions[] }`). | 30/min |
| `POST` | `/ai/brand-memory/index` | Index top-performing posts into RAG brand memory. | 10/min |
| `POST` | `/ai/brand-memory/search` | Search brand memory (`{ prompt }` → `{ hits }`). | 20/min |

(`/ai/repurpose`, `/ai/translate`, `/ai/variants`, `/ai/usage`, `/ai/media`, `/ai/search`, and the
brand-profile / prompt-template / prompt-library routes pre-date v3.5.0.)

### Posts (`PostsController`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/posts/preflight` | Content QA preflight — returns warnings + blocking validation without creating the post. |
| `POST` | `/posts/bulk` | Bulk/CSV scheduling — per-row success/warnings/errors, validated via the shared post-creation logic. |

### Social comment inbox (`SocialCommentsController`)

Cross-channel inbox over the existing `SocialComment` / `PostCommentRead` data (policy: `COMMUNITY_FEATURES`).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/posts/inbox` | Unified inbox (`status`, `assigneeId`, `cursor`, `unreadOnly` query params). |
| `GET` | `/posts/inbox/unread-count` | Org-wide unread count for the user. |
| `POST` | `/posts/inbox/bulk-read` | Bulk mark-read (`{ commentIds[] }`). |

(Per-post comment threads, replies, likes, read-state, status, and assignment remain under
`/posts/:id/social-comments*`.)

### Campaigns (`CampaignsController`)

Campaign folders grouping posts/assets/analytics/comments. `Post.campaignId` links a post to a campaign.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/campaigns` | List campaigns. |
| `GET` | `/campaigns/:id` | Get a campaign. |
| `POST` | `/campaigns` | Create (`{ name, color?, description?, startDate?, endDate? }`). |
| `PUT` | `/campaigns/:id` | Update (adds `archived?`). |
| `DELETE` | `/campaigns/:id` | Soft-delete. |

### Provider capabilities (`ProviderCapabilitiesController`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/provider-capabilities` | The capability matrix (comments / first-comment / poll / analytics per provider). |
| `GET` | `/admin/provider-capabilities` | Same matrix, super-admin gated. |

### Webhook event types (v3.5.0)

The webhook dispatcher (`webhooks.service.ts`, `SUPPORTED_EVENT_TYPES`) now emits, in addition to
`post.published`:

| Event | Emitted when |
|-------|--------------|
| `comment.new` | A new synced social comment arrives. |
| `comment.reply` | A reply is posted to a comment. |
| `analytics.snapshot_complete` | An analytics snapshot sweep completes. |

All webhook dispatch goes through the SSRF-safe `safeFetch` helper (validate + manual redirect
re-validation). See [Architecture](../developers/architecture.md).

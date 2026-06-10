# Social Comments

For providers that support it, the app syncs platform comments on your posts, tracks which comments
each user has read, and (where the provider allows) lets you reply and like from inside Postmill.

---

## What it does

- **Sync** comments from the platform into the app for posts on comment-capable channels.
- **Per-user read state** — each user sees unread counts and can mark comments read.
- **Reply / like** — where the provider's capabilities allow it.
- **Triage** — set a status on a comment and assign it to a user.

Which channels support this is capability-driven — see [Comments support](../channels/comments.md).
v3.5.0 expands comment sync to 8 more providers (Discord, Telegram, Slack, WordPress, dev.to,
Hashnode, Medium, TikTok). Pixelfed and PeerTube still do **not** sync comments.

## Where you see it

Comments appear in the **Post Detail** modal's comments section, which is capability-aware: reply and
like actions only show for providers that support them. See
[Calendar & Post Detail](./calendar-and-posts.md).

v3.5.0 also adds a **cross-channel comment inbox** at `/comments` (linked from the top nav) — a
unified view across all channels and posts, not scoped to one post.

## Cross-channel comment inbox (v3.5.0)

The inbox aggregates synced comments from every channel into one triage surface:

- **Filters** — unread, assigned-to, status, and sentiment/priority (sentiment from the AI
  sentiment tool — see [AI features](./ai-features.md)).
- **Bulk mark-read** — clear a batch of comments at once.
- **Quick replies** — reply inline where the provider allows it.
- **Unread count** — a running count across channels.

It is additive to the per-post comments view; both read the same `SocialComment` / `PostCommentRead`
data.

## First comment auto-posting (v3.5.0)

On the providers whose capability matrix sets `firstComment`, you can set a **first comment** in the
composer per channel. After the post publishes successfully, the workflow posts that text as the
first comment. This is **non-fatal**: if the first comment fails, the post stays published, a warning
is surfaced (and a notification emitted), and the workflow does not roll back. The step is
idempotent, so a retry or `continueAsNew` boundary won't double-post it. The textarea only renders
where the provider declares `firstComment` support — see
[Provider capabilities](./provider-capabilities.md).

## API surface

Most comment endpoints hang off the post (`/posts/:id/...`); the inbox endpoints are org-wide:

| Endpoint | Purpose |
|----------|---------|
| `GET /posts/:id/social-comments` | List synced comments for a post. |
| `GET /posts/:id/social-comments/unread-count` | Unread count for the current user. |
| `POST /posts/:id/social-comments` | Trigger/fetch comments for a post. |
| `POST /posts/:id/social-comments/read` | Mark comments read for the current user. |
| `POST /posts/:id/social-comments/:commentId/reply` | Reply to a comment. |
| `POST /posts/:id/social-comments/:commentId/like` | Like/unlike a comment. |
| `POST /posts/:id/social-comments/:commentId/status` | Set a triage status. |
| `POST /posts/:id/social-comments/:commentId/assign` | Assign a comment to a user. |
| `GET /inbox` | Cross-channel inbox list, filterable by `status` / `assigneeId` (v3.5.0). |
| `GET /inbox/unread-count` | Unread count across all channels (v3.5.0). |
| `POST /inbox/bulk-read` | Bulk mark a batch of comments read (v3.5.0). |

## How sync runs

Comments are pulled by a Temporal workflow (`commentsCollectionWorkflow`) gated by `RUN_CRON=true`
on one orchestrator instance. Synced comments are stored with per-user read state.

> **Important:** without `RUN_CRON=true`, comments won't sync automatically. See
> [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## Generate replies with AI

The AI layer can draft a comment reply for you — see the comment-reply generator in
[AI features](./ai-features.md).

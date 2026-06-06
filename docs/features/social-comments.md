# Social Comments

For providers that support it, the app syncs platform comments on your posts, tracks which comments
each user has read, and (where the provider allows) lets you reply and like from inside Postiz.

> **Verified against v3.4.0.** Foundation introduced in v3.3.0.

---

## What it does

- **Sync** comments from the platform into the app for posts on comment-capable channels.
- **Per-user read state** — each user sees unread counts and can mark comments read.
- **Reply / like** — where the provider's capabilities allow it.
- **Triage** — set a status on a comment and assign it to a user.

Which channels support this is capability-driven — see [Comments support](../channels/comments.md).
Pixelfed and PeerTube do **not** sync comments.

## Where you see it

Comments appear in the **Post Detail** modal's comments section, which is capability-aware: reply and
like actions only show for providers that support them. See
[Calendar & Post Detail](./calendar-and-posts.md).

## API surface

Comment endpoints hang off the post (`/posts/:id/...`):

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

## How sync runs

Comments are pulled by a Temporal workflow (`commentsCollectionWorkflow`) gated by `RUN_CRON=true`
on one orchestrator instance. Synced comments are stored with per-user read state.

> **Important:** without `RUN_CRON=true`, comments won't sync automatically. See
> [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## Generate replies with AI

The AI layer can draft a comment reply for you — see the comment-reply generator in
[AI features](./ai-features.md).

# Calendar & Post Detail

The calendar at `/launches` is where you schedule and manage posts. v3.3.0 reshaped how cards
behave and added a **Post Detail** modal.

> **Verified against v3.5.9.** Calendar/post-detail behaviour changed in v3.3.0 — see
> [What's different from upstream](../CHANGES_FROM_UPSTREAM.md).

---

## Scheduling

Add a post to the calendar and it enters a publishing workflow that posts at the scheduled time.
Publishing runs on Temporal and does **not** require `RUN_CRON` (that switch only gates analytics
collection and comment sync). See [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## Calendar cards (v3.3.0 behaviour)

The interaction model changed from upstream:

- **Click the card body** → opens the **Post Detail** modal (read/inspect).
- **Click the settings icon** on the card's hover strip → opens the **edit** modal.
  (Previously the whole card body opened the editor.)
- **Scheduled / published pill** — a state indicator on the card.
- **Stats footer** — views / likes / comments, sourced from persisted per-post analytics snapshots.

## The Post Detail modal

Opening a card shows:

- **KPI header** — key metrics for the post, fetched from `GET /analytics/v2/post/:postId`. For
  posts that haven't been snapshotted yet, a live-fallback path fills the header so it isn't empty.
- **Post thread** — the full thread of posts, loaded recursively.
- **Comments section** — capability-aware: it shows synced platform comments and reply/like actions
  only where the channel's provider supports them. See [Comments support](../channels/comments.md)
  and [Social comments](./social-comments.md).

## Where the data comes from

- Post KPIs and stats come from the persisted analytics layer (`PostAnalyticsSnapshot`), surfaced
  through the `/analytics/v2` endpoints. See [Analytics](./analytics.md).
- Comments come from the social-comments sync layer. See [Social comments](./social-comments.md).

> **Note:** stats and snapshots only populate once the background collection workflow is running
> (`RUN_CRON=true` on one orchestrator). Until then the live-fallback covers the KPI header but the
> card stats footer may be empty.

# Analytics v2 API

The `/analytics/v2` surface serves the persisted analytics dashboard and the Post Detail KPI header.
For the feature itself (dashboard, retention, charts) see [Analytics](../features/analytics.md);
this page is the endpoint reference.

> **Verified against v3.4.0.** Endpoints from `AnalyticsV2Controller`.

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/analytics/v2/overview` | Aggregated overview across channels. |
| `GET` | `/analytics/v2/channel/:integrationId` | Metrics for one channel. |
| `GET` | `/analytics/v2/channel/:integrationId/metric/:metric` | One metric for one channel. |
| `GET` | `/analytics/v2/metric/:metric` | One metric across channels. |
| `GET` | `/analytics/v2/day` | Per-day series. |
| `GET` | `/analytics/v2/posts` | Post-level metrics list. |
| `GET` | `/analytics/v2/post/:postId` | Metrics for a single post. |
| `GET` | `/analytics/v2/export` | CSV / JSON export. |

## Notes

- **Date ranges & comparisons** — endpoints accept a date range and compute real period-over-period
  comparisons from the snapshot tables, not from hardcoded provider values.
- **Live fallback** — `/analytics/v2/post/:postId` has a live-fallback for posts that haven't been
  snapshotted yet, so the Post Detail KPI header isn't empty. See
  [Calendar & Post Detail](../features/calendar-and-posts.md).
- **Data availability** — these endpoints return data only once the collection workflow has run
  (`RUN_CRON=true` on one orchestrator). See
  [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## Relationship to the legacy/public routes

This replaces the legacy single-channel `/analytics/:integration` and `/analytics/post/:postId`
internal routes. On the **public** API, the legacy routes are kept with a frozen response shape for
automation compatibility, with a v2-style overview added alongside. See
[Public API](./public-api.md).

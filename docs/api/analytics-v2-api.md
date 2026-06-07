# Analytics v2 API

The `/analytics/v2` surface serves the persisted analytics dashboard and the Post Detail KPI header.
For the feature itself (dashboard, retention, charts) see [Analytics](../features/analytics.md);
this page is the endpoint reference.

> **Verified against v3.5.0.** Endpoints from `AnalyticsV2Controller`.

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
| `GET` | `/analytics/v2/best-time` | Best-time-to-post heatmap (structured day×hour engagement). |
| `GET` | `/analytics/v2/recommendations` | Prioritized analytics recommendations (action cards). |
| `GET` | `/analytics/v2/export` | CSV / JSON export. |

### Watchlist (v3.5.0)

Track competitor / external accounts and their captured metrics.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/analytics/v2/watchlist` | List watched accounts for the org. |
| `POST` | `/analytics/v2/watchlist` | Add a watched account (`{ provider, handle, displayName? }`). |
| `PUT` | `/analytics/v2/watchlist/:id` | Update an entry (`{ displayName?, enabled? }`). |
| `DELETE` | `/analytics/v2/watchlist/:id` | Remove a watched account. |

## Notes

- **Date ranges & comparisons** — endpoints accept a date range and compute real period-over-period
  comparisons from the snapshot tables, not from hardcoded provider values.
- **Query validation (v3.5.0)** — `from`/`to` are required and must be valid dates, `to` must be
  `>= from`, `limit` is bounded server-side (default 20, max 100), and `dir`/`sort`/`format` are
  validated against allow-lists. Invalid input returns `400`.
- **Overview cache (v3.5.0)** — `/analytics/v2/overview` results are cached in Redis for 60s
  (key `analytics:overview:{orgId}:{sha256(params)}`). The cache is skipped when `to` is today, since
  the day's snapshot may still be arriving via the Temporal collection workflow.
- **Live fallback** — `/analytics/v2/post/:postId` has a live-fallback for posts that haven't been
  snapshotted yet, so the Post Detail KPI header isn't empty. See
  [Calendar & Post Detail](../features/calendar-and-posts.md).
- **Best time & recommendations** — `/best-time` returns a structured `{ heatmap[], bestSlots[] }`
  payload (a different surface from the composer's LLM-text best-time tool); `/recommendations`
  returns prioritized action cards (underperforming channels, top-post patterns, coverage gaps,
  comment backlog).
- **Data availability** — these endpoints return data only once the collection workflow has run
  (`RUN_CRON=true` on one orchestrator). See
  [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## Relationship to the legacy/public routes

This replaces the legacy single-channel `/analytics/:integration` and `/analytics/post/:postId`
internal routes. On the **public** API, the legacy routes are kept with a frozen response shape for
automation compatibility, with a v2-style overview added alongside. See
[Public API](./public-api.md).

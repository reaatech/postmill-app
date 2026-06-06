# Analytics

This fork replaces upstream's single-channel, live-fetch analytics with a **persisted, multi-channel
dashboard** built from daily snapshots and served through the `/analytics/v2` API.

> **Verified against v3.4.0.** Introduced in v3.1.0.

---

## How it works

1. A Temporal workflow collects **daily metric snapshots** per channel and per post into
   `AnalyticsSnapshot` and `PostAnalyticsSnapshot`.
2. The dashboard and Post Detail modal read those snapshots through `/analytics/v2`, computing real
   period-over-period comparisons.
3. Old data is rolled up/pruned automatically to keep the tables bounded.

> **Important:** collection only runs when `RUN_CRON=true` is set on exactly one orchestrator
> instance. Without it, the dashboard won't populate. See
> [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## The dashboard

A multi-channel drill-down with:

- Date-range picker and channel multi-select.
- KPI cards with period-over-period change.
- Line / bar / area / pie charts.
- CSV / JSON export.

## API surface (`/analytics/v2`)

| Endpoint | Purpose |
|----------|---------|
| `GET /analytics/v2/overview` | Aggregated overview across channels. |
| `GET /analytics/v2/channel/:integrationId` | Metrics for one channel. |
| `GET /analytics/v2/channel/:integrationId/metric/:metric` | One metric for one channel. |
| `GET /analytics/v2/metric/:metric` | One metric across channels. |
| `GET /analytics/v2/day` | Per-day series. |
| `GET /analytics/v2/posts` | Post-level metrics list. |
| `GET /analytics/v2/post/:postId` | Metrics for a single post (powers the Post Detail KPI header). |
| `GET /analytics/v2/export` | CSV / JSON export. |

> The Post Detail KPI header uses `/analytics/v2/post/:postId` with a live-fallback for posts that
> haven't been snapshotted yet. See [Calendar & Post Detail](./calendar-and-posts.md).

## Retention & rollup

To stay bounded, each daily sweep:

- Rolls up raw daily channel snapshots older than `ANALYTICS_DAILY_RETENTION_DAYS` (default `548`,
  ~18 months) into one weekly row per `(integration, metric, ISO week)` — flow metrics summed, stock
  metrics keeping the week's latest value.
- Prunes per-post snapshots older than `ANALYTICS_POST_RETENTION_DAYS` (default `90`).

Weekly aggregates stay compatible with the dashboard's range queries. See
[Temporal & background jobs](../self-hosting/temporal-and-cron.md) for the mechanics and tuning.

## Backward compatibility

The original public-API analytics route keeps its response shape for n8n/Zapier/Make compatibility;
a parallel v2 public route was added rather than changing it. Don't expect the legacy route to
change shape. See [What's different from upstream](../CHANGES_FROM_UPSTREAM.md).

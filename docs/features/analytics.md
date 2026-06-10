# Analytics

This fork replaces upstream's single-channel, live-fetch analytics with a **persisted, multi-channel
dashboard** built from daily snapshots and served through the `/analytics/v2` API.

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
- A tab bar covering Overview, Channels, Posts, **Best Time** (heatmap), **Recommendations**, and
  **Watchlist** — see below.

### Channel Detail panel (v3.5.0)

Clicking a channel in the Channels tab opens a **slide-out Channel Detail panel** showing the full
per-channel KPI set — every metric the channel reports, each with its own time-series area chart —
plus a top-posts table for that channel. (Previously the dashboard surfaced only the first KPI per
channel.) It reads `GET /analytics/v2/channel/:integrationId` and, per metric,
`GET /analytics/v2/channel/:integrationId/metric/:metric`.

### Export button (v3.5.0)

A header **Export** dropdown downloads the current view as **CSV or JSON** via
`GET /analytics/v2/export?format=csv|json`. (The backend export was already wired; v3.5.0 adds the
UI.)

### Post detail charts & metric column picker (v3.5.0)

The Post Detail slide-out now renders each metric's full `{ date, value }[]` **time-series as a
line/area chart**, not just the latest value. The Posts tab also gains a **metric column picker** so
you can choose which of the canonical metrics to show as columns (previously a fixed set of
impressions / engagement / likes / comments / shares).

### Best Time to Post heatmap (v3.5.0)

A **Best Time** tab renders a **day × hour heatmap**, color-coded by engagement, built from ~90 days
of your post timing and engagement. It reads `GET /analytics/v2/best-time`, which returns structured
heatmap data. This is the analytics dashboard's structured view; the composer's AI best-time tool
(LLM text) is a separate surface — the two coexist.

### Recommendations tab (v3.5.0)

A **Recommendations** tab turns analytics from passive reporting into prioritized actions —
underperforming channels, top post patterns, best-time opportunities, missing analytics coverage,
and comment-response backlog. Each card carries a concrete action and deep-links into the relevant
dashboard, channel, post, or comment inbox view. It reads `GET /analytics/v2/recommendations`.

### Watchlist tab (v3.5.0)

A **Watchlist** tab tracks public competitor/peer accounts where the provider's API allows it. See
[Watchlist & competitor tracking](./watchlist.md) for how it works and its capability gating.

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
| `GET /analytics/v2/best-time` | Structured day×hour heatmap data (Best Time tab). |
| `GET /analytics/v2/recommendations` | Prioritized recommendation cards. |
| `GET/POST/PUT/DELETE /analytics/v2/watchlist[/:id]` | Manage and read watched accounts — see [Watchlist](./watchlist.md). |

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

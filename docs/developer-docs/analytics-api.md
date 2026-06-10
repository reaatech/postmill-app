# Analytics API (v2)

The Analytics v2 API serves persisted multi-channel analytics from daily
snapshots collected by the Temporal `analyticsCollectionWorkflow`. It replaces
the legacy single-channel live-fetch endpoints.

All endpoints are scoped to the authenticated org. Date parameters must be valid
ISO dates and `to` must be greater than or equal to `from`.

**\* = required parameter**

## Overview

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/overview` | Dashboard overview |

Params: `from`\*, `to`\*, `integrations`?, `compare`?

Returns aggregated metrics across all or filtered integrations for a date range
with optional period-over-period comparison. Results are **cached in Redis for
60s** using key `analytics:overview:{orgId}:{sha256(JSON params)}`. Cache is
**skipped** when `endDate` is today (data may still arrive via the Temporal
workflow). No cache in dev mode.

## Channel analytics

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/channel/:integrationId` | Single channel analytics |
| GET | `/analytics/v2/channel/:integrationId/metric/:metric` | Specific metric for a channel |

Params (channel): `from`\*, `to`\*, `compare`?  
Params (channel/metric): `from`\*, `to`\*, `compare`?

Returns channel-level analytics with daily breakdowns. The metric detail variant
returns data for a single metric (e.g. `views`, `likes`, `comments`) across the
date range.

## Post analytics

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/posts` | Paginated post list with metrics |
| GET | `/analytics/v2/post/:postId` | Single post detail |

Params (posts): `from`\*, `to`\*, `integrations`?, `sort`?, `dir`?, `page`?, `limit`?  
Params (post): `date`?

- **Posts list**: Paginated list of posts with aggregated metrics. Sort by
  engagement, views, date, etc. Max 100 per page.
- **Post detail**: Returns post KPI header plus daily metric breakdown. Has a
  **live fallback** — if no `PostAnalyticsSnapshot` exists for the post, it
  fetches from the live provider using the legacy `checkPostAnalytics()` path.

## Metric and day detail

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/metric/:metric` | Metric detail across date range |
| GET | `/analytics/v2/day` | Day-level detail |

Params (metric): `from`\*, `to`\*, `integrations`?, `compare`?  
Params (day): `date`\*, `metric`\*, `integrations`\*

The metric endpoint provides cross-channel detail for a single metric. The day
endpoint provides a per-channel breakdown for one metric on one date.

## Insights

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/best-time` | Best-time-to-post heatmap |
| GET | `/analytics/v2/recommendations` | AI-powered recommendations |

Params (best-time): `integrations`?

- **Best time**: Returns a structured day x hour engagement heatmap plus a list
  of `bestSlots` (top day/hour/avgEngagement combinations).
- **Recommendations**: Returns prioritized actions (underperforming channels,
  top patterns, best-time opportunities, missing coverage, comment backlog),
  each deep-linking to the relevant view.

## Export

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/export` | CSV/JSON export |

Params: `from`\*, `to`\*, `integrations`?, `format`? (default `json`),
`compare`?

Returns a file download with `Content-Disposition: attachment`. Format must be
`csv` or `json`.

## Watchlist CRUD

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/watchlist` | List watched accounts |
| POST | `/analytics/v2/watchlist` | Add account to watchlist |
| PUT | `/analytics/v2/watchlist/:id` | Update watched account |
| DELETE | `/analytics/v2/watchlist/:id` | Remove watched account |

Body (POST): `{ provider, handle, displayName? }` where `provider` is one of
`twitter`, `linkedin`, `instagram`, `facebook`, `youtube`, `tiktok`.  
Body (PUT): `{ displayName?, enabled? }`

Watched accounts have their public metrics probed during the analytics collection
sweep, reusing the same snapshot/rollup infrastructure. Probe failures
(403/unsupported) auto-disable the capability and record `lastError` without
crashing the sweep.

## Redis cache

- **Overview endpoint**: 60s TTL, key pattern
  `analytics:overview:{orgId}:{sha256(JSON params)}`. Skipped when `endDate` is
  today.
- **General**: All Redis operations go through `ioRedis` from
  `redis.service.ts`.

## Date validation

All date-range endpoints validate:
- `from` and `to` are required (400 if missing).
- Both must be valid dates parsable by dayjs (400 if invalid).
- `to` must be >= `from` (400 if `to` is before `from`).
- `integrations` is comma-separated, parsed with `parseIntegrations()`.
- `limit` is capped at 100.

> Verified against v3.7.0

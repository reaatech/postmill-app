# Analytics API (v2)

The Analytics v2 API serves persisted multi-channel analytics from daily
snapshots collected by the Inngest `analytics-collection` cron function (see
[Anomaly pipeline & collection](#anomaly-pipeline-collection)). It replaces the
legacy single-channel live-fetch endpoints.

All endpoints are scoped to the authenticated org. Date parameters must be valid
ISO dates and `to` must be greater than or equal to `from`.

**Authorization.** All `GET` reads use the org-scope default (`analytics:read`,
seeded to every role). Every **mutating** route — `POST /analytics/v2/share`,
`DELETE /analytics/v2/share`, `POST /analytics/v2/alert-rules`,
`PUT/DELETE /analytics/v2/alert-rules/:id`,
`POST /analytics/v2/anomalies/:id/dismiss`,
`POST /analytics/v2/refresh/:integrationId`, and the
`POST/PUT/DELETE /analytics/v2/watchlist*` routes — requires the
`analytics:update` RBAC permission (`@RequirePermission('analytics','update')`),
so a seeded viewer/member/editor cannot, e.g., mint the org-wide public share
link. `GET /analytics/v2/share` carries the same gate: it returns the live
token (= the public link), so reading it is part of managing sharing.
`POST /analytics/v2/narrate` is a read surface gated on AI billing
(`@CheckPolicies([Create, AI])` + a per-request `BudgetService` check), like the
CopilotKit chat surface. Alert-rule bodies are bounded: `threshold` ∈
`[0, 1_000_000_000]`, `integrationId` is a length-bounded string (Integration
ids are **cuids**, not uuids) that must belong to the org (else 400), and share
`rangePreset` ∈ `{7d, 30d, 90d}` with `integrations` capped at 50 ids.

Most date-range endpoints also accept an optional `campaigns` param — a
comma-separated list of campaign UUIDs — to scope aggregation to those campaigns'
posts (see [Campaign analytics](#campaign-analytics)).

**\* = required parameter**

## Overview

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/overview` | Dashboard overview |

Params: `from`\*, `to`\*, `integrations`?, `compare`?, `campaigns`?

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

Params (posts): `from`\*, `to`\*, `integrations`?, `campaigns`?, `sort`?, `dir`?, `page`?, `limit`?  
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

Params (metric): `from`\*, `to`\*, `integrations`?, `compare`?, `campaigns`?  
Params (day): `date`\*, `metric`\*, `integrations`\*, `campaigns`?

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
`compare`?, `campaigns`?

Returns a file download with `Content-Disposition: attachment`. Format must be
`csv` or `json`.

## Campaign analytics

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/campaigns/:id/analytics` | Campaign-scoped analytics (authed) |
| GET | `/analytics/v2/*` + `campaigns=` | Any date-range endpoint, campaign-scoped |

Params (`/campaigns/:id/analytics`): `from`?, `to`? (default to the campaign's
`startDate`→`endDate`, clamped to the post-snapshot retention floor).

Campaign scoping is **post-snapshot-scoped**: aggregation runs only over
`PostAnalyticsSnapshot` rows for posts belonging to the campaign
(`scope: 'campaign-posts'`), and the **live provider fallback is skipped** — a
campaign view never fans out to live platform queries. Channel-level metrics
(e.g. `followers`) are not campaign-scoped and are omitted. The campaign id is
validated as a UUID (`isUUID`), and `parseCampaigns()` rejects a malformed id
with a 400 so a typo never silently widens or narrows the scope. `from`/`to` on
`/campaigns/:id/analytics` (and its public-API twin) are validated the same way
as the `/analytics/v2` routes — a malformed date or `to < from` returns **400**,
and the window is capped (>400 days rejected) to bound query cost.

**Post-snapshot level semantics.** `PostAnalyticsSnapshot.value` is a
**cumulative lifetime level** for every metric (that is what each provider's
`postAnalytics()` returns — X `public_metrics`, Bluesky `likeCount`, Reddit
`score`, YouTube `statistics`). Campaign aggregation therefore **differences at
read time**: a KPI total is `lastLevelInWindow − baseline(post)` per post
(baseline = the level just before the window; missing ⇒ 0, clamped ≥ 0), summed
across posts; series are per-day deltas of those levels; `percent` metrics (e.g.
`upvote_ratio`) average per-post last levels instead. This is why a campaign KPI
equals the window **delta**, not the running total. Channel-level
`AnalyticsSnapshot` semantics are unchanged (providers emit true dailies there).

The response carries a per-metric `series` map plus a `byChannel` breakdown,
reused by the Campaign Hub dashboard and the public campaign report (see
[Campaigns](../user-guide/campaigns.md)).

## Anomalies

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/v2/anomalies` | List detected anomalies for the org |
| POST | `/analytics/v2/anomalies/:id/dismiss` | Dismiss an anomaly |

`GET /analytics/v2/anomalies` returns stored `AnalyticsAnomaly` rows (most recent
first) with `integrationId`, `metric`, `date`, `value`, `baseline`, signed
`deviation`, `direction` (`spike` | `drop`), and an optional `topPostId`
root-cause hint. `POST …/:id/dismiss` sets `dismissedAt` so the alert stops
surfacing on the dashboard. See [Anomaly pipeline & collection](#anomaly-pipeline-collection)
for how rows are produced.

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

All date-range endpoints validate (shared helpers in
`libraries/nestjs-libraries/src/analytics/date-range.validation.ts`):
- `from` and `to` are required (400 if missing).
- Both must be valid dates parsable by dayjs (400 if invalid).
- `to` must be >= `from` (400 if `to` is before `from`).
- The window is capped at **400 days** (400 if exceeded) — aggregation iterates
  day-by-day, so an unbounded range would be a single-request CPU sink. The cap
  applies to every date route: the v2 overview/channel/posts/metric/export/
  content-insights routes, `GET /watchlist/:id/series` (explicit invalid dates
  now 400 instead of being silently ignored), the campaign-analytics routes,
  and the public-API overview.
- `integrations` is comma-separated, parsed with `parseIntegrations()`.
- `campaigns` is comma-separated, parsed with `parseCampaigns()` (each id validated as a UUID).
- `limit` is capped at 100.

## Anomaly pipeline & collection

Analytics are collected by the Inngest `analytics-collection` cron function
(`apps/backend/src/inngest/functions/analytics-collection.ts`, daily 02:00 UTC —
requires `USE_INNGEST=true`). Each sweep runs the snapshot collection, the
prune/rollup, and then a `detect-anomalies` step:

1. `detect-anomalies` calls `AnalyticsActivity.detectAnomalies(orgId)`
   (`libraries/nestjs-libraries/src/inngest/activities/analytics.activity.ts`).
2. It loads ~35 days of channel snapshots and, per `(integration, metric)` series,
   calls the **pure** detector `analytics/anomaly.detection.ts`. The detector
   tests the latest day against a trailing 28-day baseline (mean/σ). **Flow**
   metrics test the raw value; **stock** metrics (e.g. `followers`) are
   day-over-day differenced first. A point fires only when both the z-test
   (`|z| ≥ ANALYTICS_ANOMALY_Z`) and an absolute per-kind floor pass.
3. Fired points are persisted as `AnalyticsAnomaly` rows. The row is idempotent
   on `@@unique([integrationId, metric, date])`, so an Inngest retry cannot
   double-insert. Notifications are cooldown-deduped
   (`ANALYTICS_ANOMALY_COOLDOWN_DAYS`) and capped at **3 per org per day**, then
   dispatched via `NotificationService.notifyAnalyticsAnomaly` (category
   `analytics`, a deep link into `/analytics?tab=insights` carrying the
   URI-encoded metric **key** — e.g. `metric=unique_impressions` — not the
   display label). A user **alert rule** firing on the same
   `(integrationId, metric, date)` as the detector merges onto that one row
   (recording its `ruleId`) instead of pushing a duplicate the idempotent insert
   would drop. Off a flat (μ=0) baseline the persisted `deviation` keeps its sign
   (a real drop is no longer flattened to `0` and ranked last).
4. Detection **never throws** — a failure logs and returns without failing the
   sweep.

### Backfill on connect

Connecting a new **social** channel emits an `analytics/backfill` Inngest event
(`IntegrationService`), gated on `isInngestEnabled()` (`USE_INNGEST=true`), so a
fresh channel gets ~90 days of history immediately instead of waiting for sweeps
to accumulate. The send is non-fatal — a failure never blocks channel creation,
and the consumer no-ops for providers without analytics.

### Weekly post-snapshot rollup

`AnalyticsActivity.pruneAndRollupSnapshots()` rolls daily `PostAnalyticsSnapshot`
rows older than the retention window into one weekly row per
`(postId, metric, ISO week)`, so post/campaign series extend past the 90-day
window at weekly granularity instead of hitting a hard cliff. Because
post-snapshot values are **cumulative levels** (see [Campaign
analytics](#campaign-analytics)), a weekly row keeps the **week's latest level
for every metric** (never a sum — summing ~7 cumulative dailies would inflate the
row ~7×), and read-time level-differencing works unchanged across the
daily→weekly seam. Each sweep only re-reads/re-writes a bounded window
(`postCutoff − 30 days` … `postCutoff`) rather than the org's entire pre-cutoff
history; rows aging past that floor stay daily (still aggregate correctly) and
their count is logged, never silently dropped. The **channel** rollup is
unchanged (true dailies — flow summed, stock latest).

### Coverage heuristic

The live-fallback coverage check is **per-integration**: coverage is the fraction
of analytics-capable channels that have snapshots for the window (channels a
provider can't report analytics for are excluded from the denominator), not a
count of distinct snapshot dates. `FALLBACK_THRESHOLD` stays `0.5`.

### Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `ANALYTICS_ANOMALY_Z` | `3` | z-score threshold for anomaly detection |
| `ANALYTICS_ANOMALY_COOLDOWN_DAYS` | `3` | days to suppress a repeat notification for the same `(channel, metric)` |
| `ANALYTICS_DAILY_RETENTION_DAYS` | `548` | keep raw daily channel snapshots this long before weekly rollup |
| `ANALYTICS_POST_RETENTION_DAYS` | `90` | prune per-post daily snapshots older than this |

## Public API (v2)

For n8n/Zapier-style integrations, parallel read-only routes are exposed under
the public API (`public.integrations.controller.ts`, API-key authenticated):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/analytics/overview` | Org overview (legacy shape) |
| GET | `/analytics/campaign/:id` | Campaign-scoped analytics |
| GET | `/analytics/anomalies` | Detected anomalies for the org |
| GET | `/analytics/:integration` | Legacy single-channel analytics |

`GET /analytics/overview` validates `from`/`to` and enforces the same 400-day
window cap as the authed v2 routes (it was previously unreachable, so this is
new surface, not a contract change). It, `/analytics/campaign/:id`, and
`/analytics/anomalies` are registered **above** the catch-all
`GET /analytics/:integration` so Express route order resolves the static paths
first — previously `overview` fell through
to the `:integration` handler (`integration='overview'` → 500), so its throttle
and docs were dead. The legacy `:integration` response shape is preserved for
n8n/Zapier compatibility.

## Schema

`AnalyticsAnomaly` (`schema.prisma`, migration
`20260704120000_analytics_anomaly`): `organizationId`, `integrationId`, `metric`,
`date`, `value`, `baseline`, `deviation` (signed ratio), `direction`,
`topPostId?`, `notifiedAt?`, `dismissedAt?`, `createdAt`. Unique on
`(integrationId, metric, date)`; indexed on `(organizationId, createdAt)`.

> Verified against v4.5.0 (post-snapshot level semantics, `analytics:update` gating,
> campaign `from`/`to` validation, and the un-shadowed public overview route added
> in the `feat/stats-upgrade` review remediation).

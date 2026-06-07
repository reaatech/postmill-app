# Watchlist & Competitor Tracking

The watchlist tracks public competitor/peer accounts where the provider's API allows it, collecting
lightweight public metrics over time and surfacing trend prompts in analytics.

> **Verified against v3.5.0.** Introduced in v3.5.0.

---

## What it does

- **Watch public accounts** — add a provider + public handle/page to track.
- **Lightweight metric probes** — collect public metrics (e.g. followers, posts) over time.
- **Trend surfacing** — watched-account trends feed into the analytics
  [Recommendations](./analytics.md) and the Watchlist tab.
- **Capability-gated** — only providers whose capability matrix sets `watchlist` can be probed.
- **Graceful auto-disable** — if a probe fails (403 / unsupported), that account's probing is
  disabled and the error recorded; it never crashes the sweep.

## Where you see it

A **Watchlist** tab in the [Analytics](./analytics.md) dashboard, where you add/remove watched
accounts and review their tracked metrics.

## How collection runs

Watchlist probing rides the **existing analytics collection workflow sweep** — one lightweight
public-metric probe per enabled watched account. Like all collection, it only runs when
`RUN_CRON=true` is set on one orchestrator instance. It reuses the same snapshot
retention/rollup discipline so the metric table can't grow unbounded.

> **Important:** without `RUN_CRON=true`, watchlist metrics won't be collected. See
> [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

## Data model

Additive and db-push-safe — all new tables:

- **`WatchedAccount`** — `organizationId`, `provider`, `handle`, optional `displayName`, `enabled`,
  `lastError` (non-null implies the probe auto-disabled), soft-delete `deletedAt`. Unique per
  `(organizationId, provider, handle)`.
- **`WatchedAccountMetric`** — `metric` (normalized via `PROVIDER_METRIC_MAP`), `value`,
  `capturedAt`, cascading on its `WatchedAccount`.

## API surface (`/analytics/v2/watchlist`)

| Endpoint | Purpose |
|----------|---------|
| `GET /analytics/v2/watchlist` | List watched accounts and their metrics. |
| `POST /analytics/v2/watchlist` | Add a watched account. |
| `PUT /analytics/v2/watchlist/:id` | Update a watched account. |
| `DELETE /analytics/v2/watchlist/:id` | Remove a watched account. |

## Related

- [Analytics](./analytics.md) — the dashboard and Recommendations tab that surface watchlist trends.
- [Provider capabilities](./provider-capabilities.md) — which providers expose `watchlist`.

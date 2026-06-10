# Temporal & Background Jobs

Background work runs on **Temporal** in the `orchestrator` app. This includes scheduled publishing,
token refresh, email/digests, analytics collection, and comment sync. This page covers what runs,
and the one setting that trips people up: `RUN_CRON`.

---

## What runs in the orchestrator

Workflows live in `apps/orchestrator/src/workflows` with matching activities in
`apps/orchestrator/src/activities`. The main ones:

| Workflow | Purpose | Needs `RUN_CRON` |
|----------|---------|:---:|
| Post / autopost workflows | Publish scheduled posts at their target time. | No |
| `refresh.token.workflow` | Refresh provider OAuth tokens. | No |
| `send.email` / `digest.email` workflows | Transactional and digest emails. | No |
| `missing.post.workflow` | Detect/handle missing content. | No |
| `analytics.collection.workflow` | Daily multi-channel analytics snapshots. | **Yes** |
| `analytics.backfill.workflow` | Backfill historical analytics. | **Yes** |
| `comments.collection.workflow` | Periodic social-comment sync. | **Yes** |

## The `RUN_CRON` switch

The recurring **analytics collection** and **comment sync** workflows only start when
`RUN_CRON=true` is set on the orchestrator.

> **Warning:** set `RUN_CRON=true` on **exactly one** orchestrator instance. If you run multiple
> orchestrator replicas with it enabled, you'll schedule duplicate collection sweeps.

With `RUN_CRON` unset or `false`, scheduled posting still works — only the recurring collection
sweeps are inactive, so the analytics dashboard and synced comments won't populate.

## Analytics collection behaviour

The analytics workflow runs **one sweep per execution**, then sleeps 24h and `continueAsNew`s — it
does not use an unbounded `while(true)` loop. Each daily sweep, per organization, it:

1. Collects channel and post metric snapshots into `AnalyticsSnapshot` / `PostAnalyticsSnapshot`.
2. Runs retention/rollup: raw daily channel snapshots older than the retention window are rolled up
   into one weekly row per `(integration, metric, ISO week)` — flow metrics summed, stock metrics
   keeping the week's latest value — and per-post snapshots beyond their window are pruned.

### Retention tuning

| Variable | Default | Effect |
|----------|---------|--------|
| `ANALYTICS_DAILY_RETENTION_DAYS` | `548` (~18 months) | Age at which daily channel snapshots roll up to weekly. |
| `ANALYTICS_POST_RETENTION_DAYS` | `90` | Age beyond which per-post snapshots are pruned. |

Values are read per run; invalid values fall back to the defaults. Weekly aggregates remain
compatible with the dashboard's range queries.

## Comment sync behaviour

The comment-collection workflow periodically pulls platform comments (for providers that support
the comments capability) into `SocialComment`, tracking per-user read state in `PostCommentRead`.
It is gated by the same `RUN_CRON=true` requirement.

## Operating Temporal

- The orchestrator connects to Temporal at `TEMPORAL_ADDRESS` (e.g. `temporal:7233`).
- The bundled [`docker-compose.yaml`](https://github.com/reaatech/postmill-app/blob/main/docker-compose.yaml) includes a complete Temporal stack
  (server, its Postgres, Elasticsearch, and a UI on `:8080`). See [Docker](./docker.md).
- Use the Temporal UI to inspect running/failed workflows.

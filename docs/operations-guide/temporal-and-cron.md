# Temporal & Cron Jobs

Postmill uses **Temporal** as its durable workflow engine. Background jobs — from post publishing
to analytics collection to comment sync — execute as Temporal workflows with retry, persistence,
and visibility through the Temporal UI at `http://localhost:8080`.

## Architecture

The orchestrator (`apps/orchestrator`) is a NestJS + Temporal worker that runs inside the same
Node.js process as the backend. Workflow code executes in Temporal's deterministic sandbox;
activities (the actual I/O: database queries, HTTP calls) run outside the sandbox with automatic
retry.

The orchestrator connects to Temporal at `TEMPORAL_ADDRESS` (default `localhost:7233`).

## Prerequisites

- **Temporal server** running (included in `docker-compose.yaml`)
- `TEMPORAL_ADDRESS` set (defaults to `localhost:7233` for local dev, `temporal:7233` in Docker)
- `RUN_CRON=true` on **exactly one** instance to start perpetual workflows

## Workflow inventory

### Perpetual workflows (require `RUN_CRON=true`)

These three workflows start at boot time and run forever (`continueAsNew` to reset history).

#### `analyticsCollectionWorkflow`

Daily sweep of every organization:

1. **Collect channel snapshots** — 7-day lookback per integration, pulling follower counts,
   engagement metrics, and reach data for each connected channel.
2. **Collect post snapshots** — 30-day lookback per published post, pulling views, likes,
   comments, shares, and clicks.
3. **Prune & rollup** — Rolls daily `AnalyticsSnapshot` rows older than
   `ANALYTICS_DAILY_RETENTION_DAYS` (default 548 days, ~18 months) into one weekly row per
   `(integration, metric, ISO week)`. Prunes `PostAnalyticsSnapshot` rows older than
   `ANALYTICS_POST_RETENTION_DAYS` (default 90 days).
4. **Notify webhooks** — fires `analytics.snapshot_complete` webhook events per org (best-effort).
5. **Probe watched accounts** — probes each org's watchlist accounts for public metrics
   (best-effort; auto-disables on 403/unsupported).

After processing every org, sleeps 24 hours and calls `continueAsNew()` to prevent unbounded
history growth.

#### `commentsCollectionWorkflow`

Per-org comment sync:

1. **Fetch comments** — retrieves new comments for posts up to `POST_DAYS_BACK` (default 30) days
   old from each connected platform that implements `ISocialMediaComments`.
2. **Replay to read state** — updates `PostCommentRead` per-user read state.
3. **Prune comments** — soft-deletes comments older than `SOCIAL_COMMENT_RETENTION_DAYS` (default
   90 days).
4. **Notify** — sends notifications and dispatches `comment.new` / `comment.reply` webhooks
   (best-effort).

Processes orgs in batches of 5 concurrently. Configurable sweep interval via
`COMMENTS_SWEEP_INTERVAL_MINUTES` (default 30 minutes). Calls `continueAsNew()` after each sweep.

#### `missingPostWorkflow`

Hourly scan for posts that should have published but are stuck (e.g. Temporal worker restarted
during a publish). Calls `continueAsNew()` every 24 iterations (24 hours).

### On-demand workflows

These workflows are triggered by user actions, not `RUN_CRON`:

#### `postWorkflowV101` / `postWorkflowV102` / `postWorkflowV103` / `postWorkflowV104` / `postWorkflowV105` / `postWorkflowV106`

Per-post publish workflow. A single post can target multiple channels; each channel publishes
independently with retry. Each version corresponds to a workflow-definition release (the
orchestrator dispatches to the version stored on the post). V106 adds first-comment support
(idempotent, capability-gated, non-fatal). See
[Comments & first comment](../developer-docs/architecture.md).

#### `autoPostWorkflow`

Handles scheduled recurring posts from the Auto Post feature. Triggered by cron schedules defined
in the Auto Post settings.

#### `refreshTokenWorkflow`

Periodic OAuth token refresh for connected channels. Ensures tokens don't expire silently.

#### `streakWorkflow`

Tracks user posting streaks for gamification/analytics.

#### `analyticsBackfillWorkflow`

On-demand backfill for populating `AnalyticsSnapshot` and `PostAnalyticsSnapshot` from historical
data (e.g. after enabling analytics for the first time or recovering from a data gap).

#### `digestEmailWorkflow` / `sendEmailWorkflow`

Email delivery workflows for notification digests and transactional emails.

## Temporal configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal gRPC endpoint |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TLS` | — | Enable mTLS to Temporal |
| `TEMPORAL_API_KEY` | — | API key for Temporal Cloud or authenticated setups |

## Retention and data lifecycle

### Analytics data

| Configuration | Default | Effect |
|---------------|---------|--------|
| Channel lookback | 7 days | Analytics sweep fetches 7 days of channel metrics per run |
| Post lookback | 30 days | Analytics sweep fetches 30 days of post metrics per run |
| `ANALYTICS_DAILY_RETENTION_DAYS` | 548 days (~18 months) | Daily `AnalyticsSnapshot` rows older than this are rolled into weekly rows |
| `ANALYTICS_POST_RETENTION_DAYS` | 90 days | `PostAnalyticsSnapshot` rows older than this are pruned |

Rollup behaviour:
- **Flow metrics** (likes, comments, views) — **summed** within each ISO week
- **Stock metrics** (follower count, reach) — keep the **latest** value in the week

### Comment data

| Configuration | Default | Effect |
|---------------|---------|--------|
| `POST_DAYS_BACK` | 30 days | Comments fetched for posts published within this window |
| `SOCIAL_COMMENT_RETENTION_DAYS` | 90 days | Comments soft-deleted after this age |
| `COMMENTS_SWEEP_INTERVAL_MINUTES` | 30 minutes | Interval between comment collection sweeps |

## Verifying workflows

Open the Temporal UI at `http://localhost:8080` (or your Temporal Cloud dashboard). You should see:

- `analyticsCollectionWorkflow` — one running execution (renewed daily)
- `commentsCollectionWorkflow` — one running execution (renewed at sweep interval)
- `missingPostWorkflow` — one running execution (renewed every 24h)
- `postWorkflowV101` through `postWorkflowV106` — one per published post (short-lived)
- `analyticsBackfillWorkflow` — on-demand, visible when a backfill is in progress
- Other workflows (`autoPostWorkflow`, `refreshTokenWorkflow`, `streakWorkflow`, `digestEmailWorkflow`, `sendEmailWorkflow`) as triggered

If no perpetual workflows are visible, check that `RUN_CRON=true` is set and the orchestrator
is connecting to Temporal (check container logs for `Temporal` connection messages).

## Multiple replicas

If you run multiple application containers behind a load balancer, ensure `RUN_CRON=true` is set
on only **one** of them. Temporal itself handles workflow uniqueness, but duplicate `RUN_CRON`
would start duplicate perpetual workflow instances, doubling analytics and comment collection
work.

> Verified against v3.7.0

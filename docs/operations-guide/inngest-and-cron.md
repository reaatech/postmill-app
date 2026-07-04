# Inngest & Cron Jobs

Postmill uses **Inngest Cloud** as its durable job engine. Background jobs — analytics collection, comment sync, missing-post scanning, email log pruning, and watched-account probing — run as Inngest functions with retries, concurrency controls, and observability through the Inngest dashboard.

## Architecture

The backend (`apps/backend`) serves the Inngest handler at `/api/inngest`. Functions are registered from modules in `libraries/nestjs-libraries/src/inngest/` and triggered by cron schedules or events.

For local development you can use the **Inngest dev server** (`inngest-cli`) pointed at `http://localhost:3000/api/inngest`.

## Required environment variables

### For Inngest Cloud (production / hosted)

| Variable | Purpose |
|----------|---------|
| `INNGEST_EVENT_KEY` | Inngest event key for sending events |
| `INNGEST_SIGNING_KEY` | Primary signing key for validating requests |
| `INNGEST_SIGNING_KEY_FALLBACK` | Optional fallback key for rotation |
| `INNGEST_ENV` | Optional branch environment name |
| `INNGEST_SERVE_ORIGIN` | Public backend origin (e.g. `https://postmill.example.com`) |
| `INNGEST_SERVE_PATH` | Optional path override (default `/api/inngest`) |
| `USE_INNGEST` | Feature flag — set `true` to enable the cutover |

### For local dev server

```bash
INNGEST_DEV=1
INNGEST_BASE_URL=http://localhost:8288
```

No `INNGEST_EVENT_KEY` or `INNGEST_SIGNING_KEY` is required when `INNGEST_DEV=1`.

## Enabling background jobs

Unlike the old `RUN_CRON=true` single-instance model, Inngest functions are scheduled by Inngest Cloud. Ensure:

1. `USE_INNGEST=true` is set.
2. Cloud credentials (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) are set for non-dev deployments.
3. The backend is reachable on the public origin configured in `INNGEST_SERVE_ORIGIN`.
4. The Inngest app is registered with Inngest Cloud and pointed at `https://<your-origin>/api/inngest`.

Without this, the analytics dashboard, comment inbox, and watchlist data will remain empty.

## Function inventory

### Cron-triggered functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `analytics-collection` | Daily at 02:00 UTC | Per-org channel/post snapshots, rollup/prune, watchlist probes, short-link snapshots, email-log prune |
| `comments-collection` | Every minute (sleeps 30 min between sweeps) | Fetch new comments from connected platforms, update read state, prune old comments |
| `missing-post-finder` | Hourly | Detect posts that should have published but are stuck |
| `media-jobs-poll` | Every minute | Poll external media-generation jobs to completion |
| `agent-digest` | Mondays at 07:00 America/New_York | Per-org weekly AI brief; fans out to `agent/digest-org` |
| `agent-digest-org` | `agent/digest-org` event | Runs the headless read-only agent for one organisation |

### Event-triggered functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `post-publish` | `post/publish` | Publish a post to one or more channels (includes first comment, plugs, repeats, webhooks) |
| `autopost-process` | `autopost/process` | Recurring autopost schedules |
| `refresh-token` | `integration/refresh-token` | Refresh OAuth tokens before expiry |
| `streak-tracker` | `streak/start` | Update posting-streak gamification |
| `analytics-backfill` | `analytics/backfill` | On-demand historical backfill |
| `send-email` | `email/send` | Transactional email delivery |
| `digest-email` | `email/digest` | Digest email delivery |
| `media-jobs-poll` | cron (every minute) | Poll external media-generation jobs to completion |

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
| `EMAIL_LOG_RETENTION_DAYS` | 90 days | Email log metadata pruned after this age (see [Configuration](./configuration.md#email-v381)) |
| `COMMENTS_SWEEP_INTERVAL_MINUTES` | 30 minutes | Interval between comment collection sweeps |

## Local development

Start the Inngest dev server:

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

The dev server UI is available at `http://localhost:8288`. Run the backend with `INNGEST_DEV=1` and `INNGEST_BASE_URL=http://localhost:8288`.

## Verifying jobs

In the Inngest dashboard (Cloud or local dev server) you should see:

- `analytics-collection` — one scheduled run per day
- `comments-collection` — every minute (then sleeps 30 minutes between sweeps)
- `missing-post-finder` — hourly
- `media-jobs-poll` — every minute
- `post-publish` / `autopost-process` / `refresh-token` / `streak-tracker` / `send-email` / `digest-email` / `analytics-backfill` — as triggered

If scheduled functions are not running, check that `USE_INNGEST=true` is set and the backend `/api/inngest` endpoint returns HTTP 200.

## Agent digest

The weekly agent digest (`agent-digest` → `agent/digest-org`) is **disabled by
default**.

| Variable | Purpose |
|----------|---------|
| `AGENT_DIGEST_ENABLED` | Set to `true` to enable the Monday 07:00 ET agent digest cron. |

Behaviour:

- The main cron fans out one `agent/digest-org` event per organisation.
- The per-org handler (`concurrency: 2`) runs only if at least one organisation
  member has enabled the **Agent briefs** notification category in
  Settings → Notifications.
- The run is skipped if the organisation's AI budget is exhausted.
- The agent runs in **headless, read-only mode** (`access.mode: 'headless'`):
  it can only call analytics/comments/read tools and cannot schedule posts or
  create media jobs.
- A finished digest creates a thread and sends an in-app notification linking to
  `/agents/<threadId>`.

Enable in `.env`:

```bash
AGENT_DIGEST_ENABLED=true
```

> Verified against v3.9.0

# Errors & Stats

Two super-admin diagnostic screens: a log of captured integration/posting errors, and instance
usage statistics.

> **Verified against v3.5.10.** Both are super-admin only — the backing endpoints reject any
> non-super-admin request.

---

## View Errors — `/admin/errors`

A browsable log of errors captured from posting and integration operations, useful for diagnosing
why a channel or post failed.

Backing endpoints:

- `GET /admin/errors` — paginated list. Query parameters:
  - `page`, `limit` — pagination (defaults: page `0`, limit `20`).
  - `platform` — filter to a specific provider.
  - `email` — filter to a specific user.
  - `unknownFirst` — surface errors not yet attributed to a known platform first.
- `GET /admin/errors/platforms` — the set of platforms that have recorded errors (to populate the
  platform filter).

Each row also offers two actions (v3.5.10):

- **Retry** — `POST /admin/errors/:id/retry` re-queues the errored post into the publish workflow
  (reuses `changePostStatus(... 'schedule')`) and then clears the error from the log.
- **Resolve** — `DELETE /admin/errors/:id` dismisses a handled error from the log.

Use this to spot, for example, a provider whose tokens are failing to refresh or a recurring API
rejection on a particular channel — then retry the affected post or resolve the entry once handled.

## View Stats — `/admin/stats`

Instance-level usage statistics over a date range.

Backing endpoint:

- `GET /admin/stats` — query parameters:
  - `from`, `to` — date range bounds.
  - `unknownOnly` — restrict to unattributed/unknown records.

## Related

- Per-channel and per-post **analytics** (views/likes/comments, comparisons, charts) are a separate,
  user-facing feature — see [Analytics](../features/analytics.md), not this screen.
- Queue inspection for background jobs is available via the Temporal UI — see
  [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

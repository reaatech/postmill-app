# Errors & Stats (Deprecated in v3.6.0)

> The `/admin/errors` and `/admin/stats` super-admin pages were removed
> in v3.6.0. All admin functionality moved to per-tenant settings tabs. Error tracking and diagnostics
> are currently limited to looking at logs or the Temporal UI for background job status.

---

## Error Monitoring (Removed)

The error diagnostic page at `/admin/errors` is no longer available. In v3.5.10 and earlier, it
provided:

- A browsable log of captured integration/posting errors.
- Filter by platform (provider) or user.
- Retry and resolve actions on individual errors.

**Workaround:** Monitor logs for error messages or use the Temporal UI to inspect failed workflows.

## Stats & Usage (Removed)

The usage stats page at `/admin/stats` is no longer available. In v3.5.10 and earlier, it showed
instance-level usage across a date range.

**Workaround:** Each organization can view their own analytics in **Settings → Analytics**. For
cross-organization statistics, query the database directly or use per-organization analytics APIs.

## Related

- Per-channel and per-post **analytics** (views/likes/comments, comparisons, charts) are a separate,
  user-facing feature — see [Analytics](../features/analytics.md), not this screen.
- Queue inspection for background jobs is available via the Temporal UI — see
  [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

# Bulk Scheduling / CSV Import

Bulk scheduling lets you create many scheduled posts at once — upload a CSV or paste rows — instead
of composing them one by one.

---

## What it does

- **Upload a CSV or paste rows** — each row is a post: content, channel(s), schedule time, optional
  media URL, and optional campaign.
- **Per-row results** — the server validates each row independently and returns
  success / warnings / errors **per row** without failing the whole batch.
- **Shared creation logic** — rows go through the same post-creation logic as the normal composer,
  so behavior and validation match a hand-composed post.
- **Preflight** — each row is checked against the same [content QA preflight](./content-qa-preflight.md)
  rules (platform limits, media formats, link checks, first-comment/poll compatibility, etc.).
- **Campaign targeting** — an import can optionally target a [campaign](./campaigns.md) so all its
  posts land in one folder.

## Where you see it

A **bulk import** flow in the composer — upload + column mapping + a preview of parsed rows before
you commit, with the per-row results shown after submission.

## API surface

| Endpoint | Purpose |
|----------|---------|
| `POST /posts/bulk` | Create many posts from validated rows; returns per-row success / warnings / errors. |
| `POST /posts/preflight` | Run the preflight checks (shared with the composer). |

Rows are validated against a `BulkCreatePostsDto`, so malformed input is rejected rather than
silently dropped.

## Related

- [Content QA preflight](./content-qa-preflight.md) — the checks each row runs through.
- [Campaigns](./campaigns.md) — group an import's posts under one campaign.
- [Calendar & Post Detail](./calendar-and-posts.md) — where imported posts appear once scheduled.

# Campaigns

Campaigns let you group scheduled and published posts (and, transitively, their media, analytics,
and comments) into named folders so you can plan and review work by initiative rather than as one
flat calendar.

> **Verified against v3.5.0.** Introduced in v3.5.0.

---

## What it does

- **Group posts by campaign** — organize scheduled and published posts under a named campaign.
- **Tinting** — each campaign can carry a color for calendar/badge tinting.
- **Scoped review** — because posts carry a campaign, their media, analytics, and comments are
  reviewable per campaign (grouping derives transitively through the post for v3.5.0).
- **Optional everywhere** — campaigns are opt-in; posts without one behave exactly as before.

## Where you see it

A **Campaigns** entry in the top navigation opens the campaigns view, where you create, edit, and
archive campaigns. In the composer (and in [bulk import](./bulk-scheduling.md)) you can optionally
select a campaign for the post(s) you're creating.

## Data model

Campaigns are additive and db-push-safe:

- A new **`Campaign`** table (`organizationId`, `name`, optional `color` / `description` /
  `startDate` / `endDate`, `archived`, soft-delete `deletedAt`).
- A **nullable `campaignId`** column on `Post`. Existing posts stay `NULL` — no destructive diff and
  no backfill required.

For v3.5.0, media / analytics / comments are grouped **through the post's `campaignId`** rather than
carrying their own foreign key.

## API surface

| Endpoint | Purpose |
|----------|---------|
| `GET /campaigns` | List campaigns for the org. |
| `GET /campaigns/:id` | Fetch one campaign. |
| `POST /campaigns` | Create a campaign. |
| `PUT /campaigns/:id` | Update a campaign. |
| `DELETE /campaigns/:id` | Delete (soft-delete) a campaign. |

## Related

- [Calendar & Post Detail](./calendar-and-posts.md) — where campaign-tagged posts appear.
- [Bulk scheduling / CSV import](./bulk-scheduling.md) — import many posts into a campaign at once.

# Provider Capabilities

A central **provider capability matrix** declares what each channel can do. It is the single source
of truth that the composer and admin UI read to hide or disable controls a provider can't support,
and that capability-gated features (first comment, polls, comments, watchlist) check against.

---

## The capabilities

Each provider declares the following flags:

| Capability | Meaning |
|------------|---------|
| `analytics` | Reports metrics into the persisted [analytics](./analytics.md) dashboard. |
| `comments` | Syncs platform comments (`ISocialMediaComments`). |
| `firstComment` | Supports auto-posting a [first comment](./social-comments.md) after publish. |
| `poll` | Supports [poll posts](../channels/overview.md) (2–4 options + duration). |
| `video` | Accepts video media. |
| `carousel` | Supports multi-image carousels. |
| `altText` | Accepts alt text on media. |
| `maxMedia` | Maximum number of media attachments. |
| `linkPreview` | Supports link previews. |
| `refreshToken` | Uses refreshable OAuth tokens. |
| `watchlist` | Can be probed for public [watchlist](./watchlist.md) metrics. |

## How it's used

- **Composer gating** — controls are hidden or disabled where the provider doesn't declare the
  capability. The "Add poll" toggle, the first-comment textarea, alt-text fields, and media-count
  limits all read the matrix, so users only see what a channel can actually do.
- **Admin matrix view** — an admin can view the full per-provider matrix to see at a glance what each
  channel supports.
- **Feature gating** — first comment (per-channel), polls (X / LinkedIn), comment sync, and the
  watchlist all check the matrix rather than reinventing ad-hoc per-feature gating.

## API surface

| Endpoint | Purpose |
|----------|---------|
| `GET /provider-capabilities` | The capability matrix for the composer/UI. |
| `GET /admin/provider-capabilities` | The admin matrix view. |

## Related

- [Channels overview](../channels/overview.md) — the capability sections per feature.
- [Comments support](../channels/comments.md) — the `comments` flag in practice.
- [Social comments](./social-comments.md) · [Watchlist](./watchlist.md) ·
  [Content QA preflight](./content-qa-preflight.md) — features that read the matrix.

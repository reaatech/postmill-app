# Tumblr, Pixelfed & PeerTube

These three providers were added in **v3.2.0**, bringing the channel count to 36. No database
migration was required to add them.

> Configure all three in [Channels admin](../admin/channels.md).

---

## Tumblr

- **Auth:** global OAuth2 redirect, the same pattern as Mastodon/X. Credentials via admin
  `ProviderConfiguration` or the `TUMBLR_CLIENT_ID` / `TUMBLR_CLIENT_SECRET` environment variables.
  Token refresh is supported.
- **Posting:** NPF (Neue Post Format) posts with multipart image/video media.
- **Formatting:** posts are written as plain text. NPF expresses formatting through separate index
  ranges rather than HTML, so the composer uses a plain-text editor — markup is not passed through
  as raw tags. Media-only posts (no caption) omit the text block, which Tumblr requires.
- **Comments:** the composer sets comments off; Tumblr comments/reblogs are not synced.

## Pixelfed

- **Auth:** custom instance fields — the user supplies their **instance URL** and a **personal
  access token**.
- **API:** Mastodon-compatible REST API.
- **Posting:** image posts (up to 10 images). Posts may allow comments on-platform, but Pixelfed
  comments are not synced into the app.

## PeerTube

- **Auth:** custom instance fields — **instance URL**, **username**, and **password**. A
  password-grant token is re-derived per operation rather than relying on a stored token.
- **Posting:** single-video uploads (`.mp4`).
- **Limits:** very large videos can exceed the activity window for resumable upload; keep videos
  within a reasonable size.

## Notes & known follow-ups

These were intentionally left out of the initial provider work and may be addressed later:

- Analytics hooks for these three providers (they don't yet feed the analytics snapshots).
- PeerTube resumable upload for videos beyond the upload activity window.
- Tumblr comments/reblogs.

For the synced-comments capability matrix across all providers, see [Comments support](./comments.md).

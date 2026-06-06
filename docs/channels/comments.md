# Comments Support

Some providers implement the `ISocialMediaComments` capability, which lets the app sync platform
comments into the [Post Detail](../features/calendar-and-posts.md) view and the
[Social comments](../features/social-comments.md) feature. This page lists which providers support
it and what each can do.

> **Verified against v3.4.0.** Derived from the provider implementations of `fetchComments` /
> `replyToComment` / `likeComment`.

---

## Capability matrix

Providers expose a `commentsCapabilities` object with `read`, `reply`, and `like` flags. The
providers that implement comment sync are:

| Provider | Read (fetch) | Reply | Like |
|----------|:---:|:---:|:---:|
| X | ✅ | depends on capability flags | depends on capability flags |
| Facebook | ✅ | … | … |
| Instagram | ✅ | … | … |
| Instagram (standalone) | ✅ | … | … |
| LinkedIn | ✅ | … | … |
| Mastodon | ✅ | … | … |
| Reddit | ✅ | … | … |
| Threads | ✅ | … | … |
| YouTube | ✅ | … | … |
| Bluesky | ✅ | … | … |

> The exact reply/like support per provider is declared by each provider's `commentsCapabilities`
> flags. The UI reads those flags and only shows reply/like actions where the provider declares
> them, so the experience is capability-aware rather than assumed.

## Providers without comment sync

All other channels — including the fork-added **Pixelfed** and **PeerTube** — do **not** implement
comment sync in this fork. Posts on those platforms may still allow comments natively; they're just
not pulled into the app. See [Tumblr, Pixelfed & PeerTube](./tumblr-pixelfed-peertube.md).

## How sync runs

Comment collection is a Temporal workflow gated by `RUN_CRON=true` on one orchestrator instance.
Comments are stored with per-user read state. See:

- [Social comments](../features/social-comments.md) — the feature and its endpoints.
- [Temporal & background jobs](../self-hosting/temporal-and-cron.md) — how/when sync runs.

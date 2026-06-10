# Channels Overview

This fork supports **36 channels**. Providers are registered in the integration manager and offered
to users based on what has been enabled in **Settings → Channels**.

> The count and capability notes below are taken from the provider
> registrations and the central capability matrix in the codebase.

---

## The 36 providers

| Category | Providers |
|----------|-----------|
| Major social | X, LinkedIn, LinkedIn Page, Facebook, Instagram, Instagram (standalone), Threads, Reddit, Pinterest, TikTok, YouTube, Bluesky, Mastodon |
| Chat / community | Discord, Slack, Telegram, Lemmy, VK, MeWe, Whop, Skool |
| Streaming / media | Twitch, Kick, Dribbble, Google Business Profile (GMB) |
| Decentralized | Farcaster, Nostr |
| Blogging / publishing | Medium, Dev.to, Hashnode, WordPress, Moltbook |
| Newsletter | Listmonk |
| **Fork-added (v3.2.0)** | **Tumblr, Pixelfed, PeerTube** |

> A Mastodon-custom-instance provider exists in the code but is not currently registered.

See [Tumblr, Pixelfed & PeerTube](./tumblr-pixelfed-peertube.md) for the fork-added providers.

## Authentication models

Providers authenticate in one of a few ways, configured per provider in
**Settings → Channels**:

- **Global OAuth redirect** — a single app's client ID/secret (e.g. X, Mastodon, Tumblr).
- **Custom instance fields** — the user supplies an instance URL plus a token or login (e.g.
  Pixelfed, PeerTube, custom Mastodon).
- **Bot tokens / API keys** — e.g. Telegram, Listmonk.
- **Browser extension (cookie-based)** — e.g. Skool, via the extension app.

Credentials are configured per-tenant in **Settings → Channels** (encrypted in the database).
See [Per-provider setup](./setup-per-provider.md) for how to create each provider's app/credentials
(identifiers, scopes, redirect URLs).

## Provider capabilities

What each provider can do — analytics, comments, first comment, polls, video, carousel, alt text,
max media, link preview, refresh token, and watchlist — is declared in a central **provider
capability matrix**. The composer and admin UI read it to hide or disable controls a provider can't
support, and it is the **source of truth** for the capability-gated features below. See
[Provider capabilities](../features/provider-capabilities.md).

### Comment sync capability

A subset of providers implement the `ISocialMediaComments` capability, which lets the app sync
platform comments into the Post Detail view and the cross-channel inbox and (where supported) reply
or like. v3.5.0 adds comment sync to Discord, Telegram, Slack, WordPress, dev.to, Hashnode, Medium,
and TikTok. See [Comments support](./comments.md) for the exact list and per-capability matrix.

### First comment

On providers whose matrix sets `firstComment`, the composer offers a **first comment** that is
auto-posted after the post publishes. See [Social comments](../features/social-comments.md).

### Polls

X and LinkedIn (profile and page) support **poll posts** (2–4 options with a duration). The "Add
poll" control is gated on the provider's `poll` capability. See
[Provider capabilities](../features/provider-capabilities.md).

### Analytics capability

Providers that report metrics feed the persisted analytics dashboard via daily snapshots. See
[Analytics](../features/analytics.md) and
[Temporal & background jobs](../self-hosting/temporal-and-cron.md) for how collection works.

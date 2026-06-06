# Channels Overview

This fork supports **36 channels**. Providers are registered in the integration manager and offered
to users based on what a super-admin has enabled in [Channels admin](../admin/channels.md).

> **Verified against v3.4.0.** The count and capability notes below are taken from the provider
> registrations and capability interfaces in the codebase.

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
[Channels admin](../admin/channels.md):

- **Global OAuth redirect** — a single app's client ID/secret (e.g. X, Mastodon, Tumblr).
- **Custom instance fields** — the user supplies an instance URL plus a token or login (e.g.
  Pixelfed, PeerTube, custom Mastodon).
- **Bot tokens / API keys** — e.g. Telegram, Listmonk.
- **Browser extension (cookie-based)** — e.g. Skool, via the extension app.

Credential reads check the database (admin-configured, encrypted) first, then fall back to
environment variables. See [Channels admin](../admin/channels.md) for the resolution rules, and
[Per-provider setup](./setup-per-provider.md) for how to create each provider's app/credentials
(identifiers, scopes, redirect URLs).

## Comment sync capability

A subset of providers implement the `ISocialMediaComments` capability, which lets the app sync
platform comments into the Post Detail view and (where supported) reply or like. See
[Comments support](./comments.md) for the exact list and per-capability matrix.

## Analytics capability

Providers that report metrics feed the persisted analytics dashboard via daily snapshots. See
[Analytics](../features/analytics.md) and
[Temporal & background jobs](../self-hosting/temporal-and-cron.md) for how collection works.

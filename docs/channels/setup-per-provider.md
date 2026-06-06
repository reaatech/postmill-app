# Per-Provider Setup

How to create the developer app / credentials for each channel and what to enter in
[Channels admin](../admin/channels.md). Scopes, identifiers, and credential keys below are taken
from the provider implementations.

> **Verified against v3.4.0.** 36 providers. Configure credentials in the admin UI (encrypted at
> rest) or via the equivalent environment variables — the admin UI takes precedence.

---

## How channel auth works here

Most providers use an **OAuth redirect**: you register an app on the platform, give it a redirect
(callback) URL pointing back at your Postiz instance, and enter the app's client ID/secret in
[Channels admin](../admin/channels.md). Users then click "Add channel" and authorize.

A few providers don't use a global app — instead the **user** supplies an instance URL plus a token
or login (Mastodon-compatible servers, PeerTube, etc.), or you provide a single API key / bot token.

### The redirect / callback URL

For OAuth providers, the callback URL Postiz expects is:

```
<FRONTEND_URL>/integrations/social/<identifier>
```

Use the provider's `identifier` from the tables below. For example, with
`FRONTEND_URL=https://social.example.com`:

- X → `https://social.example.com/integrations/social/x`
- LinkedIn → `https://social.example.com/integrations/social/linkedin`
- Tumblr → `https://social.example.com/integrations/social/tumblr`

Register that exact URL as an allowed redirect/callback in the provider's developer console.

> **Tip:** the admin UI also has a per-provider **setup instructions** field — put your org-specific
> notes (which app, who owns it) there for the users who connect channels.

---

## OAuth-app providers

Register an app on the platform, set the redirect URL (`…/integrations/social/<identifier>`), and
enter the client ID/secret. The **credentials** column lists the environment-variable equivalents;
in the admin UI these map to the client ID / client secret fields.

### X (Twitter)

- **Identifier:** `x` · **Register at:** X Developer Portal (OAuth 1.0a app).
- **Credentials:** `X_API_KEY`, `X_API_SECRET` (and optional `X_URL` for a custom base).
- **Redirect:** `…/integrations/social/x`.

### LinkedIn (profile) & LinkedIn Page

- **Identifiers:** `linkedin`, `linkedin-page` · **Register at:** LinkedIn Developers.
- **Credentials:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (shared by both).
- **Scopes:** `openid`, `profile`, `w_member_social`, `r_basicprofile`, `rw_organization_admin`,
  `w_organization_social`, `r_organization_social`.
- **Redirect:** `…/integrations/social/linkedin` and `…/integrations/social/linkedin-page`.

### Reddit

- **Identifier:** `reddit` · **Register at:** Reddit apps (web app).
- **Credentials:** `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`.
- **Scopes:** `read`, `identity`, `submit`, `flair`.

### Meta family — Facebook, Instagram, Threads

Facebook and Instagram (Business) share one Meta app; Threads and standalone Instagram use their
own app IDs.

| Provider | Identifier | Credentials | Scopes (key ones) |
|----------|-----------|-------------|-------------------|
| Facebook Page | `facebook` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | `pages_show_list`, `pages_manage_posts`, `pages_manage_engagement`, `pages_read_engagement`, `read_insights`, `business_management` |
| Instagram (Facebook Business) | `instagram` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management` |
| Instagram (Standalone) | `instagram-standalone` | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights` |
| Threads | `threads` | `THREADS_APP_ID`, `THREADS_APP_SECRET` | `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_manage_insights`, `threads_profile_discovery` |

Register at the Meta Developers console; add the matching redirect URLs.

### Google family — YouTube, Google Business Profile

| Provider | Identifier | Credentials | Scopes (key ones) |
|----------|-----------|-------------|-------------------|
| YouTube | `youtube` | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | `youtube`, `youtube.upload`, `youtube.force-ssl`, `youtube.readonly`, `yt-analytics.readonly`, `youtubepartner`, plus `userinfo.profile`/`email` |
| Google My Business | `gmb` | `GOOGLE_GMB_CLIENT_ID`, `GOOGLE_GMB_CLIENT_SECRET` (falls back to `YOUTUBE_CLIENT_ID/SECRET`) | `business.manage`, `userinfo.profile`, `userinfo.email` |

Register an OAuth 2.0 client in Google Cloud Console; enable the YouTube Data/Analytics APIs (for
YouTube) and the Business Profile API (for GMB); add the redirect URLs.

### TikTok

- **Identifier:** `tiktok` · **Register at:** TikTok for Developers.
- **Credentials:** `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`.
- **Scopes:** `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`,
  `video.upload`, `video.publish`.

### Pinterest

- **Identifier:** `pinterest` · **Register at:** Pinterest Developers.
- **Credentials:** `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`.
- **Scopes:** `boards:read`, `boards:write`, `pins:read`, `pins:write`, `user_accounts:read`.

### Dribbble

- **Identifier:** `dribbble` · **Register at:** Dribbble Developer apps.
- **Credentials:** `DRIBBBLE_CLIENT_ID`, `DRIBBBLE_CLIENT_SECRET`.
- **Scopes:** `public`, `upload`.

### Mastodon (mastodon.social or a default instance)

- **Identifier:** `mastodon` · **Register at:** your Mastodon instance's app settings.
- **Credentials:** `MASTODON_CLIENT_ID`, `MASTODON_CLIENT_SECRET`, `MASTODON_URL` (default
  `https://mastodon.social`).
- **Scopes:** `read:statuses`, `write:statuses`, `write:media`, `profile`.
- For arbitrary user-supplied instances, see **M. Instance** under instance-based providers.

### Tumblr

- **Identifier:** `tumblr` · **Register at:** Tumblr OAuth applications.
- **Credentials:** `TUMBLR_CLIENT_ID`, `TUMBLR_CLIENT_SECRET`. Token refresh supported.
- **Scopes:** `basic`, `write`, `offline_access`.
- See [Tumblr, Pixelfed & PeerTube](./tumblr-pixelfed-peertube.md) for posting specifics.

### Twitch

- **Identifier:** `twitch` · **Register at:** Twitch Developer console.
- **Credentials:** `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.
- **Scopes:** `user:write:chat`, `user:read:chat`, `moderator:manage:announcements`.

### Kick

- **Identifier:** `kick` · **Register at:** Kick developer settings.
- **Credentials:** `KICK_CLIENT_ID`, `KICK_SECRET`.
- **Scopes:** `chat:write`, `user:read`, `channel:read`.

### Slack

- **Identifier:** `slack` · **Register at:** Slack API (create an app).
- **Credentials:** `SLACK_ID`, `SLACK_SECRET` (and `SLACK_SIGNING_SECRET`).
- **Scopes:** `channels:read`, `channels:join`, `chat:write`, `chat:write.customize`,
  `groups:read`, `users:read`.

### Discord

- **Identifier:** `discord` · **Register at:** Discord Developer Portal (bot application).
- **Credentials:** `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN_ID`.
- **Scopes:** `bot`, `identify`, `guilds` (the bot is invited to the server).

---

## Instance-based providers (user supplies the server)

These have **no global app to register**. When a user adds the channel, they enter the connection
details directly (the admin UI may not need provider credentials at all). The user-entered fields
are listed.

| Provider | Identifier | User enters |
|----------|-----------|-------------|
| Bluesky | `bluesky` | Service URL, identifier (handle), app password. |
| Mastodon instance ("M. Instance") | `mastodon-custom` | Instance URL (`MASTODON_URL` as default). |
| Pixelfed | `pixelfed` | Instance URL, access token. |
| PeerTube | `peertube` | Instance URL, username, password. |
| Lemmy | `lemmy` | Service URL, identifier, password. |
| WordPress | `wordpress` | Domain URL, username, password. |
| Nostr | `nostr` | Nostr private key. |
| Listmonk | `listmonk` | URL, username, password. |

> For Bluesky use an **app password**, not your account password. For PeerTube the password-grant
> token is re-derived per operation. See [Tumblr, Pixelfed & PeerTube](./tumblr-pixelfed-peertube.md)
> for the two fork-added instance providers.

---

## API-key / token providers

A single key or token, entered once.

| Provider | Identifier | Credential | Where to get it |
|----------|-----------|-----------|-----------------|
| Telegram | `telegram` | `TELEGRAM_TOKEN` (bot token) | Create a bot via BotFather. |
| Dev.to | `devto` | API key (user-entered) | Dev.to account settings → API keys. |
| Hashnode | `hashnode` | API key (user-entered) | Hashnode developer settings. |
| Medium | `medium` | API key (user-entered) | Medium integration tokens. |
| MeWe | `mewe` | `MEWE_API_KEY`, `MEWE_APP_ID`, `MEWE_HOST` | MeWe app credentials. |
| VK | `vk` | `VK_ID` | VK app id. |
| Whop | `whop` | `WHOP_CLIENT_ID` | Whop app. |
| Moltbook | `moltbook` | (self-service / web) | — |

---

## Special integrations

- **Farcaster** (`wrapcast`) — uses **Neynar**: `NEYNAR_CLIENT_ID`, `NEYNAR_SECRET_KEY`.
- **Skool** (`skool`) — cookie-based via the **browser extension** (`EXTENSION_ID`), not an OAuth
  app. See the extension app.

---

## After configuring a provider

1. Enable it in [Channels admin](../admin/channels.md) and enter the credentials above.
2. Add your org-specific notes in the provider's **setup instructions** field.
3. Have a user open **Add channel** and authorize.

> Disabling a provider later only blocks **new** connections — already-connected channels keep
> working. See [Channels admin](../admin/channels.md). For which providers sync comments, see
> [Comments support](./comments.md).

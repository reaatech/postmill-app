# Provider Capabilities

Each social media provider in Postmill declares its supported feature set through a capability
matrix. This matrix is the single source of truth for what each provider can do — the composer UI,
admin settings, preflight validation, and workflow logic all gate on these values.

The canonical source is `PROVIDER_CAPABILITIES` in
`libraries/nestjs-libraries/src/integrations/social/provider-capabilities.ts`.

## Capability Column Descriptions

| Column | Description |
|--------|-------------|
| `analytics` | Provider supports fetching analytics data (profile/follower metrics, post engagement) |
| `comments` | Provider supports fetching and replying to platform comments via `ISocialMediaComments` |
| `firstComment` | Supports auto-posting a first comment immediately after a successful publish (workflow v1.0.6) |
| `poll` | Supports poll-style posts with options and duration |
| `video` | Supports video media attachments |
| `carousel` | Supports multi-image carousel posts |
| `altText` | Supports alt text descriptions on image attachments |
| `maxMedia` | Maximum number of media attachments per post (0 = no media support) |
| `linkPreview` | Supports link preview / link-card rendering |
| `refreshToken` | Supports OAuth refresh token rotation |
| `watchlist` | Supports competitor account probing (public metric collection for watched accounts) |

## Full Capability Matrix

| Provider | analytics | comments | firstComment | poll | video | carousel | altText | maxMedia | linkPreview | refreshToken | watchlist |
|---|---|---|---|---|---|---|---|---|---|---|---|
| X | true | true | true | true | true | false | false | 4 | true | true | true |
| LinkedIn | true | true | true | true | true | true | false | 20 | false | true | false |
| LinkedIn Page | true | true | true | true | true | true | false | 20 | false | true | false |
| Reddit | false | true | true | false | true | false | false | 1 | false | true | false |
| Instagram | true | true | true | false | true | true | false | 10 | false | true | true |
| Instagram Standalone | true | true | true | false | true | true | false | 10 | false | true | true |
| Facebook | true | true | true | false | true | false | false | 10 | false | true | false |
| Threads | true | true | true | false | true | true | false | 10 | false | true | false |
| YouTube | true | true | false | false | true | false | false | 1 | false | true | true |
| Google My Business | true | false | false | false | false | false | false | 1 | false | true | false |
| TikTok | true | true | false | false | true | false | false | 1 | false | true | true |
| Pinterest | true | false | false | false | true | false | false | 5 | false | true | false |
| Dribbble | true | false | false | false | false | false | false | 1 | false | true | false |
| Discord | false | true | true | false | false | false | false | 10 | false | true | false |
| Slack | false | true | true | false | false | false | true | 10 | false | false | false |
| Kick | false | false | true | false | false | false | false | 0 | false | false | false |
| Twitch | false | false | true | false | false | false | false | 0 | false | true | false |
| Mastodon | false | true | true | false | true | false | true | 4 | false | false | false |
| Bluesky | false | true | true | false | true | false | true | 4 | false | false | false |
| Lemmy | false | false | true | false | false | false | false | 1 | false | false | false |
| Farcaster | false | false | true | false | false | false | false | 4 | false | false | false |
| Telegram | false | true | true | false | true | false | false | 10 | false | false | false |
| Nostr | false | false | true | false | false | false | false | 0 | false | false | false |
| VK | false | false | true | false | true | false | false | 10 | false | false | false |
| Medium | false | true | false | false | false | false | false | 0 | false | false | false |
| Dev.to | false | true | false | false | false | false | false | 0 | false | false | false |
| Hashnode | false | true | false | false | false | false | false | 0 | false | false | false |
| WordPress | false | true | false | false | true | false | false | 10 | false | false | false |
| ListMonk | false | false | false | false | false | false | false | 0 | false | false | false |
| Moltbook | false | false | true | false | false | false | false | 0 | false | false | false |
| Whop | false | false | true | false | false | false | false | 0 | false | false | false |
| Skool | false | false | true | false | false | false | false | 10 | false | false | false |
| MeWe | false | false | false | false | true | false | false | 10 | false | false | false |
| Tumblr | false | false | false | false | true | false | true | 10 | false | true | false |
| Pixelfed | false | false | true | false | false | false | true | 10 | false | false | false |
| PeerTube | false | false | true | false | true | false | false | 1 | false | false | false |

## Summary

**poll** — Only 3 providers support polls: X, LinkedIn, and LinkedIn Page.

**carousel** — 5 providers support carousel posts: LinkedIn, LinkedIn Page, Instagram, Instagram Standalone, and Threads.

**altText** — 5 providers support alt text on images: Slack, Mastodon, Bluesky, Tumblr, and Pixelfed.

**analytics** — 12 providers support analytics data collection: X, LinkedIn, LinkedIn Page, Instagram, Instagram Standalone, Facebook, Threads, YouTube, Google My Business, TikTok, Pinterest, and Dribbble.

**watchlist** — 5 providers support competitor account probing: X, Instagram, Instagram Standalone, YouTube, and TikTok.

**linkPreview** — Only X supports link preview / link-card rendering.

**comments** — 21 providers support fetching and replying to platform comments.

**firstComment** — 24 providers support auto-posting a first comment after publish.

**refreshToken** — 16 providers support OAuth refresh token rotation.

## See Also

- [Adding a Provider](../developer-docs/adding-a-provider.md) — How to register capability flags when adding a new channel provider.

> Verified against v3.7.0

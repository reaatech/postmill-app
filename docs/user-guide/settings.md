# Settings

The Settings page at `/settings` is the control centre for your organisation and personal
account. Each tab manages a distinct aspect of your Postmill instance. Tabs are sorted
alphabetically with **General** (or **Settings** on some layouts) pinned first.

## Settings tab

The standalone Settings tab was removed in v3.8.8. The auto-shortlink preference (ASK / YES / NO)
is no longer shown in Settings at all since v3.8.10 — the shorten-links choice is applied in the
composer flow.

> **Profile is now accessed from the user avatar menu** in the top navigation bar — not from a
> settings tab. Click your avatar to find the Profile link alongside Settings and Logout. The
> settings gear icon was removed from the header; all settings pages are reached through the
> avatar menu.

## Your profile (`/user/me`)

The profile page (avatar menu → Profile) has three tabs:

- **Profile** — name, last name, bio, profile picture, and your **timezone** (IANA zone, used to
  display schedule dates and the composer's time picker). Your avatar resolves in this order:
  external avatar (your OAuth login provider's picture, or a **Gravatar** generated from your
  email — refreshed on login) → uploaded profile picture → your initials.
- **Security** — change your password, and an **Active Sessions** device list (browser, IP, last
  used). Revoke any session individually, or log out all other sessions at once. Logging out
  revokes all of your sessions.
- **Notifications** — email notification preferences (success / failure / streak emails).

## Teams tab

Available when your subscription tier includes team members. Manage who has access to your
organisation:

- **Invite members** — send email invitations. Invited users receive a registration link.
- **Roles (v3.8.10)** — membership is governed by a full role-based access control (RBAC) system.
  Five system roles are seeded for every organisation:

  | Role | What it can do |
  |------|----------------|
  | **Owner** | Everything in the org, including billing and member management. The user who created the org is the owner. |
  | **Admin** | Everything except billing management and deleting the organisation. |
  | **Editor** | Full control of posts, media, and comments; read access to channels, analytics, and brands. |
  | **Member** | Create, read, and update posts; upload and view media; read analytics, comments, and brands. |
  | **Viewer** | Read-only access to all resources. |

  The team screen's role selector lists every role in the org — the five system roles plus any
  custom roles. A member who lacks a permission receives **HTTP 403** on the gated action
  (distinct from a 402, which means your plan doesn't include the feature).
- **Custom roles** — the Workspace → **Roles** tab (visible to members with `members:manage` or
  `settings:update`) lets an admin clone a system role, toggle individual permissions grouped by
  resource, create/edit/delete custom roles (system roles can't be deleted), and assign a role to
  a team member.
- **Datatable** — the team list shows each member's name, email, role, and join date. Role
  changes and member removal are available from the per-row controls to members holding
  `members:manage`; only the owner can change or remove another owner.

## Channels tab

Connect and manage social media and chat channels.

### Connecting providers

Each channel provider supports OAuth authentication. Click a provider row to expand its
configuration:

- Enter your own OAuth app credentials (Client ID, Client Secret) if using custom apps.
- For providers that support it, use the platform's default OAuth flow to connect.
- Each configured provider shows an **Active**, **No Credentials**, or **Disabled** status badge.

### Channel configuration

Provider credentials are stored per-organisation in `OrgProviderConfiguration` records and
encrypted at rest (AES-256-GCM). You can:

- **Edit credentials** — update Client ID, Client Secret, scopes, and redirect URI for any
  configured provider.
- **Test connection** — validate that your credentials work by generating an auth URL.
- **Clear credentials** — remove stored OAuth data for a provider, disconnecting all channels
  of that type.

### Connection health status

Below the provider list, a **Connection Status** table shows every connected channel:

| Status | Meaning |
|--------|---------|
| **Connected** | Channel is healthy and ready to publish. |
| **Token Expired** | OAuth token has expired. Reconnect the channel. |
| **Refresh Needed** | Token requires a refresh cycle. Click **Reconnect**. |
| **Disabled** | Channel has been manually disabled or the provider is turned off. |

### Provider capabilities panel

A reference matrix below the connection status shows what each provider supports. Capabilities
include: analytics, comments, first comment, polls, video, carousel, alt text, max media count,
link preview, and refresh token support. Use this to understand feature availability per channel
before composing posts.

## Shortlinks tab

Configure and manage short-link providers per organisation. Short links are used to shorten URLs
in published posts.

- **Provider list (v3.8.10 redesign)** — the tab mirrors the AI settings page: provider cards
  with real brand icons, configured/active badges, and per-row **Configure / Set Active / Remove**
  actions. 19 supported providers: Bitly, TinyURL, T.LY, Short.io, Rebrandly, Dub.co, Cutt.ly,
  Tiny.cc, is.gd, v.gd, BL.INK, T2M, Linkly, Replug, Switchy, PixelMe, Sniply, Ow.ly, CleanURI.
- **Multiple accounts per provider (v3.8.10)** — you can add several accounts of the same
  provider (e.g. two Bitly accounts), each with its own display **name**. Adding the *same*
  account twice is rejected (accounts are fingerprinted from their credentials).
- **One active at a time** — only one short-link account can be active per organisation. Switching
  automatically deactivates the previous one.
- **Single-step configuration** — OAuth where the provider offers it (e.g. Bitly), otherwise API
  keys. No second step.
- **Custom domains** — if your selected provider supports custom (branded) domains, enter the domain
  in the configuration panel.
- **Credentials** — API keys or tokens are stored encrypted at rest in `OrgShortLinkConfig` and
  never sent to the browser.
- **Test connection** — validate that the configured credentials and domain are working before
  publishing.
- **Shortlink preference** — the ASK / YES / NO preference card was removed from Settings in
  v3.8.10; the shorten-links choice is applied in the composer flow when you post.
- **Link ledger** — every generated short link is recorded in the `ShortLink` table for analytics
  tracking and deduplication.

### Per-provider credential fields

| Provider | Auth Type | Credential Fields | Where to get them |
|----------|-----------|-------------------|-------------------|
| Bitly | OAuth2 / API Key | Access Token (paste) — or Client ID + Client Secret (OAuth flow) | [bitly.com/a/oauth_apps](https://bitly.com/a/oauth_apps) — register an OAuth app, or generate a Generic Access Token from your Bitly settings |
| TinyURL | API Key | API Token | [tinyurl.com/app/settings/api](https://tinyurl.com/app/settings/api) |
| T.LY | API Key | API Token | [t.ly/settings/api](https://t.ly/settings/api) |
| Short.io | API Key | Secret Key, Short Domain | [short.io/settings/api](https://short.io/settings/api) |
| Rebrandly | API Key | API Key, Workspace ID (optional) | [rebrandly.com/settings/api](https://rebrandly.com/settings/api) |
| Dub.co | API Key | API Token (`dub_...`), API Endpoint (optional) | [dub.co/settings/tokens](https://dub.co/settings/tokens) |
| Cutt.ly | API Key | API Key | [cutt.ly/api](https://cutt.ly/api) |
| Tiny.cc | API Key | Login / Username, API Key | [tiny.cc/api](https://tiny.cc/api) |
| is.gd | None | — | No credentials required |
| v.gd | None | — | No credentials required |
| BL.INK | API Key | API Key | [bl.ink/settings/api](https://bl.ink/settings/api) |
| T2M | API Key | API Token | [t2m.io/settings/api](https://t2m.io/settings/api) |
| Linkly | API Key | API Key, Workspace ID | [linklyhq.com/settings/api](https://linklyhq.com/settings/api) |
| Replug | API Key | API Key | [replug.link/settings/api](https://replug.link/settings/api) |
| Switchy | API Key | API Key | [switchy.io/settings/api](https://switchy.io/settings/api) |
| PixelMe | API Key | API Key | [pixelme.me/settings/api](https://pixelme.me/settings/api) |
| Sniply | API Key | API Token | [snip.ly/settings/api](https://snip.ly/settings/api) |
| Ow.ly | API Key | Hootsuite Token | Create/stats not supported via public API — requires Hootsuite dashboard |
| CleanURI | None | — | No credentials required |

**Bitly OAuth setup (alternative to pasting an access token):**
1. Register a new OAuth app at [bitly.com/a/oauth_apps](https://bitly.com/a/oauth_apps).
2. Enter the redirect URI as `<FRONTEND_URL>/settings?tab=shortlinks` (this must also be on the
   `INTEGRATION_RETURN_URL_ALLOWLIST` env var — see [Configuration](../operations-guide/configuration.md#security)).
3. Copy the generated Client ID and Client Secret into the Bitly provider panel.
4. Postmill handles the authorization redirect and token exchange via the built-in OAuth flow.

See [Short-link Providers](../reference/provider-capabilities.md#short-link-providers) for the
full capability matrix including click analytics and custom domain support.

## AI tab

Configure AI providers, models, spending, and prompt management.

### Provider & Model sub-tab

- **Active provider** — displays the currently active AI provider for your organisation. If none
  is set, AI features are disabled across all surfaces.
- **Provider list** — shows all available AI providers grouped by type: **Direct Providers**
  (native API integrations) and **Hub Providers** (OpenAI-compatible gateways). Each provider
  card shows its brand icon, name, default model, and status (Active / Configured / unconfigured).
  You can configure as many providers as you like; one is the active default.
- **Configure (two steps, v3.8.10)** — first enter API credentials (API key, base URL,
  organisation ID; encrypted at rest), then pick the provider's model defaults: a **standard
  (default) model** and an optional **reasoning model**. The model picker splits the provider's
  text models into *Standard* and *Reasoning* groups; AI features that request deep reasoning use
  the reasoning model and fall back to the default model when none is set. Image models are no
  longer part of AI provider configuration — image/video/audio generation is configured in the
  [Media tab](#media-tab).
- **Set Active** — activate a configured provider. All AI operations for your organisation will
  use this provider.
- **Model selection** — choose models per scope:
  - **Utility** — used by text generation, hashtags, compliance, repurposing, variants, and
    translate endpoints.
  - **Generator** — used by the agents page (`/agents/[id]`).
  - **Agent** — used by comment reply drafting and LangGraph-based agent workflows.
  - **MCP** — used by the MCP server's Mastra chat agent.
- **Test connection** — validates that the configured credentials can reach the provider's API.

### Spend sub-tab

- **Usage summary** — total spend, monthly spend, and daily spend across all AI operations.
- **Spend by scope** — breakdown of costs per scope (utility, generator, agent, MCP).
- **Budget settings** — configure monthly and daily spending caps per scope. When a cap is
  exceeded, that scope returns HTTP 429 until the period resets.
- **Remaining budget** — real-time display of how much budget remains in the current period.

### Prompt Templates sub-tab

Manage `AIPromptTemplate` records — reusable templates that define the system prompt for AI
operations:

- Create templates with a unique `key` and `content`.
- Templates can be org-scoped (visible only to your organisation) or global (available to all
  organisations on the instance — requires admin privileges).
- Edit or delete existing templates.

### Prompt Library sub-tab

Manage `AIPromptLibraryItem` records — user-created reusable prompts:

- Create items with a `title` and `content`.
- Browse, edit, and delete your library items.
- Use library items as starting points when composing AI prompts in the text editor.

## Brands tab

Since v3.8.10 an organisation can manage **multiple brands** instead of a single brand profile.
The tab shows a brand list with create, edit, and delete, plus a **Default** badge:

- **Create / delete brands** — add as many brands as you need, each with a name. Deleting the
  default brand reassigns the default to another brand.
- **Default brand** — one brand is the default; it behaves exactly like the old single brand
  profile (applied to all AI generations unless a post selects a different brand).
- **Per-post brand selection** — the composer includes a brand picker; the selected brand's voice
  is used when generating content for that post.
- Brand management requires the `brands: manage` permission (owner/admin by default); all members
  can read brands so the composer picker works.

### Brand Voice (per brand)

- **Instructions** — freeform text defining the brand's writing style, tone, and voice. This is
  injected into AI-generated content.
- **Language** — default language for AI content generation.
- **Platform instructions** — per-platform overrides. For example, you might specify a different
  tone for LinkedIn (professional) versus X (witty).
- **Enable/disable** — toggle whether the brand profile is applied to AI generations.

### Knowledge Base

- **Index content** — trigger indexing of your top-performing posts into the RAG vector store.
  The system selects the 10 posts with the highest engagement metrics.
- **Search brand memory** — semantic search across your indexed top-performing content. Use this
  to find past posts that performed well for a given topic.
- **RAG status** — shows whether the vector store is enabled, which backend is in use (pgvector
  or Qdrant), and index statistics.
- **Manual index** — index custom content items (text, URLs, files) into the RAG store.
- **Backfill** — trigger a full re-index of all historical content.

## Media tab

Rebuilt in v3.8.10 as a pluggable per-organisation media-provider page that mirrors the AI tab:
provider cards with brand icons, capability chips, configured/enabled badges, and per-row
**Configure / Test / Remove** actions.

Available providers and their capabilities:

| Provider | Image | Video | Audio | Avatar |
|----------|:---:|:---:|:---:|:---:|
| fal.ai | ✓ | ✓ | ✓ | |
| OpenAI | ✓ | | ✓ | |
| ElevenLabs | | | ✓ | |
| HeyGen | | ✓ | | ✓ |
| Runway | ✓ | ✓ | | |
| Black Forest Labs | ✓ | | | |
| Google Vertex AI | ✓ | ✓ | | |
| Replicate | ✓ | ✓ | ✓ | ✓ |
| Stability AI | ✓ | ✓ | ✓ | |
| Tavus | | ✓ | | ✓ |
| D-ID | | ✓ | | ✓ |
| Hedra | | ✓ | | ✓ |
| MiniMax | ✓ | ✓ | ✓ | |
| Deepgram | | | ✓ (STT) | |
| Luma | | ✓ | | |

Configuration is **two steps**:

1. **Auth** — API credentials (encrypted at rest).
2. **Storage location** — where this provider's generated output lands: local storage or one of
   your configured storage providers, under a provider folder with a typed sub-tree
   (`documents/`, `audio/`, `images/`, `video/`, `other/`). Generated assets persist in your own
   storage (and show in the Media library) until you delete them.

Image generation returns immediately; video, audio, and avatar generation run as background jobs
and the finished artifact is saved into your storage when the provider completes.

**Auto-config:** entering OpenAI or MiniMax credentials in the AI tab also configures them as a
media provider (and vice versa) — the key is shared, you don't re-enter it.

### C2PA provenance

When enabled, generated media files are signed with C2PA Content Authenticity Initiative
metadata, embedding cryptographically verifiable provenance into output files.

## Storage tab

Configure where uploaded media files are stored. See [Storage Setup](../operations-guide/storage.md)
for the operations perspective.

### Providers sub-tab

Redesigned in v3.8.10 to mirror the AI tab: provider cards with real brand icons (AWS S3,
Cloudflare R2, Backblaze B2, IDrive e2, Local), configured/mounted badges, and quota/usage chips.
The tab now renders consistently on first load (a first-load render bug was fixed in v3.8.10).

- **Add provider** — configure a new storage backend: Amazon S3, Cloudflare R2, Backblaze B2,
  IDrive e2, or Local disk. You can add as many storages as you want per provider type, each with
  its own name — but **each must be a unique account**: adding the same account twice is rejected
  (accounts are fingerprinted from their credentials).
- **Provider cards** — each configured provider shows its name, type, mount status, and usage.
  Actions per card:
  - **Mount/Unmount** — make the provider available or unavailable as a root folder in the media
    library. **Unmount disables, it does not delete** — the configuration and data references are
    retained, and the provider can be re-mounted.
  - **Edit** — update credentials, bucket, region, endpoint.
  - **Test** — verify connectivity and permissions.
  - **Delete** — remove the provider configuration. Blocked while the provider is mounted
    (unmount first); LOCAL can never be deleted.
  - **Migrate** — move files from this provider to another.
- **LOCAL is the always-on base storage** — it cannot be deleted or unmounted. All app-internal
  writes (avatars, AI-generated media, uploads) go to LOCAL. Additional providers (S3, R2, B2,
  iDrive e2) mount onto LOCAL and appear as root folders in the media library; there is no "default"
  provider concept. Local files are stored in a per-organisation partition with a soft quota
  (5 GB by default; see [Storage Setup](../operations-guide/storage.md)).

### Quota sub-tab

- **Usage bar** — visual display of used versus allocated storage. Colour-coded:
  - Green: under 80% used.
  - Yellow: 80–90% used (warning threshold).
  - Red: over 90% used (near block threshold).
- **Quota values** — absolute bytes used and total quota allowed.
- **Percentage** — exact usage percentage.

### Usage Breakdown sub-tab

- **By Folder** — storage used by each media library folder.
- **By Provider** — storage used by each configured provider.

### Audit Log sub-tab

A timestamped log of all storage operations: provider mounts/unmounts, configuration changes,
migrations initiated, and quota events.

## Webhooks tab

Available when your subscription tier includes webhooks.

- **Create webhook** — define an endpoint URL, select event types to subscribe to, and optionally
  configure an HMAC secret for payload verification.
- **Manage** — edit, enable/disable, or delete existing webhook endpoints.
- **Test ping** — send a test payload to verify your endpoint receives and processes webhooks
  correctly.
- **Event types** — subscribe to events such as `post.published`, `post.failed`,
  `post.scheduled`, `comment.created`, and `analytics.snapshot.created`.

See [Webhooks](../developer-docs/webhooks.md) for the developer reference on payload format and
HMAC verification.

## Auto Post tab

Available when your subscription tier includes auto-posting. Configure scheduled recurring posts:

- **RSS/URL scraping** — provide an RSS feed URL or a web page URL. Postmill periodically checks
  for new content and creates draft posts.
- **AI content** — optionally use AI to rewrite or summarise scraped content before posting.
- **Schedule** — define how often to check the source and when to publish.

## Sets tab

Available on paid tiers (not FREE). Create named, reusable post templates:

- A **Set** captures a full composer payload — the selected channels, per-channel settings, post
  content, and any attached media — so you can reload it into the composer in one click.
- The Sets list shows a rich preview of each set: the channels it targets (as avatars), how many
  posts it contains, and thumbnails of its media.
- Edit and delete existing sets.

Managing sets requires the `posts` permission (RBAC). Endpoints: `GET/POST/PUT /sets`,
`DELETE /sets/:id`.

## Signatures tab

Available on paid tiers (not FREE). Manage reusable, channel-aware signatures:

- **Content** — a reusable text block appended to a post (hashtag blocks, legal disclosures,
  "Follow us" CTAs).
- **Logo / sticker** — optionally attach an image (from your Files or the stock library) to a
  signature. When the signature is applied, the image is added to the post's media.
- **Channel scope** — apply a signature to all channels, or restrict it to specific channels.
- **Auto-add** — mark one or more signatures to be appended automatically to new posts (text **and**
  logo), respecting each signature's channel scope. Several scoped auto-add signatures can coexist.
- **Usage** — each signature tracks how many times it has been applied.
- Insert a signature manually from the composer's signature toolbar button (its logo is attached
  too).

Endpoints: `GET /signatures`, `GET /signatures/auto` (auto-add signatures), `GET /signatures/default`,
`POST /signatures`, `PUT /signatures/:id`, `POST /signatures/:id/track-usage`,
`DELETE /signatures/:id`.

## Developers tab

Available when `public_api` is enabled for your tier. Manage developer access to your
organisation:

### OAuth Apps

Create and manage OAuth 2.0 applications for third-party integrations:

- **Register an app** — generate a Client ID and Client Secret.
- **Redirect URIs** — configure allowed callback URLs for the OAuth flow.
- **Scopes** — define what data and actions the app can access on behalf of users.
- **Revoke** — disable or delete an OAuth app.

See [OAuth Apps](../developer-docs/oauth-apps.md) for the developer integration guide.

### API Keys

Manage public API access keys for programmatic use of Postmill endpoints:

- Generate new API keys.
- View existing keys (masked display).
- Revoke keys.

See [Public API v1](../developer-docs/public-api.md) for the full API reference.

## Approved Apps tab

Lists all OAuth applications that you have granted access to your account:

- Each entry shows the application name, granted scopes, and authorisation date.
- **Revoke access** — remove an application's access to your account. After revocation, the
  application's tokens are invalidated and it can no longer act on your behalf.

Endpoints: `GET /user/approved-apps` lists apps; `DELETE /user/approved-apps/:id` revokes access.

## Who can see Settings

Settings access is permission-gated (v3.8.10): reading and changing the org-level settings tabs
requires the `settings` permission, which the seeded **Owner** and **Admin** roles carry. The
four provider surfaces (AI, Media, Storage, Shortlinks) and brand management are likewise gated
on their own permissions. A member whose role lacks the grant receives **HTTP 403**; an org can
grant these permissions to a custom role.

> Verified against v3.8.10

# Settings

The Settings page at `/settings` is the control centre for your organisation and personal
account. Each tab manages a distinct aspect of your Postmill instance. Tabs are sorted
alphabetically with **General** (or **Settings** on some layouts) pinned first.

## Settings tab

Global account preferences:

> **Profile is now accessed from the user avatar menu** in the top navigation bar — not from a
> settings tab. Click your avatar to find the Profile link alongside Settings and Logout. The
> settings gear icon was removed from the header; all settings pages are reached through the
> avatar menu.

## Teams tab

Available when your subscription tier includes team members. Manage who has access to your
organisation:

- **Invite members** — send email invitations. Invited users receive a registration link.
- **Role assignment** — three roles are available:

  | Role | Permissions |
  |------|-------------|
  | **SUPERADMIN** | Full access: manage all settings, billing, subscriptions, integrations, and all content. |
  | **ADMIN** | Manage content, teams, channels, and settings. Cannot access billing or subscription. |
  | **USER** | Create and manage own posts, view analytics and calendar. Cannot modify settings or invite users. |

- **Datatable** — the team list shows each member's name, email, role, and join date. Role
  changes and member removal are available from the per-row controls.

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

- **Provider selection** — choose from 19 supported providers via a searchable dropdown: Bitly,
  TinyURL, T.LY, Short.io, Rebrandly, Dub.co, Cutt.ly, Tiny.cc, is.gd, v.gd, BL.INK, T2M, Linkly,
  Replug, Switchy, PixelMe, Sniply, Ow.ly, CleanURI.
- **One active at a time** — only one short-link provider can be active per organisation. Switching
  providers automatically deactivates the previous one.
- **Custom domains** — if your selected provider supports custom (branded) domains, enter the domain
  in the configuration panel.
- **Credentials** — API keys or tokens are stored encrypted at rest in `OrgShortLinkConfig`.
- **Test connection** — validate that the configured credentials and domain are working before
  publishing.
- **Shortlink preference** — choose **ASK** (prompt before shortening), **YES** (always shorten), or
  **NO** (never shorten). This is the same preference previously managed in the Settings tab; it has
  moved to the Shortlinks tab alongside the provider configuration. The `ShortLinkPreferenceComponent`
  is shared between the composer and settings.
- **Link ledger** — every generated short link is recorded in the `ShortLink` table for analytics
  tracking and deduplication.
- **Known limitation (v3.8.4):** Short links are tracked per-org, not per-post.

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
  card shows its name, default model, and status (Active / Configured / unconfigured).
- **Configure** — enter API credentials (API key, base URL, organisation ID) for a provider.
  Credentials are encrypted at rest.
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

## Brand tab

### Brand Voice

- **Instructions** — freeform text defining your brand's writing style, tone, and voice. This is
  injected into all AI-generated content.
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

Configure AI media providers for each media operation independently:

| Operation | Purpose | Available providers |
|-----------|---------|---------------------|
| **Image** | AI image generation | Configured image provider |
| **Video** | Luma AI video generation | Configured video provider |
| **TTS** | Text-to-speech | ElevenLabs → OpenAI fallback |
| **STT** | Speech-to-text | Deepgram → OpenAI fallback |
| **Upscale** | Image upscaling | Replicate → OpenAI fallback |
| **BG Remove** | Background removal | Replicate |
| **Inpaint** | Image inpainting | Replicate |

Each operation can be enabled or disabled independently. Provider credentials entered here are
encrypted at rest.

### C2PA provenance

When enabled, generated media files are signed with C2PA Content Authenticity Initiative
metadata, embedding cryptographically verifiable provenance into output files.

## Storage tab

Configure where uploaded media files are stored. See [Storage Setup](../operations-guide/storage.md)
for the operations perspective.

### Providers sub-tab

- **Add provider** — configure a new storage backend: Amazon S3, Cloudflare R2, Backblaze B2,
  IDrive e2, or Local disk.
- **Provider cards** — each configured provider shows its name, type, mount status, and usage.
  Actions per card:
  - **Mount/Unmount** — make the provider available or unavailable as a root folder in the media
    library.
  - **Edit** — update credentials, bucket, region, endpoint.
  - **Test** — verify connectivity and permissions.
  - **Delete** — remove the provider configuration.
  - **Migrate** — move files from this provider to another.
- **LOCAL is the always-on base storage** — it cannot be deleted or unmounted. All app-internal
  writes (avatars, AI-generated media, uploads) go to LOCAL. Additional providers (S3, R2, B2,
  iDrive e2) mount onto LOCAL and appear as root folders in the media library; there is no "default"
  provider concept.

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

Available on paid tiers (not FREE). Create named collections of post content templates:

- Create sets with multiple pre-written posts.
- Quickly load a set into the composer when preparing a campaign.
- Edit and delete existing sets.

## Signatures tab

Available on paid tiers (not FREE). Manage reusable auto-append text blocks:

- Create signatures — short text that appends to the end of every post (e.g. hashtag blocks,
  legal disclosures, "Follow us" CTAs).
- Assign signatures per channel.
- Signatures are configurable per post type.

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

> Verified against v3.8.4

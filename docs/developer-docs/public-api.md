# Public API

The Postmill Public API provides programmatic access for third-party integrations
and automation. It consists of two groups: the legacy public routes and the v1
public API.

All endpoints are gated by an **API key** passed in the `Authorization` header
(no `Bearer` prefix — the raw API key string).

## Rate limiting

Rate-limited by `API_LIMIT` env var (default 600 requests/hour per org).
Specific sensitive endpoints have tighter `@Throttle` overrides.

---

## Posts

Base: `/public` and `/public/v1`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/public/v1/posts` | Create a post |
| GET | `/public/v1/posts` | List posts (query: `GetPostsDto`) |
| DELETE | `/public/v1/posts/:id` | Delete a post (by post ID, resolves group) |
| DELETE | `/public/v1/posts/group/:group` | Delete a post (by group ID) |
| PUT | `/public/v1/posts/:id/status` | Change post status |
| PUT | `/public/v1/posts/:id/release-id` | Update external release ID |
| GET | `/public/v1/posts/:id/missing` | Get missing content to fill for a post |
| GET | `/public/v1/find-slot/:id` | Find next free posting time slot |
| GET | `/public/posts/:id` | Get post preview by ID (recursive thread) — legacy, unauthenticated |
| GET | `/public/posts/:id/comments` | Get comments for a post — legacy, unauthenticated |
| POST | `/public/agent` | Create agent post — legacy, gated by `AGENT_API_KEY` env var |

## Media

Base: `/public/v1` and `/public`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/public/v1/upload` | Upload media file (multipart/form-data) |
| POST | `/public/v1/upload-from-url` | Upload media from a URL |
| POST | `/public/v1/generate-video` | Generate AI video |
| POST | `/public/v1/video/function` | Call a video function by identifier |
| GET | `/public/stream` | Proxy-stream external video (SSRF-safe via `safeFetch`) — legacy |

## Integrations

Base: `/public/v1`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/public/v1/integrations` | List connected integrations (filterable by `?group=`) |
| DELETE | `/public/v1/integrations/:id` | Delete a channel integration |
| GET | `/public/v1/integration-settings/:id` | Get integration rules/maxLength/settings/tools |
| GET | `/public/v1/social/:integration` | Get OAuth auth URL for a provider |
| POST | `/public/v1/integration-trigger/:id` | Trigger a tool on an integration |
| GET | `/public/v1/groups` | List customer groups |
| GET | `/public/v1/is-connected` | Check if org has any active integration |

## Analytics

Base: `/public/v1` and `/public`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/public/v1/analytics/:integration` | Single-channel analytics (legacy) |
| GET | `/public/v1/analytics/post/:postId` | Single-post analytics (legacy) |
| GET | `/public/v1/analytics/overview` | Overview with optional date range |
| POST | `/public/t` | Track analytics/behaviour event — legacy, unauthenticated |

> **Legacy analytics routes** live in `public.integrations.controller.ts`. They are
> kept for n8n/Zapier/Make compatibility. **Never change their response shape.**

## Notifications

Base: `/public/v1` and `/public`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/public/v1/notifications` | Get paginated notifications |
| POST | `/public/modify-subscription` | Modify subscription billing via JWT — legacy |

---

## Internal integrations API

Base: `/integrations`

Authenticated via cookie session (CSRF-protected on mutating routes).

### Integration management

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/integrations/provider/:id/connect` | Save a provider page (after two-step auth) |
| GET | `/integrations/:identifier/internal-plugs` | Get internal plug definitions for a provider |
| GET | `/integrations/customers` | List customer groups |
| PUT | `/integrations/:id/group` | Update integration group assignment |
| GET | `/integrations/list` | Full integration list with capabilities |
| POST | `/integrations/:id/settings` | Update provider additional settings |
| POST | `/integrations/:id/nickname` | Set nickname and/or avatar |
| GET | `/integrations/:id` | Single integration with order details |
| GET | `/integrations/social/:integration` | Generate OAuth authorization URL |
| POST | `/integrations/:id/time` | Configure posting time slots |
| POST | `/integrations/mentions` | Search @mentions across providers |
| POST | `/integrations/function` | Call a dynamic provider function |
| POST | `/integrations/disable` | Disable a channel |
| POST | `/integrations/enable` | Enable a channel |
| DELETE | `/integrations/` | Delete a channel (body: `{ id }`) |

### Plugs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/integrations/plug/list` | List all available plug definitions |
| GET | `/integrations/:id/plugs` | Get plugs configured for an integration |
| POST | `/integrations/:id/plugs` | Create or update plug configuration |
| PUT | `/integrations/plugs/:id/activate` | Toggle plug active/inactive |

### Provider-specific

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/integrations/telegram/updates` | Poll Telegram bot for connect message |
| POST | `/integrations/moltbook/register` | Register a Moltbook agent |
| GET | `/integrations/moltbook/status` | Check Moltbook agent claim status |

## No-auth integration endpoints

Base: `/integrations`

These do not require a cookie session. Used during OAuth callbacks and public
provider page connection.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/integrations/` | All integration definitions (provider registry) |
| POST | `/integrations/social-connect/:integration` | OAuth callback handler |
| POST | `/integrations/public/provider/:id/connect` | Save provider page (public, state-gated) |
| POST | `/integrations/extension-refresh` | Refresh Chrome extension cookies |

## Authentication

- **Internal API**: Cookie session with CSRF protection on mutating routes.
- **Public API (v1)**: Raw API key in `Authorization` header (no `Bearer` prefix).
- **Legacy public routes**: Varies — `/public/agent` uses `AGENT_API_KEY` env
  var; tracking is unauthenticated; `/public/posts/:id` is unauthenticated
  (preview).
- **Rate limiting**: `API_LIMIT` env var (default 600/hr). Individual routes may
  override with `@Throttle`.

> Verified against v3.7.0

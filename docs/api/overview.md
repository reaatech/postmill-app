# API Overview

Postmill exposes several HTTP surfaces. This page maps them; each has its own page.

> **Verified against v3.5.10.**

---

## The surfaces

| Surface | Base path | Auth | Audience |
|---------|-----------|------|----------|
| **Public API (v1)** | `/public/v1` | API key | Automation (n8n / Make / Zapier / SDK). |
| **Analytics v2** | `/analytics/v2` | Session/JWT | The dashboard and Post Detail; also a public v2 route. |
| **MCP** | MCP entrypoints | Bearer + scopes | AI agents / tools. |
| **Internal app API** | various | Session/JWT | The frontend. Not a stable contract. |

> **Stability:** the **Public API (v1)** and **MCP** surfaces are the intended integration points.
> The internal app API backs the frontend and can change between releases — don't build against it.

## Authentication

- **Public API** — an API key tied to an organization. Remember to allow-list your public IP for
  the API token (see your account/API settings).
- **MCP** — bearer credentials with explicit scopes (`mcp:read`, `mcp:posts:write`, `mcp:admin`).
  See [MCP](./mcp.md).

## Rate limiting

- The public API is subject to the global hourly request cap `API_LIMIT` (default `600`, raised from
  `90` in v3.5.10). See [Configuration](../self-hosting/configuration.md).
- MCP entrypoints are independently rate-limited (Redis-backed) and idempotency-protected. See
  [MCP](./mcp.md).
- **New AI endpoints (v3.5.0)** carry explicit per-route `@Throttle` caps (e.g. `/ai/hashtags`,
  `/ai/comment-reply`, `/ai/compliance` at 30/min) — distinct from AI budget governance. As of
  v3.5.0 the throttle guard applies the default limit to **all** routes, with `@Throttle` overriding
  per-route (previously most routes bypassed throttling). See
  [Architecture](../developers/architecture.md).

## New internal-API surfaces (v3.5.0)

v3.5.0 adds several internal app-API surfaces backing new frontend features. These are session/JWT
authenticated and **not** a stable public contract:

- **AI utilities** — `/ai/hashtags`, `/ai/compliance`, `/ai/best-time`, `/ai/brand-memory/{index,search}`,
  and an enhanced `/ai/comment-reply` with sentiment/summary action modes.
- **Posts** — `/posts/preflight` (content QA) and `/posts/bulk` (bulk/CSV scheduling).
- **Comment inbox** — `/posts/inbox`, `/posts/inbox/unread-count`, `/posts/inbox/bulk-read`.
- **Campaigns** — `/campaigns` CRUD.
- **Provider capabilities** — `/provider-capabilities` (and super-admin `/admin/provider-capabilities`).

See [Public API → Internal app API additions](./public-api.md) for the per-endpoint table.

## Backward-compatibility commitment

The legacy public analytics routes (`/public/v1/analytics/:integration`,
`/public/v1/analytics/post/:postId`) keep their original response shape for n8n/Zapier/Make
compatibility. A parallel v2 analytics route (`/public/v1/analytics/overview`) was **added** rather
than changing the legacy ones. See [Public API](./public-api.md).

## Pages

- [Public API](./public-api.md)
- [Analytics v2 API](./analytics-v2-api.md)
- [MCP](./mcp.md)
- [Automation (n8n / Make / SDK)](./automation.md)

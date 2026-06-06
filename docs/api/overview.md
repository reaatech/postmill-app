# API Overview

Postiz exposes several HTTP surfaces. This page maps them; each has its own page.

> **Verified against v3.4.0.**

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

- The public API hourly limit is `API_LIMIT` (default `30`). See
  [Configuration](../self-hosting/configuration.md).
- MCP entrypoints are independently rate-limited (Redis-backed) and idempotency-protected. See
  [MCP](./mcp.md).

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

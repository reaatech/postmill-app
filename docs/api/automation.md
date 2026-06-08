# Automation (n8n / Make / SDK)

Postiz is designed for automation. The [Public API (v1)](./public-api.md) is the surface these tools
call.

> **Verified against v3.5.9.**

---

## Tools

- **n8n** — a custom Postiz node exists (`n8n-nodes-postiz`).
- **Make.com** — a Postiz integration is available on Make.
- **Node SDK** — `@postiz/node` for programmatic access.
- **MCP** — for AI agents/tools; see [MCP](./mcp.md).

> **Note:** these client packages are maintained upstream. They target the public API contract; this
> fork preserves the legacy public-API response shapes (notably analytics) specifically so these
> integrations keep working. See [Public API](./public-api.md).

## Getting started

1. Create an API key for your organization and allow-list your public IP for the token.
2. Point your tool of choice at your instance's base URL with that key.
3. Use the [Public API](./public-api.md) endpoints — upload media, create/schedule posts, list
   channels, read analytics.

## Rate limits

The public API hourly limit is `API_LIMIT` (default `30`). Tune it in
[Configuration](../self-hosting/configuration.md) for higher-volume automation.

## Compatibility caveat

Build against the **public API**, not the internal app API. The internal API backs the frontend and
can change between releases without notice.

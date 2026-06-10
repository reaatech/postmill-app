# MCP Server

Postmill exposes an MCP (Model Context Protocol) server with multiple entrypoints
for AI agent integration. The server is bootstrapped in
`start.mcp.ts` and provides access to the Mastra chat agent's tools.

## Entrypoints

The MCP server has **5 primary entrypoints** (functional AI agent interfaces) and
**4 supporting infrastructure endpoints** (well-known metadata, SSE transport).

### Primary MCP entrypoints

| Entrypoint | Auth method | Transport | Notes |
|-----------|-------------|-----------|-------|
| `/mcp-oauth` | OAuth2 (authorization_code) | Streamable HTTP | Full OAuth flow with PKCE |
| `/mcp` | Bearer token | Streamable HTTP | `Authorization: Bearer <token>` header |
| `/mcp/:id` | API key in path | Streamable HTTP | `GET /mcp/<apiKey>` |
| `/media-mcp` | Bearer token | Streamable HTTP | Media operations, gated by `mediaEnabled` |
| `/a2a` | Bearer token | HTTP | A2A protocol bridge (conditional on `@reaatech/a2a-reference-mcp-bridge`) |

### Supporting infrastructure endpoints

| Entrypoint | Auth method | Transport | Notes |
|-----------|-------------|-----------|-------|
| `/.well-known/openai-apps-challenge` | None | HTTP (static) | Serves `OPENAI_APP_CHALLENGE` env var as plain text |
| `/.well-known/oauth-protected-resource` | None (optional Bearer token) | HTTP | OAuth resource metadata; when a Bearer token is present, the `mcp:read` scope is enforced |
| `/.well-known/oauth-authorization-server` | None | HTTP | OAuth server metadata (public) |
| `/sse/:id` + `/message/:id` | API key in path | SSE | Server-Sent Events transport |

## Authentication

Token resolution uses a two-layer strategy:

1. **Token type detection**: Tokens starting with `pos_` resolve via OAuth
   service (`oauthService.getOrgByOAuthToken`). All other tokens resolve as
   API keys (`organizationService.getOrgByApiKey`).
2. **Scope enforcement**: Via `@reaatech/a2a-reference-auth` `AuthStrategy`.
   The resolved identity is checked against required scopes.

### Scopes

| Scope | Default? | Description |
|-------|----------|-------------|
| `mcp:read` | Yes | Read-access to all MCP tools |
| `mcp:posts:write` | API keys only | Create posts via MCP |
| `mcp:admin` | No | Admin operations |

Default scopes for OAuth tokens: `mcp:read`.  
Default scopes for API keys: `mcp:read`, `mcp:posts:write`.

Admin-configured allowed scopes via `mcpsettings.allowedScopes` are merged with
the defaults.

## Rate limiting

Redis-backed with an in-memory fallback:

- **Window**: 60 seconds
- **Max requests**: 200 per window per key
- **Key pattern**: `ratelimit:mcp:{entrypoint}:{identifier}`

Keys are per-entrypoint (e.g. `mcp-oauth:{ip}`, `mcp:{ip}`, `mcp-id:{apiKey}`,
`sse:{id}`, `a2a:{ip}`). When Redis is unavailable, the rate limiter falls back
to an in-memory `Map` with the same window.

## Idempotency

Requests can include an `x-idempotency-key` header. Duplicate keys within 24h
return 409.

- **Redis-backed**: Via `IdempotencyFactory` from the AI governance module when
  available.
- **In-memory fallback**: 24h TTL `Map` when the factory is unavailable.

## Budget enforcement

Every MCP request checks the AI budget via `BudgetService.checkBudget('mcp',
orgId)`. If the budget is exceeded, the request returns 429 with
`BudgetExceeded`.

## CORS

- **Development** (`NODE_ENV=development`): `Access-Control-Allow-Origin: *`
- **Production**: Origin must match `FRONTEND_URL` exactly

## Relationship to AI facade

The MCP server is linked to the AI provider system via the `mcp` scope
(`AIScope`). The `AIModelProvider` resolves model configurations per-scope,
per-org. MCP tool execution that involves AI generation uses the active AI
provider configured for the org.

## Media MCP server

When `mediaEnabled` is `true` in MCP settings, a second MCP server is mounted
at `/media-mcp`. This uses `@reaatech/media-pipeline-mcp-server` and
`@reaatech/media-pipeline-mcp-security` for:

- RBAC middleware (pipeline run/define, artifact read, cost read)
- Rate limiting (60s window, 30 requests max)
- Audit logging
- Budget enforcement

The media MCP is gated by `mediaEnabled` — if false, the route isn't mounted.

## OAuth server metadata

The `/.well-known/oauth-authorization-server` endpoint returns:

```json
{
  "issuer": "<BACKEND_URL>",
  "authorization_endpoint": "<FRONTEND_URL>/oauth/authorize",
  "token_endpoint": "<BACKEND_URL>/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["mcp:read", "mcp:posts:write", "mcp:admin"]
}
```

> Verified against v3.7.0

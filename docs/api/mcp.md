# MCP

The MCP (Model Context Protocol) surface lets AI agents/tools interact with Postmill. In this fork all
entrypoints are hardened with scope enforcement, rate limiting, and idempotency.

> **Verified against v3.5.9.** Hardening introduced in v3.4.0 using `@reaatech` auth packages.

---

## Scopes

Authorization is scope-based. Supported scopes:

| Scope | Grants |
|-------|--------|
| `mcp:read` | Read access (the default scope). |
| `mcp:posts:write` | Create/modify posts. |
| `mcp:admin` | Administrative operations. |

Every entrypoint requires at least `mcp:read`; write/admin operations require the corresponding
scope. A request whose token lacks the required scope is rejected with `403 insufficient_scope`.

The allowed scopes for an instance come from MCP settings; if settings are unavailable the server
falls back to a safe default (enabled, `mcp:read` only).

## Authentication & hardening

- **Auth** — a `@reaatech/a2a-reference-auth` strategy resolves the caller's identity and enforces
  scopes on every one of the entrypoints.
- **Rate limiting** — Redis-backed, keyed per caller/IP (`ratelimit:mcp:*`).
- **Idempotency** — write paths are idempotency-protected so retries don't double-act.
- **Budgets** — MCP usage is subject to the AI budget/governance controls. See
  [AI settings admin](../admin/ai-settings.md).

## Transports

The server supports both streaming HTTP and SSE transports. Discovery advertises the supported
scopes (`mcp:read`, `mcp:posts:write`, `mcp:admin`).

## Relationship to the AI facade

MCP is one of the AI scopes (`mcp`) resolved through the AI facade, so the provider/model backing it
follows the same admin configuration and resolution order as the rest of the AI layer. See
[AI architecture](../developers/ai-architecture.md).

## Media over MCP

Media operations over MCP are gated by an `mediaEnabled` MCP setting (default off).

# API Keys

Postmill v3.8.8 introduces per-user, per-org API keys replacing the old single org-level key.

## Key format
Keys follow the format `pm_live_<43 base62 characters>`.

## Security model
- Keys are SHA256-hashed at rest (never stored in plaintext)
- The plaintext is shown exactly once at creation/rotation
- Each key is owned by a specific user within a specific organization
- Authentication inherits the user's actual `UserOrganization.role`
- Keys can have an optional expiry date
- Keys can be revoked (soft-delete via `revokedAt`)

## Usage
Include the key in the `Authorization` header:
```
Authorization: pm_live_abc123...
```

## MCP
MCP authentication also uses per-user keys. Update your MCP client config after upgrading.

## Breaking change (v3.8.8)
The old `Organization.apiKey` is retired. All API and MCP credentials must be regenerated from the new UI.

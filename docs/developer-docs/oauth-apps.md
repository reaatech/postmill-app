# OAuth Apps

Postmill supports OAuth 2.0 Authorization Code flow with PKCE, allowing
third-party developers to build applications that act on behalf of Postmill
organizations.

## Data models

Two Prisma models support the OAuth system:

- **`OAuthApp`**: A registered application. One per org. Stores `clientId`
  (prefix `pca_`), hashed `clientSecret` (prefix `pcs_`, shown once at
  creation), name, description, picture, redirect URLs, and scopes.
- **`OAuthAuthorization`**: A granted authorization. Links a user to an app.
  Stores the authorization code hash and token metadata.

## OAuth App management

All endpoints under `/user/oauth-app` require the `oauth_apps:manage` RBAC
permission (`@RequirePermission('oauth_apps', 'manage')`). Only one app per org
is supported.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/user/oauth-app` | Get the current org's OAuth app |
| POST | `/user/oauth-app` | Create an OAuth app (returns `clientId` + `clientSecret`) |
| PUT | `/user/oauth-app` | Update name, description, picture, redirect URLs |
| DELETE | `/user/oauth-app` | Delete the app (revokes all existing authorizations) |
| POST | `/user/oauth-app/rotate-secret` | Rotate the client secret (returns new, old is invalidated) |

### Creating an OAuth app

```
POST /user/oauth-app
Body: { name, description?, picture?, redirectUrls[] }
Response: { clientId: "pca_<random>", clientSecret: "pcs_<random>" }
```

The `clientSecret` is returned **once** at creation and stored as a SHA-256 hash
in the database. If lost, rotate it.

## Authorization code flow

### Step 1: Redirect user to authorize

```
GET /oauth/authorize?client_id=<pca_...>&redirect_uri=<url>&state=<opaque>&code_challenge=<challenge>&code_challenge_method=S256
```

The user sees the app details and approves or denies.

### Step 2: User approves

```
POST /oauth/authorize
Body: { client_id, redirect_uri, state?, code_challenge, code_challenge_method: "S256", scope?, action: "approve" }
Response: { redirect: "<redirect_uri>?code=<auth_code>&state=<state>" }
```

If the user denies (`action: "deny"`), the redirect includes `error=access_denied`.

### Step 3: Exchange code for tokens

```
POST /oauth/token
Body: {
  grant_type: "authorization_code",
  code: "<auth_code>",
  client_id: "<pca_...>",
  client_secret: "<pcs_...>",
  redirect_uri: "<url>",
  code_verifier: "<verifier>",
  scope?: "<scopes>"
}
Response: {
  access_token: "pos_<base64>",
  refresh_token: "posr_<base64>",
  token_type: "Bearer",
  expires_in: 3600,
  scope: "mcp:read,mcp:posts:write"
}
```

### PKCE

- **Challenge method**: `S256` only.
- The `code_verifier` is validated against the stored `code_challenge` during
  token exchange.
- `code_challenge` = `base64url(sha256(code_verifier))`

### Tokens

| Token | Prefix | Expiry | Storage |
|-------|--------|--------|---------|
| Access token | `pos_` | 1 hour | SHA-256 hash in DB |
| Refresh token | `posr_` | 30 days | SHA-256 hash in DB |

Access tokens are opaque base64 strings. They are resolved by `OAuthService.getOrgByOAuthToken()`.

## Approved apps

Endpoints under `/user/approved-apps` allow users to manage apps they have
authorized.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/user/approved-apps` | List apps the user has approved |
| DELETE | `/user/approved-apps/:id` | Revoke an app authorization |

Revoking deletes the `OAuthAuthorization` row and invalidates all tokens for
that authorization.

## Scopes

| Scope | Description |
|-------|-------------|
| `mcp:read` | Read-access to MCP tools |
| `mcp:posts:write` | Create and manage posts via MCP |
| `mcp:admin` | Administrative operations |

Scopes are requested during the authorization flow and enforced on every
authenticated request.

## Token resolution (for MCP)

In the MCP server, token resolution works as follows:

1. The token is extracted from the `Authorization: Bearer <token>` header.
2. If the token starts with `pos_`, it is resolved via
   `OAuthService.getOrgByOAuthToken()` → returns the org.
3. OAuth-resolved tokens get scopes `mcp:read` by default.

> Verified against v3.7.0

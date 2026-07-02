# Webhooks

Postmill webhooks let you receive real-time notifications when events occur in
your org. Webhooks are delivered via HTTP POST with HMAC signing, dispatched
through `safeFetch` for SSRF protection.

## Webhook management

All endpoints under `/webhooks`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/webhooks/` | List webhooks with delivery statistics |
| POST | `/webhooks/` | Create a webhook |
| PUT | `/webhooks/` | Update a webhook |
| POST | `/webhooks/test-ping/:id` | Send a test ping to a webhook |
| DELETE | `/webhooks/:id` | Delete a webhook |
| POST | `/webhooks/send` | Generic dispatch to a URL (query: `url`) |

### Creating a webhook

```
POST /webhooks/
Body: {
  url: "https://your-server.com/webhook",
  events: ["post.published", "comment.new"]
}
```

The `events` array specifies which event types trigger this webhook.

### Updating a webhook

```
PUT /webhooks/
Body: UpdateDto (same shape as create, with id)
```

### Test ping

```
POST /webhooks/test-ping/:id
```

Sends a signed test payload to the webhook URL via `safeFetch` (same envelope and
`X-Postmill-Signature` header as real deliveries):

```json
{
  "event": "ping",
  "timestamp": "2026-06-09T00:00:00.000Z",
  "data": { "message": "This is a test ping from Postmill" }
}
```

Returns `{ success: true, status: 200 }` on success, or `{ success: false,
status: 0, error: "..." }` on failure.

## Event types

| Event | Description |
|-------|-------------|
| `post.published` | A post has been successfully published to a channel |
| `comment.new` | A new comment was received on a published post |
| `comment.reply` | A reply was posted to an existing comment |
| `analytics.snapshot_complete` | An analytics snapshot has been collected and saved |

## Delivery

### SSRF protection

All webhook deliveries go through `safeFetch` from
`libraries/nestjs-libraries/src/dtos/webhooks/safe.fetch.ts`. This validates:

- URL scheme is HTTPS (public URLs)
- No internal/private IPs in DNS resolution
- Manual per-hop redirect re-validation (no blind redirect following)

Private CIDRs can be allowed via `SSRF_ALLOWED_PRIVATE_CIDRS` (opt-in for
self-hosted instances with internal targets).

### Payload format

Every delivery wraps a stable, minimal subset of the post in a fixed envelope —
the raw Prisma row is never shipped:

```json
{
  "event": "post.published",
  "timestamp": "2026-06-09T00:00:00.000Z",
  "data": {
    "postId": "clx...",
    "integrationId": "cly...",
    "providerIdentifier": "x",
    "integrationName": "My X account",
    "content": "The published post text",
    "url": "https://platform.com/post/123",
    "state": "PUBLISHED",
    "publishDate": "2026-06-09T00:00:00.000Z"
  }
}
```

Deliveries are bounded-retried (3 attempts with backoff) and run inside a durable
Inngest `step.run`. Each request is bounded by `WEBHOOK_TIMEOUT_MS` (default
`10000`).

### HMAC signing

Every delivery (real, test-ping, and `/webhooks/send`) carries an HMAC-SHA256
signature in the `X-Postmill-Signature` header, formatted `sha256=<hex>`.

The signature is computed over the **exact serialized JSON body** using a
**deployment-wide secret** — `WEBHOOK_SIGNING_SECRET`. When that env var is
unset, the secret falls back to `JWT_SECRET` (mirroring `EncryptionService`'s
key-derivation), so signing is **always on**.

**Verification recipe (receiver side):**

```
expected = "sha256=" + hex(HMAC_SHA256(WEBHOOK_SIGNING_SECRET, rawRequestBody))
constant_time_equals(expected, header["X-Postmill-Signature"])
```

Use the raw request body bytes exactly as received (do not re-serialize), and a
constant-time comparison.

> **Note:** the secret is **deployment-wide**, not per-webhook — every webhook for
> the deployment is signed with the same secret. **Tracked follow-up:** add a
> per-`Webhooks`-row `secret` column (with create-flow + UI surfacing to
> generate/display it) so each endpoint can rotate its own secret.

## Data model

- **`Webhooks`**: Stores webhook URL and event subscription.
- **`Webhooks.integrations`**: Implicit many-to-many relation with `Integration`
  (Prisma manages the join table).

## Environment

| Var | Default | Purpose |
|-----|---------|---------|
| `WEBHOOK_SIGNING_SECRET` | falls back to `JWT_SECRET` | HMAC key for the `X-Postmill-Signature` header |
| `WEBHOOK_TIMEOUT_MS` | `10000` | Per-request timeout for webhook dispatch |
| `OUTBOUND_HTTP_TIMEOUT_MS` | `30000` | Default `safeFetch` timeout (webhooks use the tighter value above) |

> Verified against v4.4.0

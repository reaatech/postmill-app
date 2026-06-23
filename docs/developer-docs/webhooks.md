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

Sends a test payload to the webhook URL via `safeFetch`:

```json
{
  "event": "ping",
  "timestamp": "2026-06-09T00:00:00.000Z",
  "message": "This is a test ping from Postmill"
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

```json
{
  "event": "post.published",
  "timestamp": "2026-06-09T00:00:00.000Z",
  "data": {
    "postId": "clx...",
    "integrationId": "cly...",
    "url": "https://platform.com/post/123"
  }
}
```

### HMAC signing

Webhooks include an HMAC-SHA256 signature in the `X-Postmill-Signature` header.
Verify this signature using your webhook secret on the receiving end.

## Data model

- **`Webhooks`**: Stores webhook URL and event subscription.
- **`Webhooks.integrations`**: Implicit many-to-many relation with `Integration`
  (Prisma manages the join table).

> Verified against v3.7.0

# Public API (v1)

The stable, API-key-authenticated surface for automation. Base path: **`/public/v1`**.

> **Verified against v3.4.0.** Endpoints below are taken from the v1 public integrations controller.

---

## Authentication

Use your organization's API key. Allow-list your public IP for the token. The hourly request limit
is `API_LIMIT` (default `30`) — see [Configuration](../self-hosting/configuration.md).

## Endpoints

### Media

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/public/v1/upload` | Upload media. |
| `POST` | `/public/v1/upload-from-url` | Upload media from a URL. |

### Posts

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/public/v1/posts` | List posts. |
| `POST` | `/public/v1/posts` | Create/schedule a post. |
| `DELETE` | `/public/v1/posts/:id` | Delete a post. |
| `DELETE` | `/public/v1/posts/group/:group` | Delete a post group. |
| `GET` | `/public/v1/find-slot/:id` | Find an available scheduling slot. |
| `GET` | `/public/v1/posts/:id/missing` | Missing-content check for a post. |
| `PUT` | `/public/v1/posts/:id/status` | Update a post's status. |
| `PUT` | `/public/v1/posts/:id/release-id` | Set the release id. |

### Integrations (channels)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/public/v1/integrations` | List connected channels. |
| `GET` | `/public/v1/is-connected` | Connection check. |
| `GET` | `/public/v1/groups` | List groups. |
| `GET` | `/public/v1/social/:integration` | Social details for a channel. |
| `GET` | `/public/v1/integration-settings/:id` | Channel settings. |
| `DELETE` | `/public/v1/integrations/:id` | Disconnect a channel. |
| `POST` | `/public/v1/integration-trigger/:id` | Trigger a channel action. |

### Media generation

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/public/v1/generate-video` | Generate a video. |
| `POST` | `/public/v1/video/function` | Video function call. |

### Analytics

| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| `GET` | `/public/v1/analytics/:integration` | Channel analytics. | **Legacy — frozen response shape.** |
| `GET` | `/public/v1/analytics/post/:postId` | Post analytics. | **Legacy — frozen response shape.** |
| `GET` | `/public/v1/analytics/overview` | Multi-channel overview. | v2-style addition. |

> **Backward compatibility:** the two legacy analytics routes keep their original shape for
> n8n/Zapier/Make. The overview route was added in parallel. See [Analytics v2 API](./analytics-v2-api.md).

### Notifications

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/public/v1/notifications` | List notifications. |

## Automation tools

n8n, Make, and the Node SDK call this surface. See [Automation](./automation.md).

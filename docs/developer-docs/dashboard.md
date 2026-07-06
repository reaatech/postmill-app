# Dashboard

The `/dashboard` surface is a thin composition layer over existing domain services. All aggregation lives in `libraries/nestjs-libraries/src/dashboard/`; the backend controller (`apps/backend/src/api/routes/dashboard.controller.ts`) is responsible only for auth, RBAC mapping, and wiring.

> **Verified against v3.9.0+**

## Architecture

```
Frontend widgets (apps/frontend/src/components/dashboard/)
  │
  ├─ SWR hooks (hooks/use*.ts)
  │   └─ useFetch -> /dashboard/* endpoints
  │
  ├─ SectionCard kit (kit/section-card.tsx)
  │   └─ useDashboardPrefs (localStorage show/hide)
  │   └─ usePermissions (RBAC gate)
  │
  └─ dashboard.component.tsx (responsive 12-col grid)

Backend controller (apps/backend/src/api/routes/dashboard.controller.ts)
  │
  ├─ DashboardService (libraries/nestjs-libraries/src/dashboard/dashboard.service.ts)
  │   ├─ getSummary(...)            -> Redis-cached per (org, user)
  │   ├─ getSchedule(...)           -> PostsService
  │   ├─ getCampaignSummaries(...)  -> CampaignsService
  │   ├─ getMediaJobs(...)          -> AISettingsService
  │   ├─ getAttention(...)          -> 8 probes, RBAC-filtered, Redis-cached
  │   └─ ...
  │
  ├─ DashboardBriefService
  │   └─ generateBrief / getCachedBrief -> AI + Redis
  │
  └─ PermissionsService / RolesService -> effective RBAC + billing
```

No new Prisma models were added; every widget reads existing tables through the appropriate domain service or repository.

## Endpoints

| Method | Route | Permission | Description |
|---|---|---|---|
| `GET` | `/dashboard/summary` | auth | Legacy-ish summary (total posts, team, upcoming posts, flags). Cached 60s per `(orgId, userId)`. |
| `GET` | `/dashboard/schedule?days=7&timezone=UTC` | `posts:read` | Day-bucketed scheduled counts + gap detection. |
| `GET` | `/dashboard/campaigns?limit=6` | `posts:read` | Active campaign summaries with post-state counts and goal progress. |
| `GET` | `/dashboard/media-jobs` | `media:read` | Latest 20 jobs + `{ pending, processing, failed7d }` counts. |
| `GET` | `/dashboard/usage` | `billing:read` | Plan limits/usage when Stripe is enabled; `{ billingEnabled: false }` otherwise. |
| `GET` | `/dashboard/attention` | auth | 8 attention probes filtered by effective permissions; cached 60s. |
| `GET` | `/dashboard/brief` | `analytics:read` + AI `Read` | Returns cached brief or `{ cached: false }`. |
| `POST` | `/dashboard/brief` | `analytics:read` + AI `Create` | Generates and caches the daily brief. Single-flighted. |
| `POST` | `/posts/:id/retry` | `posts:update` + `POSTS_PER_MONTH` | Resets an ERROR post to QUEUE and re-queues publish. |

Dismiss anomaly uses the existing analytics endpoint: `POST /analytics/v2/anomalies/:id/dismiss`.

## Attention probes

`DashboardService.getAttention` runs eight probes inside `try/catch`; a single probe failure degrades only that item. The controller maps the member's effective permissions to `permittedKinds` via `KIND_PERMISSION_MAP`:

| Kind | Required permission |
|---|---|
| `failed-posts` | `posts:read` |
| `channel-health` | `posts:read` |
| `pending-approvals` | `posts:update` |
| `unread-comments` | `comments:read` |
| `schedule-gaps` | `posts:read` |
| `budget` | `billing:read` |
| `failed-media-jobs` | `media:read` |
| `anomalies` | `analytics:read` |

Results are sorted by severity (`critical` > `warning` > `info`) then count descending.

## Caching

- `dashboard:summary:{orgId}:{userId}` — TTL 60s, single-flight miss handling.
- `dashboard:attention:{orgId}:{userId}` — TTL 60s.
- `dashboard:brief:{orgId}:{YYYY-MM-DD}` — TTL seconds until local midnight; single-flight on generation.

Cache write failures are swallowed so Redis downtime does not break the dashboard.

## Daily Brief

`DashboardBriefService` builds a prompt from the same probes and plan usage used by the attention feed, plus yesterday's analytics and today's scheduled posts. It is generated only on demand, gated by `BudgetService.checkBudget('utility', orgId)`, and cached per org per calendar day. If the org has no active AI provider, the controller returns `503`.

## Frontend RBAC

`SectionCard` receives an optional `permission` prop. While `usePermissions().isResolved` is false the card renders optimistically; once resolved it returns `null` if the permission is absent. The Customize popover applies the same filter so users cannot toggle sections they are not allowed to see.

## Customization

Section visibility is stored in `localStorage['dashboard_prefs']` as `{ hidden: string[], v:1 }`. The version field makes it possible to swap in a server-backed store later without breaking existing clients.

## Related files

- `libraries/nestjs-libraries/src/dashboard/dashboard.service.ts`
- `libraries/nestjs-libraries/src/dashboard/dashboard-brief.service.ts`
- `apps/backend/src/api/routes/dashboard.controller.ts`
- `apps/frontend/src/components/dashboard/dashboard.component.tsx`
- `dev/du-improvement-backlog.md`

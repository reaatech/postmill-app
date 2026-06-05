This project is Postiz, a tool to schedule social media and chat posts to 28+ channels.
You can add posts to the calendar, they will be added into a workflow and posted at the right time.
You can find things like:
- Schedule posts
- Calendar view
- Analytics
- Team management
- Media library

This project is a monorepo with a root only package.json of dependencies.
Made with PNPM.
We have 3 important folders

- apps/backend - this is where the API code is (NESTJS)
- apps/orchestrator - this is temporal, it's for background jobs (NESTJS) it contains all the workflows and activities
- apps/frontend - this is the code of the frontend (Vite ReactJS)
- /libraries contains a lot of services shared between backend and orchestrator and frontend components.

We are using only pnpm, don't use any other dependency manager.
Never install frontend components from npmjs, focus on writing native components.

The project uses tailwind 3, before writing any component look at:
- /apps/frontend/src/app/colors.scss
- /apps/frontend/src/app/global.scss
- /apps/frontend/tailwind.config.js

All the --color-custom* are deprecated, don't use them.

And check other components in the system before to get the right design.

When working on the backend we need to pass the 3 layers:
Controller >> Service >> Repository (no shortcuts)
In some cases we will have
Controller >> Mananger >> Service >> Repository.

Most of the server logic should be inside of libs/server.
The backend repository is mostly used to write controller, and import files from libs.server.

For the frontend follow this:
- Many of the UI components lives in /apps/frontend/src/components/ui
- Routing is in /apps/frontend/src/app
- Components are in /apps/frontend/src/components
- always use SWR to fetch stuff, and use "useFetch" hook from /libraries/helpers/src/utils/custom.fetch.tsx

When using SWR, each one have to be in a seperate hook and must comply with react-hooks/rules-of-hooks, never put eslint-disable-next-line on it.

It means that this is valid:
const useCommunity = () => {
   return useSWR....
}

This is not valid:
const useCommunity = () => {
  return {
    communities: () => useSWR<CommunitiesListResponse>("communities", getCommunities),
    providers: () => useSWR<ProvidersListResponse>("providers", getProviders),
  };
}

- Linting of the project can run only from the root.
- Use only pnpm.
- The system is in production with many users, if you want to change something, you need to be sure that you are not breaking anything for existing users and a migration might be needed

## Analytics Architecture

The analytics system has been refactored from single-channel live-fetch to a persisted multi-channel dashboard.

### Key components:
- **Data models**: `AnalyticsSnapshot` and `PostAnalyticsSnapshot` (Prisma) — daily snapshots populated by a Temporal workflow
- **Collection worker**: The Temporal workflow in `apps/orchestrator` requires `RUN_CRON=true` to activate. It runs one sweep then `continueAsNew`s every 24h (don't reintroduce an unbounded `while(true)` loop).
- **Retention/rollup**: `AnalyticsActivity.pruneAndRollupSnapshots()` (run per-org each sweep) rolls daily `AnalyticsSnapshot` rows older than ~18 months into one weekly row per `(integration, metric, ISO week)` — flow metrics summed, stock metrics keep the week's latest — and prunes `PostAnalyticsSnapshot` beyond 90 days. Tunable via the `ANALYTICS_DAILY_RETENTION_DAYS` / `ANALYTICS_POST_RETENTION_DAYS` env vars (read per-run; invalid values fall back to the 548/90-day defaults).
- **API**: New `/analytics/v2` endpoints in `AnalyticsV2Controller` replace the legacy single-channel `/analytics/:integration` and `/analytics/post/:postId`
- **Legacy fallback**: `IntegrationService.checkAnalytics()` and `PostsService.checkPostAnalytics()` still exist as fallback paths — used by `AnalyticsService` and the public API (`public.integrations.controller.ts`)
- **Metric normalization**: Metrics are normalized via `PROVIDER_METRIC_MAP` in `libraries/nestjs-libraries/src/analytics/`
- **Public API**: The legacy public API analytics route (`public.integrations.controller.ts:478`) is kept as-is for n8n/Zapier compatibility — a parallel v2 public route was added in Phase 2

## Calendar & Post Detail

The calendar upgrade (v3.3.0) adds two feature tracks to `/launches`:

### Track A (Calendar reshape — frontend-heavy)
- **PostDetailModal** — New modal opened by clicking the card body (instead of the edit modal). Shows KPI header from `/analytics/v2/post/:postId` with a live-fallback path in `getPostDetail` for un-snapshotted posts, full post thread from `getPostsRecursively`, and capability-aware comments section.
- **Settings icon** on the card hover strip opens the edit modal (previously the whole card body).
- **Scheduled/published indicator** pill and **card stats footer** (views/likes/comments) sourced from `PostAnalyticsSnapshot`.

### Track B (Social comments — backend-heavy, behind capability flags)
- **`SocialComment` / `PostCommentRead`** Prisma models for persisting synced platform comments and per-user read state.
- **`ISocialMediaComments`** interface in `social.integrations.interface.ts` with optional `fetchComments`/`replyToComment`/`likeComment` methods.
- **Social comments Controller → Service → Repository** layer.
- **Temporal `CommentsActivity` + `commentsCollectionWorkflow`** for periodic comment sync (gated by `RUN_CRON=true`).
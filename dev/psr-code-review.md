# posts-social remediation — code review findings

Review date: 2026-07-07
Skill used: `.claude/skills/code-review/SKILL.md`
Scope: working-tree implementation of `dev/posts-social_REMEDIATION.md`

## Method

- Read the remediation plan and decomposed it into the 26 tracked items below.
- Inspected every file/line range cited in the plan, plus the related controllers,
  services, repositories, DTOs, Inngest wiring, and provider tests.
- Ran the full test matrix (`pnpm test`), per-package Vitest, ESLint, and
  TypeScript `--noEmit` for the changed packages.

## Verdict

**All 26 remediation items are implemented and verified.** No code changes were
required during this review pass. The tree builds, lints clean, and all tests pass.

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| POSTS-01 | Cap TikTok publish-status polling | DONE | `libraries/providers/tiktok/src/v1/social.adapter.ts:419-485` — `maxAttempts = 30` loop; terminal error on exhaustion. Spec passes. |
| POSTS-02 | Cap Instagram media-upload polling | DONE | `libraries/providers/kernel/src/domains/social-families/instagram-base.ts:667-694` — `INSTAGRAM_MAX_MEDIA_UPLOAD_POLL_ATTEMPTS` bounded loop. Spec passes. |
| POSTS-03 | Cap Instagram carousel polling | DONE | `libraries/providers/kernel/src/domains/social-families/instagram-base.ts:772-799` — `INSTAGRAM_MAX_CAROUSEL_CONTAINER_POLL_ATTEMPTS` bounded loop. Spec passes. |
| POSTS-04 | Convert Threads recursive polling to iteration | DONE | `libraries/providers/threads/src/v1/social.adapter.ts:176-209` — iterative `while` with `maxContainerStatusAttempts` + deadline. Spec passes. |
| POSTS-05 | Cap Pinterest video-status polling | DONE | `libraries/providers/pinterest/src/v1/social.adapter.ts:379-430` — `maxAttempts`/`maxDurationMs` + non-terminal status allow-list. Spec passes. |
| POSTS-06 | Cap Whop upload-status polling | DONE | `libraries/providers/whop/src/v1/social.adapter.ts:268-300` — `maxAttempts = 120` + 10 min deadline. Spec passes. |
| POSTS-07 | Cap Bluesky video blob polling | DONE | `libraries/providers/bluesky/src/v1/social.adapter.ts:134-156` — `maxAttempts = 20` + 10 min deadline. Spec passes. |
| POSTS-08/09 | Route TikTok OAuth/user-info through `this.fetch()` | DONE | `libraries/providers/tiktok/src/v1/social.adapter.ts:276-300`, `:354-378`, `:421-438` all use `this.fetch()`. Spec passes. |
| POSTS-10 | Route Facebook page/analytics through `this.fetch()` | DONE | `libraries/providers/facebook/src/v1/social.adapter.ts:338`, `:372-374`, `:413-414`, `:450-451` all use `this.fetch()`. |
| POSTS-11 | Route Instagram-base page/analytics through `this.fetch()` | DONE | `libraries/providers/kernel/src/domains/social-families/instagram-base.ts:439-477`, `:491-563`, `:584-593`, `:659-665`, `:779-788` all use `this.fetch()`. |
| POSTS-12 | Route YouTube media downloads through `safeFetch` | DONE | `libraries/providers/youtube/src/v1/social.adapter.ts:475`, `:509` use `safeFetch`. Spec passes. |
| POSTS-13 | Route Bluesky image downloads through `safeFetch` | DONE | `libraries/providers/bluesky/src/v1/social.adapter.ts:44`, `:95`, `:118` use `safeFetch`. Spec passes. |
| POSTS-14 | Cap MeWe groups pagination + `this.fetch()` | DONE | `libraries/providers/mewe/src/v1/social.adapter.ts:46`, `:196-210` — `maxGroupPages = 100` + `this.fetch()`. Spec passes. |
| POSTS-15 | Restore legacy public API `/posts` response shape | DONE | `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts:198-219` returns `{ posts }` when no paging params, `{ posts, cursor }` when paging. `public.integrations.posts.spec.ts` passes. |
| POSTS-16 | Stop `IntegrationService` reaching into `AutopostRepository` | DONE | `libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts:42-50` injects `AutopostService`; `changeActiveCron` calls `_autopostsService.stopAll()`. No `AutopostRepository` import. Spec passes. |
| POSTS-17 | Add `organizationId` to `updateIntegration` post soft-delete | DONE | `libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts:159-166` includes `organizationId` in `updateMany` where-clause. Spec passes. |
| POSTS-18 | Add `organizationId` scoping to social-comment repo ops | DONE | `libraries/nestjs-libraries/src/database/prisma/social-comments/social.comments.repository.ts:116-120`, `:217-222`, `:224-229` all include `organizationId` in Prisma where-clauses. |
| POSTS-19 | Add `organizationId` scoping to autopost repository | DONE | `libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts:40-47`, `:50-58` include `organizationId` in where-clauses; callers pass org id. Spec passes. |
| POSTS-20 | Cap X tweet pagination | DONE | `libraries/providers/x/src/v1/social.adapter.ts:639-685` — iterative `loadAllTweets` with `maxTimelinePageDepth` (env-tunable, default 10). Spec passes. |
| POSTS-21 | Cap Facebook page/BM pagination | DONE | `libraries/providers/facebook/src/v1/social.adapter.ts:337-355`, `:369-395`, `:407-432`, `:446-469` all use `MAX_PAGE_DEPTH` counters. Spec passes. |
| POSTS-22 | Cap Instagram-base page/BM pagination | DONE | `libraries/providers/kernel/src/domains/social-families/instagram-base.ts:495-511`, `:523-549` use `INSTAGRAM_MAX_PAGES_PAGINATION_DEPTH`. Spec passes. |
| POSTS-23/24 | Validate provider method names before dynamic dispatch | DONE | `apps/backend/src/api/routes/integrations.controller.ts:452-458` allow-lists tool methods + `'mention'`. `apps/backend/src/public-api/routes/v1/public.integrations.controller.ts:819-828` allow-lists via tool metadata. Both return 400 for unknown methods. |
| POSTS-25-29 | Add DTOs for raw body/query params | DONE | All cited routes now use validated DTOs (`UpdateReleaseIdDto`, `ChangePostDateDto`, `ReplyCommentDto`, `UpdateCommentStatusDto`, `AssignCommentDto`, `ConnectProviderDto`, `UpdateIntegrationGroupDto`, `UpdateProviderSettingsDto`, `IntegrationFunctionDto`) and `ParseCuidPipe` where appropriate. |
| POSTS-30 | Authenticate Telegram/Moltbook endpoints | DONE | `IntegrationsController` is listed in `apps/backend/src/api/api.module.ts:100` `authenticatedController`, so `AuthMiddleware`/`CsrfMiddleware` apply to `/telegram/updates`, `/moltbook/register`, and `/moltbook/status`. Frontend `useFetch()` already sends the auth cookie. Unauthenticated requests are rejected. |
| POSTS-32/33 | Cap post draft scheduling loops | DONE | `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts:1700-1713` `maxDepth = 365`; `:1745-1767` `findTime(maxAttempts = 1000)`. Both throw clear errors on exhaustion. |
| POSTS-31 | `retryPost` `ParseCuidPipe` + guard ordering | DONE | `apps/backend/src/api/routes/posts.controller.ts:84-92` uses `ParseCuidPipe` on `:id`. `PostsController` has `@UseGuards(OrgRbacGuard)`. |

## Test / lint / type-check results

```
pnpm test                    → all packages passed
pnpm vitest run --root libraries/providers    → 144 files / 2558 tests passed
pnpm vitest run --root libraries/nestjs-libraries → 227 files / 3222 tests passed (2 skipped)
pnpm vitest run --root apps/backend           → 65 files / 749 tests passed
pnpm eslint --max-warnings=0 <changed files>  → clean
pnpm tsc -p apps/backend/tsconfig.json --noEmit → clean
pnpm tsc -p libraries/nestjs-libraries/tsconfig.json --noEmit → clean
```

## Improvement backlog (not plan gaps)

Logged separately in `dev/psr-improvement-backlog.md`:

1. **MeWe bare `fetch()` in OAuth/media paths** — Item POSTS-14 only required
   `groups()` to use `this.fetch()`. `authenticate()` and `uploadPhoto()`/`post()`
   still call raw `fetch()`. These are first-party MeWe API hosts, so SSRF exposure
   is low, but aligning them with `this.fetch()` would give uniform timeout/VPN
   behavior.
2. **`IntegrationFunctionDto.data: any`** — The dynamic tool payload is currently
   untyped/unvalidated. Consider adding a per-tool JSON-schema gate if the surface
   grows.

## Conclusion

The `posts-social_REMEDIATION.md` plan is fully implemented in the working tree.
No remediation edits were required during this review. The implementation is
backed by passing unit/integration tests, lint, and type-check.

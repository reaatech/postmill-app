# notifications Remediation Build Tracker

> Source: `dev/notifications_REMEDIATION.md`
> Created: 2026-07-07

## Legend

- **ID**: stable work item identifier.
- **Requirement**: what must change.
- **Acceptance criteria**: how we verify it.
- **Target files**: files expected to be edited.
- **Depends on**: IDs that must be DONE before this can safely start (serial dependency).
- **Status**: `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED`.
- **Evidence**: commit/build/test proof once DONE.

## Work items

| ID | Requirement | Acceptance criteria | Target files | Depends on | Status | Evidence |
|---|---|---|---|---|---|---|
| NOTIF-01 | HTML-escape user strings (`platform`, `postTitle`, etc.) in comment digest email HTML. | A comment with `<script>alert(1)</script>` in the post title renders as literal text in the email body. | `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts` | — | DONE | Added `private _escapeHtml(text)` at lines 525–532; used in `notifyCommentDigest` lines 467–472. Test `NOTIF-01: escapes user strings in comment digest email HTML` passes. |
| NOTIF-02 | Prevent push-token reassignment across users. | Registering a known token for a different user does not overwrite `userId`. | `libraries/nestjs-libraries/src/database/prisma/notifications/push-notification.service.ts` | — | DONE | `registerToken` now `findUnique` then guards against cross-user reuse (lines 59–68) before update/create. Added test `does not reassign a token already registered to a different user`. |
| NOTIF-03 | Scope digest queue `getPendingForUser` by `organizationId`. | `getPendingForUser` accepts and filters by `organizationId`; multi-org users see only the selected org's items. | `libraries/nestjs-libraries/src/database/prisma/notifications/notification-digest.service.ts` | — | DONE | `getPendingForUser(userId, organizationId)` lines 53–58 adds `organizationId` to Prisma `where`. |
| NOTIF-04 | Scope digest queue `deleteForUser` by `organizationId`. | `deleteForUser` accepts and filters by `organizationId`; deletion does not affect other orgs. | `libraries/nestjs-libraries/src/database/prisma/notifications/notification-digest.service.ts` | NOTIF-03 | DONE | `deleteForUser(userId, organizationId)` lines 77–81 adds `organizationId` to Prisma `where`. |
| NOTIF-05 | Filter digest recipients through active `UserOrganization` rows and user activation status before returning/sending. | Inactive users and disabled org members do not receive digests. | `libraries/nestjs-libraries/src/database/prisma/notifications/notification-preference.service.ts` | — | DONE | `getPreferencesByDigestFrequency` where clause (lines 237–247) now filters `user.activated: true` and `user.organizations.some.disabled: false`. Also added `ensureDefaultsForUsers` helper (lines 100–139) for NOTIF-10. |
| NOTIF-06 | Filter notification recipients through active `UserOrganization` rows and user activation status before sending. | Inactive users and disabled org members do not receive notifications. | `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts`, `libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts` | — | DONE | `organization.repository.ts` `getTeam` now selects `disabled` (line 429) and `user.activated` (line 433). `notification.service.ts` `notify` filters `activeMembers` (lines 122–125). Test `NOTIF-06: skips inactive users and disabled org memberships` passes. |
| NOTIF-07 | Intersect `targetRoles` with `targetUserIds` in admin broadcast instead of overwriting. | A broadcast with `targetUserIds=[A]` and `targetRoles=[editor]` only reaches user A if A is an editor. | `apps/backend/src/api/routes/admin-notifications.controller.ts` | — | DONE | Target resolution (lines 41–63) now intersects `targetUserIds` and `targetRoles` when both are supplied. |
| NOTIF-08 | Surface email-send failures for Inngest retry. Remove the catch-all for non-connection errors; let transient failures throw so Inngest retries. Log only after terminal failure. | A mocked 5xx email provider response causes the Inngest step to fail and retry. | `libraries/nestjs-libraries/src/services/email.service.ts` | — | DONE | `sendEmailSync` retries any adapter error (lines 134–172) and rethrows `lastErr` after terminal failure (line 171). Tests updated to assert retry + throw for non-connection errors. |
| NOTIF-09 | Drop unused `type` field from broadcast DTO or consume it in the controller. | The field is no longer required, or the controller consumes it. | `libraries/nestjs-libraries/src/dtos/notifications/notification-preference.dto.ts`, `apps/backend/src/api/routes/admin-notifications.controller.ts` | — | DONE | Removed `type!: string` from `BroadcastNotificationDto` (lines 142–164 of DTO). Controller already did not reference it. |
| NOTIF-10 | Batch preference defaults lookup in `notify()` so all member ids are handled in one query before the loop. | Notifying 20 members issues one preference batch query. | `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts` | NOTIF-05 | DONE | `notify()` calls `ensureDefaultsForUsers(activeUserIds)` once (lines 127–131) and uses `prefsMap[user.id]` in the loop. Test `NOTIF-10: batches preference lookup for all active members in one query` passes. |
| NOTIF-11 | Redact recipient email from email failure logs. Log only a hash or id, not the raw address. | Log output does not contain the literal `to` email address. | `libraries/nestjs-libraries/src/services/email.service.ts` | — | DONE | Added `_redactedId(to)` helper (lines 174–176) using SHA-256 prefix; failure logs (lines 159–160, 169) use redacted id. Test verifies log output does not contain literal email. |
| NOTIF-12 | Skip in-app row creation when the `inApp` channel is disabled. | When `channels.inApp` is false, no in-app `Notification` row is persisted. | `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts` | — | DONE | `notify()` collects `inAppUserIds` and only calls `createNotification` when `inAppUserIds.length > 0` (lines 155–166). Test `NOTIF-12: skips creating the in-app notification row when inApp is disabled` passes. |
| NOTIF-13 | Validate broadcast target array formats. | Invalid ids or overly long arrays are rejected. | `libraries/nestjs-libraries/src/dtos/notifications/notification-preference.dto.ts` | — | DONE | `targetUserIds` has `@IsUUID('4', { each: true })` and `@ArrayMaxSize(1000)`; `targetRoles` has `@IsString`, `@MaxLength(64, { each: true })`, `@ArrayMaxSize(1000)` (lines 149–158). |
| NOTIF-14 | Replace SES adapter `console.*` logging with kernel `LoggerPort`. | SES adapter does not import `console` for logging. | `libraries/providers/ses/src/v1/email.adapter.ts` | — | DONE | Replaced `_consoleLogger` with `noopLogger` (lines 19–24); constructor fallback uses `logger ?? noopLogger` (line 42). No `console` references remain. |

## Dependency order (Phase 1)

- Foundation / independent: NOTIF-02, NOTIF-03, NOTIF-07, NOTIF-08, NOTIF-09, NOTIF-11, NOTIF-13, NOTIF-14
- Same file `notification-digest.service.ts`: NOTIF-03 → NOTIF-04
- Same file `notification.service.ts`: NOTIF-06, NOTIF-10, NOTIF-12, NOTIF-01 (implemented together, with NOTIF-10 depending on NOTIF-05's batch helper)
- Same file `email.service.ts`: NOTIF-08 → NOTIF-11
- Same file `admin-notifications.controller.ts` + DTO: NOTIF-07, NOTIF-09, NOTIF-13

## Execution groups (Phase 2)

- Group A: NOTIF-01, NOTIF-06, NOTIF-10, NOTIF-12 — `notification.service.ts`, `organization.repository.ts`, `notification.service.spec.ts`
- Group B: NOTIF-03, NOTIF-04 — `notification-digest.service.ts`, `digest.activity.ts`, `digest.activity.spec.ts`
- Group C: NOTIF-08, NOTIF-11 — `email.service.ts`, `email.service.spec.ts`
- Group D: NOTIF-07, NOTIF-09, NOTIF-13 — `admin-notifications.controller.ts`, `notification-preference.dto.ts`
- Group E: NOTIF-02 — `push-notification.service.ts`, `push-notification.service.spec.ts`
- Group F: NOTIF-05 (+ batch helper for NOTIF-10) — `notification-preference.service.ts`
- Group G: NOTIF-14 — `libraries/providers/ses/src/v1/email.adapter.ts`

## Phase 3 integration results

- `pnpm exec tsc --noEmit -p libraries/nestjs-libraries/tsconfig.json` — exit 0
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — exit 0
- `pnpm --filter postmill-backend run build` — exit 0
- `pnpm exec vitest run --root libraries/nestjs-libraries src/database/prisma/notifications/notification.service.spec.ts src/database/prisma/notifications/notification-preference.service.spec.ts src/database/prisma/notifications/push-notification.service.spec.ts src/inngest/activities/digest.activity.spec.ts src/services/email.service.spec.ts` — 5 files, 42 tests passed
- `pnpm exec vitest run --root . libraries/providers/ses/src/v1/__tests__/ses.adapter.spec.ts` — 28 tests passed
- `pnpm exec eslint` on all changed files/directories — exit 0

## Final counts

Total: 14 | Done: 14 | Blocked: 0

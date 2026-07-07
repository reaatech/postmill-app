# notifications Remediation Audit Tracker

> Source plan: `dev/notifications_REMEDIATION.md`
> Created: 2026-07-07

## Legend

- **ID**: atomic remediation item.
- **Requirement**: what the plan asks for.
- **Acceptance criteria**: how to verify it.
- **Status**: `UNVERIFIED` | `DONE` | `PARTIAL` | `MISSING` | `BUGGY` | `BLOCKED`.
- **Evidence**: file path + symbol/lines + brief proof.
- **Notes**: gaps, improvements, or blockers.

## Improvement backlog

Improvement ideas are logged to `dev/nor-improvement-backlog.md` and kept out of this tracker.

## Work items

| ID | Requirement | Acceptance criteria | Status | Evidence | Notes |
|---|---|---|---|---|---|
| NOTIF-01 | HTML-escape user content (`platform`, `postTitle`, and interpolated user strings) in comment digest email HTML. | A comment with `<script>alert(1)</script>` in the post title renders as literal text in the email body. | DONE | `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts` `_escapeHtml` lines 525–532; applied to `platform` and `postTitle` in `notifyCommentDigest` lines 467–472. Numeric fields (`totalNewComments`, `socialComments.length`) and env URL are not user strings. | — |
| NOTIF-02 | Prevent push-token reassignment across users. | Registering a known token for a different user does not overwrite `userId`. | DONE | `libraries/nestjs-libraries/src/database/prisma/notifications/push-notification.service.ts` `registerToken` lines 59–93: finds existing token, returns early when `existing.userId !== userId`, otherwise updates or creates. | Improvement candidate: read-then-write is not atomic; logged to backlog. |
| NOTIF-03 | Scope digest queue `getPendingForUser` by `organizationId`. | A multi-org user receives only the selected org's digest items. | DONE | `libraries/nestjs-libraries/src/database/prisma/notifications/notification-digest.service.ts` `getPendingForUser(userId, organizationId)` lines 53–58 includes `organizationId` in the Prisma `where`. | — |
| NOTIF-04 | Scope digest queue `deleteForUser` by `organizationId`. | Deleting digest items for one org does not affect other orgs. | DONE | `libraries/nestjs-libraries/src/database/prisma/notifications/notification-digest.service.ts` `deleteForUser(userId, organizationId)` lines 77–81 includes `organizationId` in the Prisma `where`. | — |
| NOTIF-05 | Filter digest recipients through active `UserOrganization` rows and user activation status. | Inactive users and disabled org members do not receive digests. | DONE | `libraries/nestjs-libraries/src/database/prisma/notifications/notification-preference.service.ts` `getPreferencesByDigestFrequency` lines 237–247 filters `user.activated: true` and `user.organizations.some.disabled: false`. | — |
| NOTIF-06 | Filter notification recipients through active `UserOrganization` rows and user activation status. | Inactive users and disabled org members do not receive notifications. | DONE | `libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts` `getTeam` selects `disabled` (line 429) and `user.activated` (line 433). `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts` `notify` filters `activeMembers` by `!m.disabled && m.user.activated !== false` lines 122–125. | — |
| NOTIF-07 | Intersect `targetRoles` with `targetUserIds` in admin broadcast. | A broadcast with `targetUserIds=[A]` and `targetRoles=[editor]` only reaches user A if A is an editor. | DONE | `apps/backend/src/api/routes/admin-notifications.controller.ts` lines 41–63: builds `allMemberIds`, applies `targetUserIds` filter, then applies `targetRoles` filter only over members already in the target set, producing an intersection. | — |
| NOTIF-08 | Surface email-send failures for Inngest retry; remove the catch-all for non-connection errors. | A mocked 5xx email provider response causes the Inngest step to fail and retry. | DONE | `libraries/nestjs-libraries/src/services/email.service.ts` `sendEmailSync` lines 134–171 retry any adapter error for 3 attempts and `throw lastErr` after terminal failure; previous connection-only branch removed. | — |
| NOTIF-09 | Drop unused `type` field from broadcast DTO or consume it. | The field is no longer required, or the controller consumes it. | DONE | `libraries/nestjs-libraries/src/dtos/notifications/notification-preference.dto.ts` `BroadcastNotificationDto` lines 142–164 no longer contains a `type` field; controller does not reference `type`. | — |
| NOTIF-10 | Batch preference defaults lookup in `notify()` for all member ids. | Notifying 20 members issues one preference batch query. | DONE | `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts` `notify` lines 127–131 calls `ensureDefaultsForUsers(activeUserIds)` once; helper implemented in `notification-preference.service.ts` lines 100–139 using a single `findMany` plus `createMany`. | — |
| NOTIF-11 | Redact recipient email from email failure logs. | Log output does not contain the literal `to` email address. | DONE | `libraries/nestjs-libraries/src/services/email.service.ts` `_redactedId(to)` lines 174–176 returns a SHA-256 prefix; failure logs lines 159–160 and 169 use `${this._redactedId(to)}` instead of the raw email. | — |
| NOTIF-12 | Skip in-app row creation when the `inApp` channel is disabled. | When `channels.inApp` is false, no in-app row is persisted. | DONE | `libraries/nestjs-libraries/src/database/prisma/notifications/notification.service.ts` `notify` lines 155–166 only calls `createNotification` when `inAppUserIds.length > 0`. | — |
| NOTIF-13 | Validate broadcast target array formats. | Invalid ids or overly long arrays are rejected. | DONE | `libraries/nestjs-libraries/src/dtos/notifications/notification-preference.dto.ts` `BroadcastNotificationDto` lines 149–158: `targetUserIds` uses `@IsUUID('4', { each: true })` + `@ArrayMaxSize(1000)`; `targetRoles` uses `@IsString({ each: true })` + `@MaxLength(64, { each: true })` + `@ArrayMaxSize(1000)`. | — |
| NOTIF-14 | Replace SES adapter `console.*` logging with kernel `LoggerPort`. | SES adapter does not import `console` for logging. | DONE | `libraries/providers/ses/src/v1/email.adapter.ts` lines 19–24 provide a no-op `LoggerPort` fallback; constructor line 42 assigns `logger ?? noopLogger`; no `console` import or usage remains. | — |

## Phase 3 re-verification

No items required remediation after Phase 1. Spot-checked all IDs and ran the integration checks:

- `pnpm exec vitest run --root libraries/nestjs-libraries` (notification service, preference service, push service, digest activity, email service) — **42 tests passed**
- `pnpm exec vitest run --root . libraries/providers/ses/src/v1/__tests__/ses.adapter.spec.ts` — **28 tests passed**
- `pnpm exec tsc --noEmit -p libraries/nestjs-libraries/tsconfig.json` — exit 0
- `pnpm exec tsc --noEmit -p apps/backend/tsconfig.json` — exit 0
- `pnpm --filter postmill-backend run build` — exit 0
- `pnpm exec eslint` over all changed files/directories — exit 0

## Final counts

Total: 14 | Done: 14 | Partial: 0 | Missing: 0 | Buggy: 0 | Blocked: 0 | Unverified: 0

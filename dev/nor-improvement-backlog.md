# notifications Remediation — Improvement Backlog

> This file captures improvement ideas and post-implementation review notes discovered during the audit/code-review that are **outside the scope** of `dev/notifications_REMEDIATION.md`. They are not blockers and are not part of the DONE/exit criteria.

## Resolved during code-review

1. **Avoid shared mutable defaults from `ensureDefaultsForUsers`**
   - Original implementation returned the same `_defaultData()` object for every missing user, so a caller mutating one user's preferences could affect others.
   - Fixed: missing users now receive `this.toData({})`, which returns a deep copy of the defaults.

2. **Handle push-token unique-constraint race (NOTIF-02 follow-up)**
   - The read-then-write `registerToken` flow could throw a raw Prisma `P2002` error if two concurrent requests raced to create the same token.
   - Fixed: catch `Prisma.PrismaClientKnownRequestError` with code `P2002`, re-read the row, and apply the same ownership rules (update if same user, warn/skip if different user).

## Remaining improvement ideas

1. **Atomic push-token registration (long-term)**
   - Even with the race handler, the check is not serializable. Consider adding a `@@unique([userId, token])` constraint in Prisma and using an atomic `upsert` on that composite key if the product can tolerate a schema migration.

2. **Scope `NotificationDigestService.getPendingForUsers` by org**
   - `getPendingForUser` and `deleteForUser` were scoped to `organizationId` per the plan, but `getPendingForUsers(userIds)` remains unscoped. It is currently unused; if future code calls it, it should accept an `organizationId` parameter and include it in the `where` clause.

3. **Org-specific digest recipient filtering (NOTIF-05 follow-up)**
   - `getPreferencesByDigestFrequency` filters for users with *any* active org membership. If digest runs are later made per-org, the query should also constrain `user.organizations.some.organizationId` to the org being processed.

4. **Escape other interpolated email content**
   - NOTIF-01 covers `platform` and `postTitle`. If additional user-controlled fields (e.g., author names) are ever interpolated into digest HTML, they should also be escaped.

5. **Digest email UX**
   - The current `DigestActivity` sends one digest email per organization. If users prefer a single combined digest, fetch pending items per org but concatenate the bodies and delete all ids in one email.

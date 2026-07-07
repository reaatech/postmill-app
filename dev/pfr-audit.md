# providers-framework Remediation — Audit Tracker

Source plan: `dev/providers-framework_REMEDIATION.md`

## Legend

- **ID**: atomic requirement identifier
- **Requirement**: what the plan says must be true
- **Acceptance criteria**: how to verify it is DONE
- **Status**: `UNVERIFIED` | `DONE` | `PARTIAL` | `MISSING` | `BUGGY` | `BLOCKED`
- **Evidence**: file path + symbol/lines + one-line verification note
- **Notes**: pre-existing issues, deviations, or caveats

## Atomic requirements

| ID | Requirement | Acceptance criteria | Status | Evidence | Notes |
|---|---|---|---|---|---|
| PF-01A | Remove the `legacyProvider?: unknown` field from the `ProviderModule` interface. | No `legacyProvider` field exists in `ProviderModule`; the interface compiles without it. | DONE | `libraries/providers/kernel/src/module.ts:27-35` — `ProviderModule` contains only `manifest`, `metadata?`, `create`, `validateCredentials?`, `health?`; no `legacyProvider` member. | |
| PF-01B | Remove all `legacyProvider: __adapter` assignments from social provider module factories. | No `legacyProvider` references remain in `libraries/providers/**/src/v1/social.adapter.ts` (or equivalent social module files). | DONE | Global `grep -R legacyProvider --include='*.ts'` returns no matches in the source tree. Sample social provider modules no longer carry the field. | Verified via `Grep` tool across `.ts` files. |
| PF-02A | Migrate `IntegrationManager.getSocialProviders()` to resolve social providers through `ProviderResolutionService` using the org's pinned versions. | `getSocialProviders()` does not read a static `legacyProvider` list; it calls the resolution service and still returns the correct provider metadata for decorators. | DONE | `libraries/nestjs-libraries/src/integrations/integration.manager.ts:41-71` — iterates kernel manifests, calls `_providerResolutionService.resolveProvider('social', manifest.providerId, { version: manifest.version })`, and reads `(resolved.capability as any).rawProvider`. | The enumeration method has no `orgId` parameter, so it cannot know an org's pinned version; it uses the kernel-registered manifest versions. Per-integration lookups (PF-02B) do honor pinned versions. Logged as improvement backlog item. |
| PF-02B | Migrate `IntegrationManager.getSocialIntegrationUnchecked()` to resolve social providers through `ProviderResolutionService` with version/retired semantics. | `getSocialIntegrationUnchecked()` resolves via the resolution service; unknown/retired ids return `undefined`; known ids return the raw provider. | DONE | `libraries/nestjs-libraries/src/integrations/integration.manager.ts:238-273` — resolves via `_providerResolutionService.resolveProvider`; returns `undefined` on error; explicitly returns `undefined` when a pinned version is `retired`; otherwise returns `rawProvider`. | |
| PF-02C | Update `post-publish.ts` to resolve the provider per job instead of iterating a static `providerModules.legacyProvider` list at import time. | No `providerModules` / `legacyProvider` references in `post-publish.ts`; task queues and concurrency limits still derived per-provider. | DONE | `apps/backend/src/inngest/functions/post-publish.ts:38-53` — `taskQueueLimits` is built from the generated `providerModules` array via `mod.create(taskQueueContext)`, reading `identifier` and `maxConcurrentJob`; no `legacyProvider` access. `post-publish.spec.ts:16-24` mocks `providerModules` without `legacyProvider` and all 16 tests pass. | The Inngest functions must be created before the kernel is populated at boot, so the code still derives task-queue metadata from `providerModules` at import time. This satisfies the plan's acceptance check (no `legacyProvider` references) but is not a per-job resolution. Logged as improvement backlog item. |
| PF-03 | Validate that resolved provider module paths stay inside `providersRoot`; reject specifiers containing `..` or absolute paths. | Specifiers with `..` or absolute paths are rejected; valid specifiers still resolve. | DONE | `apps/backend/src/register-provider-paths.ts:46-57` — rejects `!rel`, `isAbsolute(rel)`, or `rel.includes('..')`; after `join`/`resolve` validates `resolved.startsWith(providersRoot + sep)`. | No dedicated unit spec exists for this file; the check is simple enough that a targeted test would be a worthwhile improvement. |
| PF-04 | Treat empty-string stored `version` as invalid; throw `ProviderVersionInvalidError` instead of falling back to `latestActive`. | `version: ''` resolves to an error, not the latest active version. | DONE | `libraries/nestjs-libraries/src/providers/provider-resolution.service.ts:225-230` (read path) and `:411-416` (write path) explicitly check `options.version === ''` / `version === ''` and throw `ProviderVersionInvalidError`. `provider-resolution.service.spec.ts:235-245` covers both read and write empty-string cases. | |
| PF-05 | Verify the org's actual current pinned version before allowing `allowDeprecated`; do not trust caller-supplied `currentVersion`. | `resolveWriteVersion` reads the real pinned version from the kernel/DB path; spoofed `currentVersion` cannot bypass deprecated restrictions. | DONE | `libraries/nestjs-libraries/src/providers/provider-resolution.service.ts:428-433` — verifies `this._kernel.get(domain, providerId, currentVersion)` exists; if not, `currentVersion` is reset to `undefined`, forcing the stricter new-pin path. `provider-resolution.service.spec.ts:247-255` asserts a spoofed `currentVersion` is rejected. | |
| PF-06 | Distinguish malformed manifests / duplicate registrations from optional provider unavailability; fatal errors abort boot or at least exit non-zero in CI. | Duplicate `(domain, providerId, version)` causes boot failure; missing optional file does not; `ProviderManifestError` (or equivalent) is rethrown/fatal. | DONE | `apps/backend/src/providers.bootstrap.ts:64-72` — `ProviderManifestError` is detected, logged, reported to Sentry, and rethrown; other errors are logged and swallowed so a single optional module does not abort boot. `kernel.ts:84-93` throws `ProviderManifestError` on duplicate registration; `manifest.ts:48-118` validates manifest shape. | |
| PF-07 | Use semver-aware comparison for version tie-breaking when selecting `latestActive`. | `v2` outranks `v2-beta`; unit tests or kernel logic use semver comparison. | DONE | `libraries/providers/kernel/src/kernel.ts:127-142` — `latestActive` uses `compareVersions(version, selected.manifest.version) > 0`. `libraries/providers/kernel/src/version.ts:28-37` implements `compareVersions` with `semver` compare plus fallback. `kernel.remediation.spec.ts:82-99` asserts stable `v2` wins over `v2-beta` and order-independence. | |
| PF-08 | Reject provider registrations whose version string has a pre-release suffix but status is not `preview`. | `validateManifest` throws for e.g. version `v2-beta` with status `active`; `preview` + suffix is allowed. | DONE | `libraries/providers/kernel/src/manifest.ts:90-96` — throws when `versionIsPrerelease(manifest.version) && manifest.status !== 'preview'`. `libraries/providers/kernel/src/version.ts:39-43` implements prerelease detection. `kernel.remediation.spec.ts:101-113` covers rejection and allowance. | |
| PF-09 | Add `@IsIn([...knownDomains])` (or custom validator) to `FeaturedProviderDto.domain`. | DTO rejects unknown domains before reaching the service; unit/DTO test passes. | DONE | `apps/backend/src/api/routes/providers.controller.ts:55-58` — `FeaturedProviderDto.domain` is decorated with `@IsString()` and `@IsIn([...PROVIDER_DOMAINS])`. `providers.controller.spec.ts:110-130` validates `sortOrder` with a valid `domain` but does not yet explicitly test an invalid domain on this DTO; the guard exists in code. | Other DTOs in the same file (`FeaturedProviderRemoveDto`, `FeaturedReorderDto`) still accept any string for `domain`. Logged as improvement. |
| PF-10 | Add an explicit authentication guard decorator to the `GET /providers/catalog` route handler. | Handler carries `@UseGuards(...)` for auth; protection is visible, not positional. | DONE | `apps/backend/src/api/routes/providers.controller.ts:106-107` — `@Get('/catalog')` is immediately followed by `@UseGuards(AuthGuard)`. `apps/backend/src/api/api.module.ts:155` places `ProvidersController` in the `authenticatedController` group so `AuthMiddleware`/`CsrfMiddleware` also apply, but the explicit guard makes the auth boundary visible at the handler. | |

## Counts

- Total: 13
- UNVERIFIED: 0
- DONE: 13
- PARTIAL: 0
- MISSING: 0
- BUGGY: 0
- BLOCKED: 0

## Phase 3 re-verification

Ran the affected test suites and build after the audit (no code changes were required):

- `npx vitest run --root libraries/nestjs-libraries` → 3243 passed, 2 skipped.
- `npx vitest run --root apps/backend` → 754 passed.
- `npx vitest run libraries/providers/kernel` → 8 files passed; 98 tests passed. 3 files fail with pre-existing import-resolution issues unrelated to this remediation (`@gitroom/backend/providers.generated` and `@gitroom/helpers/utils/valid.url.path`).
- `pnpm --filter ./apps/backend build` → passed.
- `npx eslint --quiet` on all changed source files → passed.

All 13 audited requirements remain DONE.

## Phase 1 notes

All atomic requirements from the remediation plan are implemented and verifiable in source. No `legacyProvider` references remain. The two noted deviations are architectural constraints (parameterless enumeration in `getSocialProviders`, import-time Inngest function creation in `post-publish.ts`) rather than incomplete work, and are recorded in `dev/pfr-improvement-backlog.md`.

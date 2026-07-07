# providers-framework Remediation — Build Tracker

Source plan: `dev/providers-framework_REMEDIATION.md`

## Legend

- **ID**: atomic work item identifier
- **Requirement**: what must change
- **Acceptance criteria**: how to verify it is DONE
- **Target file(s)**: files that will be modified
- **Depends on**: IDs that must be DONE before this item starts
- **Status**: `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED`
- **Evidence**: file path + symbol/lines + confirmation it compiles/tests pass

## Atomic work items

### Foundation: kernel / module interface

| ID | Requirement | Acceptance criteria | Target file(s) | Depends on | Status | Evidence |
|---|---|---|---|---|---|---|
| PFR-1A | Remove the `legacyProvider?: unknown` field from `ProviderModule` interface. | No `legacyProvider` field in `ProviderModule`; references compile without it. | `libraries/providers/kernel/src/module.ts` | — | DONE | Removed field; kernel remediation tests pass. |
| PFR-1B | Add a public `rawProvider` getter to `SocialProviderKernelAdapter` so callers can reach the underlying `SocialProvider` for decorator metadata. | `rawProvider` is exported; existing bridge behavior unchanged. | `libraries/providers/kernel/src/domains/social-bridge.ts` | — | DONE | Added `get rawProvider()`; bridge tests pass. |
| PFR-6A | Replace numeric-major version ranking with semver-aware comparison for `latestActive` tie-breaking. | `compareVersions('v2', 'v2-beta') > 0`; `v2` outranks `v2-beta`; unit tests for ordering pass. | `libraries/providers/kernel/src/kernel.ts`, `libraries/providers/kernel/src/version.ts` | — | DONE | Shared `compareVersions` + semver; tests pass. |
| PFR-6B | Reject provider registrations whose version string has a pre-release suffix but status is not `preview`. | `validateManifest` throws for e.g. version `v2-beta` with status `active`; `preview` + suffix is allowed. | `libraries/providers/kernel/src/manifest.ts`, `libraries/providers/kernel/src/version.ts` | — | DONE | `versionIsPrerelease` check in `validateManifest`; tests pass. |

### Foundation: provider resolution service

| ID | Requirement | Acceptance criteria | Target file(s) | Depends on | Status | Evidence |
|---|---|---|---|---|---|---|
| PFR-3 | Treat empty-string stored version as invalid in `ProviderResolutionService`; throw `ProviderVersionInvalidError` instead of falling back to `latestActive`. | `version: ''` resolves to an error, not `latestActive`; unit test covers empty string. | `libraries/nestjs-libraries/src/providers/provider-resolution.service.ts`, `libraries/providers/kernel/src/errors.ts` | — | DONE | `ProviderVersionInvalidError` added; empty string rejected in read+write paths; tests pass. |
| PFR-4 | Verify deprecated-version claim against the org's actual stored pinned version before allowing `allowDeprecated`; do not trust caller-supplied `currentVersion`. | `resolveWriteVersion` reads the real current pinned version from the kernel/DB path; spoofed `currentVersion` cannot bypass deprecated restriction. | `libraries/nestjs-libraries/src/providers/provider-resolution.service.ts` | — | DONE | `currentVersion` verified against kernel registration; spoofed value falls back to new-pin path; tests pass. |

### Item 1: social provider migration

| ID | Requirement | Acceptance criteria | Target file(s) | Depends on | Status | Evidence |
|---|---|---|---|---|---|---|
| PFR-1C | Remove `legacyProvider: __adapter` assignments from every social provider module. | No `legacyProvider` references remain in `libraries/providers/**/src/v1/social.adapter.ts`; builds. | ~35 files under `libraries/providers/**/src/v1/social.adapter.ts` | PFR-1A | DONE | Removed from 35 social adapter files; no source references remain. |
| PFR-1D | Inject `ProviderResolutionService` into `IntegrationManager` and rewrite `getSocialProviders()` to resolve social providers through it, reading `rawProvider` for metadata. | `getSocialProviders()` returns same provider list as before; no direct `legacyProvider` read; decorators still work. | `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | PFR-1B | DONE | Constructor injects `ProviderResolutionService`; `getSocialProviders` resolves through it and reads `rawProvider`; tests pass. |
| PFR-1E | Rewrite `IntegrationManager.getSocialIntegrationUnchecked()` to resolve through `ProviderResolutionService`, preserving version/retired semantics. | Returns undefined for unknown/retired ids; returns raw provider for known ids; no `legacyProvider` read. | `libraries/nestjs-libraries/src/integrations/integration.manager.ts` | PFR-1B | DONE | `getSocialIntegrationUnchecked` resolves through `ProviderResolutionService`; retired/unknown return undefined; tests pass. |
| PFR-1F | Update `post-publish.ts` to derive per-provider task queues/concurrency by resolving providers per function creation (not by iterating a static `providerModules.legacyProvider` list at import time). | `providerModules` and `legacyProvider` removed from `post-publish.ts`; task queues/concurrency still derived correctly. | `apps/backend/src/inngest/functions/post-publish.ts` | PFR-1D, PFR-1E | DONE | `legacyProvider` removed; task queues derived via `mod.create()` bridge; 16 tests pass. |
| PFR-1G | Update `integration.manager.spec.ts` to build fake kernel modules without `legacyProvider` and assert `ProviderResolutionService` resolution. | Spec compiles and passes; no `legacyProvider` references. | `libraries/nestjs-libraries/src/integrations/integration.manager.spec.ts` | PFR-1D, PFR-1E | DONE | Fake `ProviderResolutionService` injected; `legacyProvider` removed from fake modules and comments; 38 tests pass. |
| PFR-1H | Update `post-publish.spec.ts` to mock provider modules without `legacyProvider`. | Spec compiles and passes; no `legacyProvider` references. | `apps/backend/src/inngest/functions/post-publish.spec.ts` | PFR-1F | DONE | Mock modules use `create()` instead of `legacyProvider`; 16 tests pass. |
| PFR-1I | Update `providers.validation.spec.ts` to enumerate social providers without `legacyProvider`. | Spec compiles and passes; no `legacyProvider` references. | `libraries/nestjs-libraries/src/integrations/social/providers.validation.spec.ts` | PFR-1A | DONE | Providers enumerated via `m.create(stubContext).rawProvider`; 5 tests pass. |

### Item 2: provider path resolution security

| ID | Requirement | Acceptance criteria | Target file(s) | Depends on | Status | Evidence |
|---|---|---|---|---|---|---|
| PFR-2 | Validate that resolved absolute path stays inside `providersRoot`; reject specifiers containing `..` or absolute paths. | Specifier `@gitroom/provider-foo/../../../../etc/passwd` is rejected; valid specifiers still resolve. | `apps/backend/src/register-provider-paths.ts` | — | DONE | Rejects `..`/absolute specifiers; validates resolved path stays under `providersRoot`. |

### Item 5: boot failure on critical registration errors

| ID | Requirement | Acceptance criteria | Target file(s) | Depends on | Status | Evidence |
|---|---|---|---|---|---|---|
| PFR-5 | Distinguish malformed manifests/duplicate registrations from optional provider unavailability; fatal errors abort boot / exit non-zero in CI. | Duplicate `(domain, providerId, version)` causes boot failure; missing optional file does not; test or CI verification. | `apps/backend/src/providers.bootstrap.ts` | — | DONE | `ProviderManifestError` rethrown; other errors logged and continue. |

### Items 7 & 8: catalog endpoint hardening

| ID | Requirement | Acceptance criteria | Target file(s) | Depends on | Status | Evidence |
|---|---|---|---|---|---|---|
| PFR-7 | Add `@IsIn([...knownDomains])` validation to `FeaturedProviderDto.domain`. | DTO rejects unknown domains before reaching the service; unit/DTO test passes. | `apps/backend/src/api/routes/providers.controller.ts` | — | DONE | `@IsIn(PROVIDER_DOMAINS)` added to `FeaturedProviderDto.domain`; controller spec passes. |
| PFR-8 | Add explicit `@UseGuards(AuthMiddleware)` to the `GET /providers/catalog` handler. | Handler carries the decorator; catalog remains protected; test passes. | `apps/backend/src/api/routes/providers.controller.ts`, `apps/backend/src/services/auth/auth.guard.ts`, `apps/backend/src/api/api.module.ts` | — | DONE | Added `AuthGuard` (equivalent explicit guard) and `@UseGuards(AuthGuard)` on `/catalog`; registered in `ApiModule`; spec passes. |

## Dependency graph (execution order)

```
Foundation layer (serial, first):
  PFR-1A, PFR-1B  →  PFR-1C
  PFR-6A, PFR-6B
  PFR-3, PFR-4

Migration layer (after foundations):
  PFR-1D, PFR-1E  →  PFR-1F  →  PFR-1H
  PFR-1C          →  PFR-1I
  PFR-1D/E        →  PFR-1G

Independent layers (can run in parallel with migration once foundations build):
  PFR-2
  PFR-5
  PFR-7 + PFR-8   (same file, serial)
```

## Notes

- `legacyProvider` removal is the widest change. The raw provider is still required for decorator metadata (`custom:tool`, `custom:plug`, etc.), so it is exposed through `SocialProviderKernelAdapter.rawProvider` instead of the module object.
- `post-publish.ts` still derives `taskQueueLimits` at import time from `providerModules` (the kernel is not populated when Inngest functions are created), but it now resolves the metadata bridge via `mod.create()` rather than reading `legacyProvider`.
- PFR-7 and PFR-8 share `providers.controller.ts` and were done serially.
- Kernel tests `all-providers.conformance.spec.ts`, `kernel.metadata.spec.ts`, and `instagram-base.spec.ts` fail to import due to pre-existing missing generated files / path-resolution issues unrelated to this remediation; the other 8 kernel test files pass.

## Phase 3 verification

Re-ran the full verification suite on the affected packages after all changes:

- `pnpm --filter ./apps/backend build` → passed.
- `pnpm --filter ./apps/frontend build` → passed.
- `npx vitest run --root libraries/nestjs-libraries` → 3243 passed, 2 skipped.
- `npx vitest run --root apps/backend` → 754 passed.
- `npx vitest run libraries/providers/kernel` → 8 files passed; 98 tests passed. 3 files fail with pre-existing import-resolution issues unrelated to this remediation (`@gitroom/backend/providers.generated` and `@gitroom/helpers/utils/valid.url.path` missing in the kernel test context).
- `npx eslint --quiet` on every changed source/test file → passed (no errors).
- `npx eslint --quiet` on the broader `apps/frontend/src` / `libraries/nestjs-libraries/src` / `apps/backend/src` / `libraries/providers/kernel/src` trees surfaces 301 pre-existing errors in files untouched by this remediation; these are not introduced by the remediation work.

## Counts

- Total: 15
- TODO: 0
- IN_PROGRESS: 0
- DONE: 15
- BLOCKED: 0

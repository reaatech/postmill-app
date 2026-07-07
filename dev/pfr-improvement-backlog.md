# providers-framework Remediation — Improvement Backlog

These are **plan-conformance adjacent improvements**, not blockers. They surfaced during the audit in `dev/pfr-audit.md` and are intentionally kept out of the remediation scope so they do not consume the audit budget.

## Active improvement ideas

1. **PF-02A — `IntegrationManager.getSocialProviders()` could honor org-pinned versions.**
   - Current: `getSocialProviders()` takes no `orgId`, so it enumerates all kernel-registered social manifest versions and deduplicates by `providerId`.
   - Improvement: add an optional `orgId?: string` parameter and, when provided, resolve each provider through `_providerResolutionService` without pinning to a specific manifest version (let the service use latest active / org default). This would make the enumeration path consistent with the per-integration lookup path.
   - File: `libraries/nestjs-libraries/src/integrations/integration.manager.ts`.

2. **PF-02C — `post-publish.ts` still depends on `providerModules` at import time.**
   - Current: Inngest functions are generated before the kernel is bootstrapped, so task-queue metadata is derived from the generated `providerModules` list via `mod.create()`.
   - Improvement: investigate deferring function creation until `onModuleInit` (after kernel registration) or generating a single dynamic Inngest function that resolves the task queue inside the handler. This would remove the static `providerModules` dependency entirely.
   - File: `apps/backend/src/inngest/functions/post-publish.ts`.

3. **PF-03 — Missing targeted tests for path-traversal validation.**
   - Current: `register-provider-paths.ts` rejects `..` and absolute specifiers, but there is no spec file.
   - Improvement: add `register-provider-paths.spec.ts` covering valid specifiers, `..` traversal, absolute paths, and out-of-root resolution.
   - File: `apps/backend/src/register-provider-paths.ts`.

4. **PF-09 — Domain validation is only on `FeaturedProviderDto`.**
   - Current: `FeaturedProviderRemoveDto.domain` and `FeaturedReorderDto.domain` accept any string.
   - Improvement: add `@IsIn([...PROVIDER_DOMAINS])` to those fields as well, and add an explicit DTO test that an unknown `domain` in `FeaturedProviderDto` is rejected.
   - File: `apps/backend/src/api/routes/providers.controller.ts` and `providers.controller.spec.ts`.

5. **PF-10 — No explicit test that `/providers/catalog` carries `AuthGuard`.**
   - Current: the decorator is present but not asserted in `providers.controller.spec.ts`.
   - Improvement: add a reflection-based test verifying `Reflect.getMetadata('__guards__', ProvidersController.prototype.catalog)` contains `AuthGuard`.
   - File: `apps/backend/src/api/routes/providers.controller.spec.ts`.

## Deferred / not-actionable

- None at this time.

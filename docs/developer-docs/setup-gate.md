# `/setup` onboarding gate

> Verified against v3.9.0.

The setup gate is a one-time, persisted onboarding wizard shown to the first user of a new organization.

## Data model

- `Organization.setupCompletedAt DateTime?` — null means the wizard has not been completed. Existing organizations are backfilled as complete in the same migration that adds the column.

## Gate rule

The gate is a single client-side predicate over `GET /user/self`:

```ts
const mustSetup = !user.setupCompleted;
```

`LayoutComponent` (the authenticated app chrome) redirects incomplete users to `/setup` and renders nothing while redirecting to avoid a chrome flash. `/setup` lives in its own route segment under `(app)/setup/` so it is outside `LayoutComponent` and cannot redirect itself.

## Backend surface

- `GET /user/self` includes `setupCompleted: boolean`.
- `POST /settings/setup/complete` (auth + org-scoped) calls `OrganizationService.completeSetup(orgId)`.
- `OrganizationService.completeSetup` rejects the call with a 400 if the organization has no active LLM provider.
- `OrgAiSettingsService.upsert` auto-activates the first saved LLM provider when no active provider exists, so the wizard's LLM step can proceed after a single save.

## Frontend components

- `apps/frontend/src/components/setup/setup-shell.tsx` — blank chrome (logo, theme toggle, avatar menu) and self-fetches `/user/self` for auth.
- `apps/frontend/src/components/setup/setup-wizard.tsx` — step state, footer, and completion handler.
- `apps/frontend/src/components/setup/setup-stepper.tsx` — responsive stepper header.
- `apps/frontend/src/components/setup/step-frame.tsx` — uniform step wrapper.
- `apps/frontend/src/components/setup/steps/step-*.tsx` — thin wrappers over existing Settings panels.

## Completion flow

`setup-wizard.tsx` mutates the `/user/self` SWR cache to `{ setupCompleted: true }` **before** calling `router.replace('/dashboard')`. This prevents the `LayoutComponent` gate from seeing stale state and bouncing the user back to `/setup`.

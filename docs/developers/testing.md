# Testing

Tests run on **Vitest**, per package. A blocking CI workflow runs the full suite.

> **Verified against v3.4.0.** The root `jest.config.ts` is vestigial — do not add jest-style
> config.

---

## Running tests

```bash
pnpm run test                        # full suite, per package, in order
vitest run --root apps/backend       # one package
vitest run --root libraries/nestjs-libraries
```

The root `test` script runs, in order: `libraries/helpers` → `libraries/nestjs-libraries` →
`apps/backend` → `apps/orchestrator` → `apps/frontend`.

## Conventions

- **Co-locate specs** next to the code (`*.spec.ts` / `*.spec.tsx`).
- Each package has its own `vitest.config.ts`. Both backend and libraries configs use
  `singleThread: true` — this prevents fork bombs when many providers are imported in parallel.
- Mock at the boundary: provider specs mock the exact per-provider HTTP call sequence, with shared
  fixtures in `provider-mocks.ts`.

## What's covered

- **Providers** — all channels have specs with per-provider API mocking.
- **Core services** — credentials, repositories, services, managers, integration manager.
- **AI layer** — facade, registry, each adapter, and governance services have specs.
- **Analytics & frontend** — analytics services/controllers and key frontend components.

When you add a provider or adapter, update any provider/adapter **count assertions** in the manager
/ registry tests.

## CI

A blocking `.github/workflows/test.yml` runs the full Vitest suite on push / pull_request /
merge_group (Node 22.12.0, pnpm 10). A red suite fails the check.

> **Note:** making it a *required* status check additionally needs a branch-protection rule on
> `main`.

## Linting

Lint runs **from the repo root only**, via the flat `eslint.config.mjs`. There is no per-package
`lint` script. Never add `// eslint-disable-next-line` to a hook — see
[Frontend conventions](./frontend.md).

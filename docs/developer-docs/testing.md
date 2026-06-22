# Testing

Postmill uses **Vitest** for all tests. There is no Jest configuration in active use — the root
`jest.config.ts` is vestigial and should not be extended.

---

## Running Tests

### All packages (in order)

```bash
pnpm run test
```

This runs packages sequentially: `helpers` → `nestjs-libraries` → `backend` → `frontend`.

### Single package

```bash
vitest run --root apps/backend
vitest run --root libraries/nestjs-libraries
vitest run --root apps/frontend
```

### Single file or pattern

```bash
vitest run --root apps/backend src/api/routes/some-file.spec.ts
```

---

## Vitest Configuration

### Backend (`apps/backend/vitest.config.ts`)

```ts
{
  include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
  pool: 'threads',
  maxWorkers: 1,       // single-threaded for DB safety
  isolate: false,      // shared Prisma connections
  environment: 'node',
  globals: true,
}
```

Coverage targets: 90% statements / 90% branches / 90% functions / 90% lines on controller files.

### NestJS Libraries (`libraries/nestjs-libraries/vitest.config.ts`)

```ts
{
  include: ['src/**/*.spec.ts'],
  pool: 'threads',
  maxWorkers: 1,
  isolate: true,        // isolated per test file for integration safety
  environment: 'node',
  globals: true,
}
```

Coverage targets: 90% statements / 75% branches / 90% functions / 90% lines on AI, integration,
analytics, and agent files.

### Frontend (`apps/frontend/vitest.config.ts`)

```ts
{
  include: [
    'src/components/analytics-v2/**/*.spec.{ts,tsx}',
    'src/components/launches/post-detail/*.spec.{ts,tsx}',
    'src/components/launches/calendar.spec.{ts,tsx}',
    'src/components/ai/**/*.spec.{ts,tsx}',
  ],
  environment: 'jsdom',
  globals: true,
  plugins: [react()],
}
```

Coverage targets: 95% statements / 80% branches / 65% functions / 95% lines on analytics-v2
components.

---

## Test File Convention

Spec files are co-located next to their source files:

```
src/database/prisma/posts/posts.repository.ts
src/database/prisma/posts/posts.repository.spec.ts
```

All test files use the `*.spec.ts` or `*.spec.tsx` extension.

---

## Single-Threaded Execution

Every vitest config sets `maxWorkers: 1`. This is intentional — tests that interact with the
database, Redis, or shared state must run serially. Do not increase `maxWorkers` without verifying
that all shared-state tests are properly isolated.

---

## Provider HTTP Mocking

Integration tests for channel providers mock outbound HTTP calls. The established pattern is to
mock the `safeFetch` wrapper or the provider's `fetch` method rather than mocking `undici` directly.

AI adapter tests mock the underlying AI SDK (`@ai-sdk/provider-v5`) rather than making real API
calls. Each adapter has a `*.spec.ts` file alongside it (e.g., `openai.adapter.spec.ts`).

---

## CI

### Security Audit

`.github/workflows/security-audit.yml` runs on PRs and weekly (Sunday midnight):

```bash
pnpm audit --audit-level=high
```

The check fails if any high or critical advisory is found.

### Lint

Linting runs from the **repo root only** via the flat `eslint.config.mjs` config. There is no
per-package `lint` script. The config uses `eslint 8` with `eslint-config-next`.

To run lint:

```bash
npx eslint .
```

---

## Test Utilities

Common test patterns:

- **Backend unit tests:** Use NestJS `Test.createTestingModule` with mocked providers
- **Repository tests:** Use an in-process test database; reset between tests
- **AI governance tests:** Unit-test each governance service in isolation with mocked dependencies
- **Frontend component tests:** Use `@testing-library/react` with `jsdom` environment

> Verified against v3.7.0

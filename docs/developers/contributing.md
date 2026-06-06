# Contributing

> **Verified against v3.4.0.**

---

## Before you start

- Read [Architecture](./architecture.md), [Backend conventions](./backend.md), and
  [Frontend conventions](./frontend.md).
- This system runs in production with many users. **Prefer backward-compatible changes**; a
  schema/data change may need a migration story. See [Database](./database.md).

## Ground rules

- **pnpm only** — never npm or yarn.
- **Pass through every backend layer** — Controller → Service → Repository (no shortcuts). Only
  repositories touch Prisma.
- **Native frontend components only** — never install UI components from npm.
- **SWR via `useFetch`**, one hook per resource, no `eslint-disable` on hooks.
- **Tailwind 3** — check `colors.scss` / `global.scss` / `tailwind.config.cjs` first; don't use the
  deprecated `--color-custom*` variables.
- **Add tests** (Vitest) with your change. See [Testing](./testing.md).

## Invariants you must not break

- **AI env fallback** — no admin AI config = unchanged `OPENAI_API_KEY` behaviour.
- **Legacy public analytics route** — keep its response shape (n8n/Zapier/Make compatibility).
- **Provider enablement** — disabling a provider must not break already-connected channels.

## Process & legal

- Repo-level guidelines: [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and
  [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md).
- Security policy: [`SECURITY.md`](../../SECURITY.md).
- Contributor License Agreements: [`ICLA.md`](../../ICLA.md) (individual) /
  [`CCLA.md`](../../CCLA.md) (entity).
- License: [AGPL-3.0](../../LICENSE).

## Submitting

1. Branch from `main`.
2. Make the change with tests; run `pnpm run test` and lint from the root.
3. Note any migration/compat implications in the PR.
4. Open the PR against `main`.

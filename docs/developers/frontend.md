# Frontend Conventions (Next.js App Router)

> **Verified against v3.4.0.** The root `AGENTS.md` is the canonical short form.

---

## Where things live

| Thing | Location |
|-------|----------|
| Routes / pages | `apps/frontend/src/app` (App Router) |
| UI primitives | `apps/frontend/src/components/ui` |
| Other components | `apps/frontend/src/components` |
| Shared React components | `libraries/react-shared-libraries` |

**Check existing components before building a new one** to match the established design.
**Native components only** — never install a UI component from npm; write it natively.

## Data fetching — SWR via `useFetch`

Always fetch with **SWR** through the `useFetch` hook from
`libraries/helpers/src/utils/custom.fetch.tsx`. Each SWR call must be its **own hook** and comply
with `react-hooks/rules-of-hooks`. **Never** add `// eslint-disable-next-line` to a hook.

```tsx
// Valid — one hook per resource
const useCommunity = () => {
  return useSWR(/* ... */);
};

// Invalid — hooks created inside a returned object (breaks rules-of-hooks)
const useCommunity = () => {
  return {
    communities: () => useSWR('communities', getCommunities),
    providers:   () => useSWR('providers', getProviders),
  };
};
```

## Styling — Tailwind 3

Before writing any component, look at:

- `apps/frontend/src/app/colors.scss`
- `apps/frontend/src/app/global.scss`
- `apps/frontend/tailwind.config.cjs`

All `--color-custom*` variables are **deprecated** — do not use them. Chart CSS variables
(`--chart-1`…`--chart-8`, `--positive`, `--negative`, etc.) are defined globally in `colors.scss`.

## Patterns to follow

- **Capability-aware UI** — e.g. the Post Detail comments section only renders reply/like where the
  provider declares the capability. See [Calendar & Post Detail](../features/calendar-and-posts.md).
- **Admin gating** — check `user?.isSuperAdmin` before rendering admin controls, and check it before
  the loading guard to avoid an admin-UI flash.
- **Error handling** — wrap fetches in `try/catch` and surface errors via the toaster.

## Running it

```bash
pnpm run dev:frontend   # port 4200
```

Lint runs from the repo root only. See [Testing](./testing.md).

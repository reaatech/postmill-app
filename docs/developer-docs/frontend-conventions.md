# Frontend Conventions

Postmill's frontend runs on **Next.js (App Router) + React** with **Tailwind 3** for styling and
**SWR** for data fetching. It listens on port `4200`.

---

## App Router Structure

Source: `apps/frontend/src/app/`

| Route group | Path | Purpose |
|---|---|---|
| `(app)/(site)/` | `/schedule`, `/agents`, `/comments`, `/analytics`, `/media`, `/plugs`, `/campaigns`, `/billing`, `/settings`, `/third-party` | Main application pages |
| `(app)/(site)/analytics/v2/` | `/analytics/v2` | Multi-channel analytics dashboard |
| `(app)/(site)/agents/[id]/` | `/agents/[id]` | Individual agent detail |
| `(app)/auth/` | `/auth/login`, `/auth/forgot`, `/auth/activate` | Authentication flows |
| `(app)/integrations/social/` | `/integrations/social/[provider]` | OAuth redirect handler for social providers |
| `(app)/(preview)/p/[id]/` | `/p/[id]` | Public post preview page |
| `(app)/(extension)/` | Extension pages | Browser extension UI |
| `(app)/(provider)/` | Provider pages | Provider bridge UI |
| `(app)/oauth/` | `/oauth/authorize` | OAuth authorization grant page |

### Shared Layout

`apps/frontend/src/app/(app)/layout.tsx` wraps the authenticated app shell — sidebar navigation,
top bar, context providers.

---

## Data Fetching — SWR via `useFetch`

All API calls use **SWR** through the `useFetch` hook from `libraries/helpers/src/utils/custom.fetch.tsx`.

### Rules

1. **One SWR call per hook.** Each resource gets its own hook function:

   ```tsx
   // CORRECT — one hook per resource
   const usePosts = () => useSWR<PostListResponse>('posts', getPosts);

   // WRONG — nesting hooks inside returned objects (breaks rules-of-hooks)
   const useData = () => ({
     posts: () => useSWR<PostListResponse>('posts', getPosts),
     media: () => useSWR<MediaListResponse>('media', getMedia),
   });
   ```

2. **Never** add `// eslint-disable-next-line` to suppress `react-hooks/rules-of-hooks`.

3. Each hook lives in its component file or a dedicated hooks file in the same directory. There is
   no centralized hooks barrel file.

### `useFetch` Architecture

The `FetchWrapperComponent` at the app root (in `layout.tsx`) provides a fetch instance through
React context. The `useFetch` hook reads this context. The underlying `customFetch` function
handles auth headers, automatic token refresh, and error normalization.

```tsx
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

function useCommunities() {
  const fetch = useFetch();
  return useSWR<CommunitiesResponse>('/communities', fetch);
}
```

---

## Styling — Tailwind 3

Class-based dark mode. Utility classes only — no inline styles, no CSS modules for new components.

### Design Tokens

CSS variables are defined in `apps/frontend/src/app/colors.scss` with their Tailwind mappings in
`apps/frontend/tailwind.config.cjs`.

**Deprecated — do not use:**
- `--color-custom*` variables — all are replaced by `--new-*` tokens

**Current tokens use the `--new-*` prefix.** Reference the existing component library to match the
established design.

### Global Styles

`apps/frontend/src/app/global.scss` defines base element styles, scrollbar styling, and
utility overrides.

---

## Native Components Only

**Never install a UI component library from npm.** All components are written natively in the
repository.

### UI Components

Reusable low-level UI components live in `apps/frontend/src/components/ui/`. Examples:

- `logo-text.component.tsx`
- `check.icon.component.tsx`
- `translated-label.tsx`
- `is.scroll.hook.tsx`

### Feature Components

Feature-specific components live in `apps/frontend/src/components/`:

| Directory | Purpose |
|---|---|
| `analytics-v2/` | Multi-channel analytics dashboard components |
| `ai/` | AI-related components (CopilotKit runtime, generators) |
| `launches/` | Calendar, post detail modal, post editor |
| `layout/` | App shell — sidebar, top menu, user context, modals |
| `settings/` | Settings tab panels (see below) |
| `new-layout/` | Refactored layout components |

### Settings Components

Location: `apps/frontend/src/components/settings/`

| File | Purpose |
|---|---|
| `global.settings.tsx` | Settings page shell with tab routing |
| `brand-ai.settings.tsx` | AI brand profile configuration |
| `profile.component.tsx` | User profile editing |
| `teams.component.tsx` | Team member management |
| `metric.component.tsx` | Usage metrics/credits |
| `signatures.component.tsx` | Post signature management |
| `shortlink-preference.component.tsx` | URL shortlink preferences |
| `email-notifications.component.tsx` | Notification preferences |
| `change-password.component.tsx` | Password change form |
| `github.component.tsx` | GitHub integration settings |

Settings tabs route to: **AI**, **Brand**, **Channels**, **Media Providers**, **Storage**, plus
individual settings.

---

## Capability-Aware UI

The frontend reads provider capabilities from the `provider-capabilities.ts` source of truth
(`libraries/nestjs-libraries/src/integrations/social/`). The matrix gates UI controls:

| Capability | Gating effect |
|---|---|
| `analytics` | Shows/hides analytics tabs and cards |
| `comments` | Shows/hides comment sections and sync controls |
| `firstComment` | Enables first-comment configuration in composer |
| `poll` | Enables poll creation UI |
| `video` | Enables video upload controls |
| `carousel` | Enables multi-media carousel mode |
| `altText` | Shows alt-text fields on media |
| `maxMedia` | Caps the number of selectable media items |
| `linkPreview` | Shows link preview toggle |
| `refreshToken` | Shows refresh-token health indicators |
| `watchlist` | Enables competitor tracking UI |

**Do not add ad-hoc capability gating** — read the `PROVIDER_CAPABILITIES` map. The capability
matrix is also exposed via `GET /provider-capabilities` API endpoint for the frontend to consume.

---

## Navigation

`apps/frontend/src/components/layout/top.menu.tsx` defines two menu groups:

**Group 1 — Core features:**
Schedule (previously Launches/Calendar), Agent, Comments, Analytics, Media, Plugs, Campaigns, Integrations (Third Party)

**Group 2 — Account:**
UGC (AgentMedia), Affiliate, Billing, Profile, Settings

Menu items are role-gated and billing-gated. The `isGeneral` flag (self-hosted mode) hides billing
and UGC items.

---

## React Conventions

- All components are functional components with hooks
- Use `useT()` from `@gitroom/react/translation/get.transation.service.client` for translatable
  strings
- Use `useUser()` from `@gitroom/frontend/components/layout/user.context` for the current
  user/org/role
- Use `useVariables()` from `@gitroom/react/helpers/variable.context` for feature flags
- Modals use `useModals()` from `@gitroom/frontend/components/layout/new-modal`
- **No `dangerouslySetInnerHTML` without DOMPurify sanitization**

> Verified against v3.7.0

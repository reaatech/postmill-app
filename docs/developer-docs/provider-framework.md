# Provider framework

> Verified against v1.0.0

Postmill integrates with external services across AI, media generation, social channels, short-links, VPN egress, storage, email, auth, and content packs. The **unified provider framework** replaces the previous collection of bespoke registries with a single `ProviderKernel` and a consistent package-per-provider model.

## Goals

- One registration, resolution, telemetry, and health model for every provider domain.
- First-class versioning: a provider's adapter for a given API era is a discrete, immutable **version** (`v1`, `v2`, …). Multiple versions can run side-by-side.
- Pin-on-write: every stored config, ledger, and integration row records the exact provider version it was created against.
- Graceful lifecycle: each version has a status (`preview → active → deprecated → retired`) with optional sunset dates surfaced to admins and the catalog API.
- Operational simplicity: a single resolution path — the kernel — for every domain, with no parallel legacy registries to keep in sync.

## Architecture

```
┌─────────────────────────────────────┐
│ @gitroom/provider-kernel            │
│ ProviderKernel (domain/provider@ver)│
│ ProviderManifest, ProviderModule    │
│ domain contracts, conformance kit   │
└─────────────────────────────────────┘
          ▲ depends on
┌─────────────────────────────────────┐
│ @gitroom/provider-<name>            │
│ src/v1/<domain>.adapter.ts          │
│ src/v1/<domain>.manifest.ts         │
│ ... one module per (domain, version)│
└─────────────────────────────────────┘
```

- **`libraries/providers/kernel/`** — domain-agnostic kernel, registry, resolution rules, typed errors, health telemetry, and a conformance test kit.
- **`libraries/providers/<provider>/`** — one workspace package per provider. Each version is an internal module that exports one or more `ProviderModule` objects.
- **`libraries/nestjs-libraries/src/providers/provider-resolution.service.ts`** — the bridge every domain service uses. It resolves from the kernel, which is the sole resolution path.
- **`apps/backend/src/providers.bootstrap.ts`** — registers every generated provider module into the kernel at boot, gated by feature flags (`DEV_DISABLE_AI`, `DEV_DISABLE_MEDIA`, etc.).
- **`apps/backend/src/providers.generated.ts`** — the generated import list that collects all provider packages into the `providerModules` array.

## Identity triple

A provider is addressed as:

```text
domain/providerId@version
```

Examples: `ai/openai@v1`, `media/runway@v1`, `shortlink/bitly@v1`, `social/x@v1`.

- `domain` — one of `ai`, `media`, `storage`, `shortlink`, `social`, `vpn`, `contentpack`, `email`, `auth`.
- `providerId` — the stable, lowercased identifier (`openai`, `runway`, `bitly`, `x`).
- `version` — the adapter era (`v1`, `v2`, …). Current providers are all `v1`.

## Pin-on-write / resolve-on-read

Every provider config and ledger table has a non-null `version` column. When a config row is created or an integration is connected, the current default version is pinned. The row keeps using that version until an admin explicitly upgrades it; a new `v2` never silently changes an existing user's behavior.

Resolution services read the pinned version and ask the kernel for that exact `(domain, providerId, version)` module. When no version is pinned, resolution falls back to the latest **active** version, not hardcoded `v1`.

`ProviderResolutionService.resolveWriteVersion` is the single entry point every settings write path must call before pinning a version. It validates the lifecycle: a deprecated version rejects new writes (but allows in-place updates of already-pinned rows), a retired version is `410`, an unknown version is `400`, and a preview version requires `allowPreview`.

## Adding a new provider

See [Adding a Provider](./adding-a-provider.md) for the social-channel recipe. The short version is:

1. Create `libraries/providers/<id>/` with a `package.json` depending on the kernel and the domain interfaces.
2. Add one `src/v1/<domain>.adapter.ts` module per domain the provider participates in, exporting a `ProviderModule`.
3. Add a `src/v1/metadata.ts` with the static `ProviderMetadata` the defaults resolver and catalog read.
4. Add the package import to `apps/backend/src/providers.generated.ts` (or re-run `scripts/generate-provider-packages.mjs` if the provider fits its templates).
5. Add a conformance test under `libraries/providers/<id>/src/__tests__/`.
6. Update [Provider Versions](./provider-versions.md) and bump the "Verified against v1.0.0" note.

## Provider metadata (`src/v1/metadata.ts`)

Every provider package must ship `src/v1/metadata.ts` that exports a `ProviderMetadata` object. This is the static declaration the defaults resolver, catalog endpoints, and settings UI read instead of inferring behavior from adapter capabilities.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Stable provider id; must match `manifest.providerId`. |
| `displayName` | `string` | Human-readable brand name. |
| `uiName` | `string` (optional) | Suffix used when a provider has multiple surfaces; labels become `<provider>[-<ui-name>]: <model>`. |
| `kind` | `'direct' \| 'hub' \| 'action'` | `direct` = single-brand provider with its own models; `hub` = aggregator exposing many third-party models; `action` = action-only, no model list. |
| `domains` | `Array<'ai' \| 'media'>` | Which default surfaces this provider may serve. |
| `modelCategories` | `string[]` (optional) | AI model categories this provider supports (e.g. `low-reasoning`, `high-reasoning`, `vision`, `workflow`). |
| `mediaCategories` | `string[]` (optional) | Media categories this provider supports (e.g. `text-to-image`, `text-to-video`). |
| `hasModelList` | `boolean` | Whether the adapter implements `listModels` for its domain(s). |
| `modelHints` | `Record<string, string[]>` (optional) | Per-category preferred model-id substrings used to rank `listModels` output when auto-selecting a default. |
| `mediaModels` | `Partial<Record<string, MediaModelDef[]>>` (optional) | Static model catalog per media category, used by Settings → Content → Media Defaults and the studio-kit. |
| `docsUrl` | `string` (optional) | Link to provider docs. |
| `website` | `string` (optional) | Official provider homepage. |
| `description` | `Partial<Record<LanguageCode, string>>` (optional) | Localized provider pitch (`en` required). |

The declared `modelCategories` and `mediaCategories` must be subsets of the known `AI_MODEL_CATEGORIES` and `AI_MEDIA_CATEGORIES` unions respectively; the kernel conformance test asserts this.

Usage:

- `DefaultsResolutionService` builds candidate sets from metadata (`modelCategories`/`mediaCategories`) and ranks auto-picks using `modelHints[category]`.
- Catalog endpoints use `displayName`/`uiName` to format labels such as `<provider>[-<ui-name>]: <model>`.
- `action` providers (e.g. HeyGen, Deepgram, Suno) are selectable with `model: null` in media defaults.

## Shipping a v2 adapter

1. Create `libraries/providers/<id>/src/v2/<domain>.adapter.ts` with the new adapter.
2. Set its manifest `status` to `preview` initially, then `active` when ready.
3. Mark the old `v1` module `deprecated` and later `retired` with a sunset date.
4. The kernel rejects writes against retired versions and warns on deprecated writes.
5. Existing pinned rows continue to use `v1` until an admin upgrades them.

## Resolution path

The kernel is the **sole** resolution path for every domain. The `PROVIDER_KERNEL=legacy` kill switch and the legacy in-memory registries that backed it have been removed — there is no fallback registry.

`ProviderResolutionService` exposes typed helpers for each domain (`resolveAI`, `resolveMedia`, `resolveShortLink`, `resolveVpn`, `resolveEmail`, `resolveStorage`, `resolveSocial`, `resolveContentPack`). Each call returns a telemetry-wrapped capability instance cached by `(domain/providerId@version, orgId, credentials/extras fingerprint)`. Config-mutation services must call `invalidate()` or `invalidateOrg()` after credential changes so the next resolve rebuilds the capability with fresh credentials.

## Catalog & health endpoints

- `GET /providers/catalog?domain=` returns the provider catalog for a domain. **It is authenticated** — the route sits in the authenticated group (`AuthMiddleware`/`CsrfMiddleware` apply); it is **not** an anonymous/public endpoint. An unknown or unsupported `?domain=` returns **400 Bad Request** (`resolveDomainFilter` rejects it) rather than an unfiltered or empty result.
- `GET /admin/providers/health?domain=` (super-admin) returns per-version health counters.

Catalog entries include `domain`, `providerId`, `version`, `displayName`, `status`, `verified` (whether the provider was built with a live key), `authType`, `defaultDomain`, `setupNotes`, `credentialFields`, `capabilities`, `deprecatedAt`, `sunsetAt`, `description`, `website`, `mediaCategories`, and super-admin-curated `featured`/`featuredSortOrder` flags.

Health entries include `domain`, `providerId`, `version`, `status`, and a `health` object with `successCount`, `errorCount`, `consecutiveErrors`, `lastSuccessAt`, and `lastErrorAt`.

## Lifecycle statuses

| Status | Meaning |
|---|---|
| `preview` | Available for opt-in; writes require `allowPreview`. |
| `active` | Default for new configs. |
| `deprecated` | Existing pinned rows keep working; new writes are rejected unless the write is an in-place update of an already-pinned row. |
| `retired` | Existing rows fail to resolve; returns `410 Gone`. |

## Testing

- `pnpm run test` — full suite, including kernel conformance tests.
- `vitest run --root libraries/providers/kernel` — kernel-only tests.
- Each provider package should include a conformance test that asserts its exported modules cover the expected `(domain, version)` set.

See [Provider Versions](./provider-versions.md) for the live catalog and [Adding a Provider](./adding-a-provider.md) for the implementation recipe. The end-user capability matrix is documented in [Supported Channels](../user-guide/supported-channels.md).

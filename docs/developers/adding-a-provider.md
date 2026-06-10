# Adding a Social Provider

How to add a new channel. The three fork-added providers (Tumblr, Pixelfed, PeerTube) are good
reference implementations.

> Providers live in
> `libraries/nestjs-libraries/src/integrations/social/`.

---

## 1. Implement the provider

Create `your-provider.provider.ts` implementing the social provider interface
(`social.integrations.interface.ts`). At minimum:

- **Identity & metadata** — `identifier`, `name`, `editor` type, scopes, etc.
- **Auth** — `generateAuthUrl` / `authenticate` (OAuth redirect), or `customFields` for
  instance-URL/token/login style auth (see Pixelfed/PeerTube).
- **Posting** — `post(...)` to publish, plus any media handling.
- **Token refresh** — `refreshToken(...)` if the platform uses refreshable tokens.

Choose the right `editor` for how the platform renders text (e.g. plain-text platforms use a
plain-text editor — Tumblr uses `'normal'` because NPF renders plain text, not HTML).

### Optional capabilities

- **Capability matrix (v3.5.0)** — register the provider's supported features in
  `PROVIDER_CAPABILITIES` (`integrations/social/provider-capabilities.ts`). This matrix
  (served at `/provider-capabilities`) is what gates the comment, first-comment, and poll UIs, so a
  capability the matrix doesn't advertise won't render even if the method exists.
- **Comments** — implement `ISocialMediaComments` (`commentsCapabilities` + `fetchComments` /
  `replyToComment` / `likeComment`) to participate in comment sync. See
  [Comments support](../channels/comments.md).
- **First comment** — if the platform's `comment()` supports posting after publish, advertise
  `firstComment` in the capability matrix; the post workflow auto-posts `settings.firstComment` as a
  non-fatal, idempotent step.
- **Polls** — if the platform supports polls, implement poll creation in `post()` (driven by
  `settings.poll`) and advertise `poll` in the capability matrix. Poll validation happens before
  publish (a poll is part of the post payload, not a follow-up step).
- **Analytics** — implement the analytics hooks so the provider feeds snapshots, and add its metric
  labels to the metric map in `integrations/social/analytics.metrics.ts`.

### Outbound fetch & SSRF (v3.5.0)

Any outbound HTTP from a provider that targets a user-influenced URL (instance URLs, media
download/upload URLs, parsed auth params) **must** be SSRF-safe. Use the base class `this.fetch()`
(which defaults to the `ssrfSafeDispatcher`) or the `safeFetch` helper directly — never a bare
`fetch(userUrl)`. This blocks DNS-rebinding and redirect-to-internal attacks
(e.g. `169.254.169.254` cloud metadata). See [Architecture](./architecture.md).

## 2. Register it

Add `new YourProvider()` to the provider list in
`libraries/nestjs-libraries/src/integrations/integration.manager.ts`.

> The manager filters providers by what's enabled in the database (falling back to all providers
> when no DB config exists), and `getSocialIntegration()` enforces the enablement gate. Read paths
> for already-connected channels use the unchecked accessor so disabling a provider never breaks
> unrelated channels. See [Channels admin](../admin/channels.md).

## 3. Credentials

Read credentials via `getEnvOr(...)` with your provider identifier so the value resolves from the
admin DB config first and the environment second. Add any new env vars to `.env.example`. Configure
real credentials in [Channels admin](../admin/channels.md); optionally add a one-time mapping in
`scripts/migrate-channel-config.ts`.

## 4. Frontend composer

Add a composer/settings component if the platform needs custom post options (the three fork
providers each added a composer). Follow [Frontend conventions](./frontend.md).

## 5. Tests

Add a provider spec with exact per-provider API call sequence mocking, and add a mock config entry
in `provider-mocks.ts`. Update any provider-count assertions in the integration-manager tests. See
[Testing](./testing.md).

## Lessons baked into the existing providers

- Use **lazy initialization** for clients/sockets — no module-level side effects (WebSocket
  connections, OAuth clients) at import time.
- Prefer null-safe access over non-null assertions (`?.` / `|| ''`) on platform responses.
- Get the OAuth `grant_type` right on refresh (`refresh_token`, not `authorization_code`).

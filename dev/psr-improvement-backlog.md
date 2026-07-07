# posts-social remediation — improvement backlog

This file captures improvement ideas that surfaced during the code review of
`dev/posts-social_REMEDIATION.md`. These are **not** plan-conformance gaps; the
plan items are all DONE.

## 1. MeWe bare `fetch()` in OAuth and media upload paths

**Where:** `libraries/providers/mewe/src/v1/social.adapter.ts`
- `authenticate()` lines 121, 150 use raw `fetch()` against MeWe's `/api/dev/token` and `/api/dev/me`.
- `uploadPhoto()` line 236 uses raw `fetch()` against `/api/dev/photo/upload`.
- `post()` line 294 uses raw `fetch()` against `/api/dev/me/post` or the group post endpoint.

**Why it matters:** These are first-party MeWe API hosts, so SSRF exposure is low,
but raw `fetch()` bypasses the uniform timeout, retry, and per-channel VPN-egress
behavior provided by `SocialAbstract.fetch()`.

**Suggested change:** Route these calls through `this.fetch()` (or `safeFetch()` for
the media download) so MeWe behaves like the other remediated providers.

## 2. Untyped dynamic tool payload

**Where:** `libraries/nestjs-libraries/src/dtos/integrations/integration.function.dto.ts`
- `data: any` is passed straight into provider tool methods.

**Why it matters:** Arbitrary payloads bypass validation. Since method names are
now allow-listed, the remaining risk is that a valid tool receives a malformed
payload.

**Suggested change:** If the surface grows, consider a per-tool JSON-schema gate
or a stricter `Record<string, unknown>` + provider-defined validation.

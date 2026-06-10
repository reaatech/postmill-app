# Content QA Preflight

The preflight panel runs a set of pre-publish checks on a draft before it's scheduled, surfacing
problems (and outright blockers) while you can still fix them.

---

## What it checks

For each target channel, preflight evaluates:

- **Platform limits** — character/length and other per-platform constraints.
- **Alt text** — missing alt text on media.
- **Media formats** — unsupported media formats for the channel.
- **Links** — broken or unsafe links and link-preview availability.
- **First comment / poll compatibility** — whether the channel supports a first comment or a poll,
  gated by the [provider capability matrix](./provider-capabilities.md).
- **AI compliance** — the [content compliance checker](./ai-features.md) (platform ToS, brand
  safety, regulatory rules, org brand profile).

## Warnings vs blockers

Preflight returns **warnings** and **blocking validation results separately** — warnings are
advisory, blockers are issues that should stop a publish. It is additive and does **not** change the
existing create-post API contracts; it's a check you run before scheduling, not a gate baked into
post creation.

## Where you see it

A **preflight panel** in the composer, surfaced before you schedule. The same checks back
[bulk scheduling](./bulk-scheduling.md) so every imported row is preflighted too.

## API surface

| Endpoint | Purpose |
|----------|---------|
| `POST /posts/preflight` | Run preflight on a draft; returns warnings and blocking results separately. |

## Related

- [Provider capabilities](./provider-capabilities.md) — what's possible per channel (limits,
  first-comment, polls, media).
- [AI features](./ai-features.md) — the compliance check used in preflight.
- [Bulk scheduling / CSV import](./bulk-scheduling.md) — runs the same preflight per row.

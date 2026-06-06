# AI Settings Admin

The AI layer is an admin-configurable, governed, multi-provider system. A **super-admin** configures
it in the web UI at **`/admin/ai`**, with provider keys encrypted at rest. This replaces the single
hardcoded OpenAI integration from upstream.

> **Verified against v3.4.0.** Introduced in v3.4.0.
> UI route: `/admin/ai` · API route: `/admin/ai-settings` (super-admin only).

---

## The one thing to know first: it's optional

> **Backward compatibility:** with **no** admin AI configuration, every AI surface behaves exactly
> like today's `OPENAI_API_KEY` path — byte for byte. Setting the active provider to none reverts
> all AI features to the environment-variable fallback. You only need this screen if you want to use
> a non-OpenAI provider, per-scope models, or governance.

## Access

Only `isSuperAdmin` users can view or change AI settings; every `/admin/ai-settings` endpoint
enforces it.

## Providers & models

The system ships **12 distinct adapters** — OpenAI, Anthropic, Azure OpenAI, Vercel AI Gateway,
Amazon Bedrock, Google, Google Vertex, Groq, Cohere, Mistral, xAI Grok, and OpenRouter — plus a
generic OpenAI-compatible adapter registered for ~14 more hub providers (DeepSeek, DeepInfra,
Fireworks, Together AI, Perplexity, Qwen, and others).

From the admin screen you can:

- **Add/edit a provider** — choose the provider, enter credentials (encrypted with `JWT_SECRET`),
  and pick a model.
- **Test connection** — validate credentials before going live.
- **Set the active provider** — the global default used when no more specific config applies.
- **Set per-scope models** — bind specific models to AI scopes (e.g. the assistant vs. utility
  generation) without changing the global default.

### How a model is resolved

When any AI surface needs a model, a single facade resolves it in this order of precedence:

```
per-org (BYOK)  →  per-scope model  →  global active provider  →  provider default  →  env OPENAI_API_KEY
```

This means the four AI surfaces — utility text/image generation, the `/agents` generator, the chat
assistant, and the composer assistant — all pick up provider changes without a redeploy.

## Governance

Configured under the governance section of the admin screen:

- **Guardrails** — input/output checks for prompt-injection, PII, brand safety, and NSFW, each with
  a `block | redact | warn` action. A dry-run preview lets you test a rule against sample input
  before enabling it.
- **Budgets** — monthly/daily spend caps, per-scope, with threshold alerts (e.g. an 80% warning).
  Spend is tracked to a spend log you can view in the UI.
- **Telemetry** — OpenTelemetry GenAI spans (a no-op when no telemetry backend is configured).
- **Provider health** — success/error tracking and health badges, with failover readiness.

## Audit & visibility

- **Spend log & summary** — view recorded AI spend.
- **Audit trail** — every AI-settings change is recorded.
- **Health** — per-provider health/status badges.

## Media generation

Image generation works through the facade today. Video, TTS, STT, upscale, background-removal, and
inpaint are **stubbed** (video falls back to image) pending a later phase — don't rely on them yet.

## RAG / brand memory (foundation)

Brand profiles and a content index underpin retrieval-augmented generation and brand-specific
context injection. This is a foundation/scaffold in v3.4.0 — present but not the primary path yet.

## Relationship to the env fallback

Even with the admin system configured, if resolution falls all the way through (no per-org,
per-scope, active, or default match), the facade uses `OPENAI_API_KEY`. Keeping that variable set is
a safe backstop. See [Configuration](../self-hosting/configuration.md).

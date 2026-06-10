# AI Settings Admin

The AI layer is a governed, multi-provider system configured per-tenant in **Settings → AI**, with
provider keys encrypted at rest. This replaces the single hardcoded OpenAI integration from upstream.

> UI route: `/settings/ai` · API route: `/settings/ai` (org-scoped).

---

## Access

Any organization admin can configure AI settings for their org in **Settings → AI**. Super-admins
can set a global fallback provider that applies to orgs without their own config.

## Providers & models

The system ships **25 providers** — 13 direct model providers (OpenAI, Anthropic, Google Gemini, xAI
Grok, Meta Llama, Mistral, DeepSeek, Cohere, Perplexity, Groq, Qwen, MiniMax, Azure OpenAI) plus 12
multi-model hubs & gateways (Amazon Bedrock, Google Vertex AI, OpenRouter, Vercel AI Gateway,
Together AI, Fireworks AI, DeepInfra, SiliconFlow, Lightning AI, GMI Cloud, Bitdeer, Vultr).

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
per-org config  →  per-scope model  →  global active provider  →  provider default
```

The four AI surfaces — utility text/image generation, the `/agents` generator, the chat assistant,
and the composer assistant — all pick up provider changes without a redeploy.

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

## Org-level override

Orgs can override the global active provider in **Settings → AI**. If no org-level config exists,
the global active provider (set by a super-admin) applies. If no global provider is set, the
provider default model is used. `OPENAI_API_KEY` is no longer a fallback in v3.6.0.

# AI Features (End User)

Beyond content generation, the AI layer powers a set of end-user tools. These run on whichever
provider/model the admin has configured (or the `OPENAI_API_KEY` fallback) and are subject to any
governance the admin has set. For generation specifically, see
[AI generation](./ai-generation.md); for admin setup, see [AI settings admin](../admin/ai-settings.md).

> **Verified against v3.5.9.** Introduced in v3.4.0. User endpoints live under `/ai`. The AI moderation endpoint (`POST /ai/moderate`) is now text-only — image moderation removed pending a configured vision provider. All 11 AI user endpoints now throttled at 30 req/min. A read-only `GET /ai/media-providers` endpoint surfaces configured media providers (credential-free) for the Brand & AI settings panel.
> v3.5.0 tools (hashtags, comment sentiment/summary, compliance, brand memory) route through the
> same `AIModelProvider` facade and each carries an explicit `@Throttle` rate limit.

---

## Tools

| Feature | Endpoint | What it does |
|---------|----------|--------------|
| **Brand profile** | `GET/PUT /ai/brand-profile` | Store your brand voice/context so generations stay on-brand. |
| **Prompt templates** | `GET/PUT/DELETE /ai/prompt-templates` | Save and reuse your own prompt templates. |
| **Prompt library** | `GET/POST/DELETE /ai/prompt-library` | A shared library of prompts. |
| **Usage dashboard** | `GET /ai/usage` | See your AI usage. |
| **Semantic search** | `GET /ai/search` | Search across indexed content. |
| **Comment reply / sentiment / summary** | `POST /ai/comment-reply` | Draft a reply, or pass `action: 'sentiment' \| 'summary'` to score per-comment sentiment or summarize a thread. |
| **Best time** | `POST /ai/best-time` | Suggest a posting time. |
| **Repurpose** | `POST /ai/repurpose` | Adapt a post for another channel/format. |
| **Translate** | `POST /ai/translate` | Translate post content. |
| **Variants** | `POST /ai/variants` | Generate alternative versions of a post. |
| **Media** | `POST /ai/media` | Generate media (image generation works today; see notes). |
| **Hashtags** | `POST /ai/hashtags` | Generate 15–20 platform-aware hashtags for a post. |
| **Compliance** | `POST /ai/compliance` | Check content against platform ToS, brand safety, and regulatory rules; returns structured `{ violations[], passed }`. |
| **Brand memory** | `POST /ai/brand-memory/index`, `POST /ai/brand-memory/search` | Index your top-performing posts and "write like our best posts" via retrieval (see below). |

### New v3.5.0 tools

- **Hashtag generator (2D)** — `POST /ai/hashtags` returns a platform-optimized hashtag set via
  `AIModelProvider.generateObject()`. Brand voice, guardrails, and budgets apply automatically.
  In the composer it appears as a tab in the AI content tools.
- **Comment sentiment & summary (2E)** — `POST /ai/comment-reply` now accepts an `action` of
  `'sentiment'` (per-comment positive/negative/neutral with a confidence score plus an overall
  read) or `'summary'` (a concise thread summary with key points and suggested actions). The
  comment thread UI shows sentiment badges and a "Summarize comments" action.
- **Content compliance checker (3D)** — `POST /ai/compliance` evaluates a draft against platform
  policy, brand safety, regulatory rules, and your org's brand profile, returning a structured
  violations list and a pass/fail flag.
- **Per-platform brand voice (3G)** — your brand profile can carry per-platform instruction
  overrides (e.g. witty on X, professional on LinkedIn). When generating for a given platform the
  facade uses that platform's instructions, falling back to the global brand instructions when no
  override is set. See [AI generation](./ai-generation.md).
- **Brand memory / RAG (3M)** — index your high-performing posts (`/ai/brand-memory/index`) and
  generate content that reflects them ("write like our best posts"); the AI response includes the
  source snippets it drew on for transparency (`/ai/brand-memory/search`).

## Brand profiles & RAG

Brand profiles feed retrieval-augmented generation (RAG) so generations can pull in brand-specific
context, and (v3.5.0) carry **per-platform instruction overrides** so voice can differ by channel.
The brand-memory tools (3M) build on the RAG/indexing layer to let you generate from your own
top-performing posts and see which source posts the model drew on. See
[AI settings admin](../admin/ai-settings.md).

## Governance applies

Guardrails (prompt-injection, PII, brand safety, NSFW), budgets, and rate limits configured by the
admin apply to these features. If a request is blocked or redacted, that's governance — see
[AI settings admin](../admin/ai-settings.md). In addition, every new v3.5.0 AI endpoint carries its
own explicit `@Throttle` rate limit (request-rate abuse is distinct from spend, which budgets cap).

## What about media?

Image generation works through the facade. Video, TTS, STT, upscale, background-removal, and inpaint
are stubbed for a later phase (video falls back to image). See [AI generation](./ai-generation.md).

The **Brand & AI** settings tab includes a read-only **Media Providers** panel (v3.5.9) listing which
media operations (image, video, TTS, STT, upscale, background removal, inpainting) are configured and
active for your workspace. It is backed by `GET /ai/media-providers`, which returns only provider ids
and availability — never credentials. Media providers themselves are configured by an administrator in
**Admin → AI Settings**.

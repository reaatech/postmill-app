# AI Features (End User)

Beyond content generation, the AI layer powers a set of end-user tools. These run on whichever
provider/model the admin has configured (or the `OPENAI_API_KEY` fallback) and are subject to any
governance the admin has set. For generation specifically, see
[AI generation](./ai-generation.md); for admin setup, see [AI settings admin](../admin/ai-settings.md).

> **Verified against v3.4.0.** Introduced in v3.4.0. User endpoints live under `/ai`.

---

## Tools

| Feature | Endpoint | What it does |
|---------|----------|--------------|
| **Brand profile** | `GET/PUT /ai/brand-profile` | Store your brand voice/context so generations stay on-brand. |
| **Prompt templates** | `GET/PUT/DELETE /ai/prompt-templates` | Save and reuse your own prompt templates. |
| **Prompt library** | `GET/POST/DELETE /ai/prompt-library` | A shared library of prompts. |
| **Usage dashboard** | `GET /ai/usage` | See your AI usage. |
| **Semantic search** | `GET /ai/search` | Search across indexed content. |
| **Comment reply** | `POST /ai/comment-reply` | Draft a reply to a synced social comment. |
| **Best time** | `POST /ai/best-time` | Suggest a posting time. |
| **Repurpose** | `POST /ai/repurpose` | Adapt a post for another channel/format. |
| **Translate** | `POST /ai/translate` | Translate post content. |
| **Variants** | `POST /ai/variants` | Generate alternative versions of a post. |
| **Media** | `POST /ai/media` | Generate media (image generation works today; see notes). |

## Brand profiles & RAG

Brand profiles feed retrieval-augmented generation (RAG) so generations can pull in brand-specific
context. In v3.4.0 the RAG/brand-memory layer is a **foundation** — present and usable for brand
context, with the broader retrieval pipeline still maturing. See
[AI settings admin](../admin/ai-settings.md).

## Governance applies

Guardrails (prompt-injection, PII, brand safety, NSFW), budgets, and rate limits configured by the
admin apply to these features. If a request is blocked or redacted, that's governance — see
[AI settings admin](../admin/ai-settings.md).

## What about media?

Image generation works through the facade. Video, TTS, STT, upscale, background-removal, and inpaint
are stubbed for a later phase (video falls back to image). See [AI generation](./ai-generation.md).

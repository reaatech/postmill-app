# AI Generation

This page covers AI content generation — text and media — and is explicit about what works today
versus what is stubbed for a later phase.

> **Verified against v3.4.0.** Generation resolves its model through the AI facade; with no admin
> config it uses `OPENAI_API_KEY`. See [AI settings admin](../admin/ai-settings.md).

---

## Text generation

Text/prompt/slide generation works through the AI facade and is used across the product —
composing/assisting on posts, the `/agents` generator, the chat assistant, and the composer
assistant. All four resolve their model from the facade, so changing the admin-configured provider
or per-scope model takes effect without a redeploy.

## Image generation

**Works today.** Image generation goes through the facade's image model. Trigger it via the user
media endpoint (`POST /ai/media`).

## What's stubbed (later phase)

The media service is scaffolded but these are not functional yet:

| Capability | Status |
|------------|--------|
| Image generation | ✅ Working |
| Video generation | ⚠️ Stub — falls back to image |
| Text-to-speech (TTS) | ⚠️ Stub |
| Speech-to-text (STT) | ⚠️ Stub |
| Upscale | ⚠️ Stub |
| Background removal | ⚠️ Stub |
| Inpaint | ⚠️ Stub |

> **Note:** don't build workflows that depend on video/TTS/STT/upscale/bg-remove/inpaint yet — they
> are placeholders.

## Cost & limits

Media generation cost is reconciled with the legacy credit meter: the stricter of the AI budget and
the legacy image/video credit count applies. Budgets, guardrails, and rate limits are configured by
the admin — see [AI settings admin](../admin/ai-settings.md).

## Provider choice

Which model backs generation depends on admin configuration and the facade's resolution order
(per-org → per-scope → active → provider default → env OpenAI). See
[AI settings admin](../admin/ai-settings.md) for how to point generation at a specific provider/model.

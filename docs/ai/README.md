# AI Configuration

> **Verified against v3.6.0**

The AI layer supports 25 providers configured per-tenant through the **AI** settings tab.

## Provider & Model

Each organization can configure their own AI provider (OpenAI, Anthropic, Google, etc.) and model.
The active provider is resolved per-org, with scope-level model overrides from system settings.

On first boot after upgrading to v3.6.0, if `OPENAI_API_KEY` is set in the environment and no
per-org AI provider config exists, a migration helper automatically seeds each org with a default
OpenAI configuration (`gpt-4o` / `dall-e-3`, encrypted credentials, set as active). This prevents
existing users from losing AI functionality on upgrade.

## Brand Voice

The **Brand** tab (`/settings/brand`) provides:
- Brand voice profiles with tone/voice instructions, language, and per-platform system prompts.
- RAG Knowledge Base for indexing and searching org content.

### RAG Knowledge Base

Add content by text, URL, or file upload (`.txt`, `.pdf`, `.md`, `.csv`). The system chunks,
embeds, and indexes it for semantic search. Use the search test feature to verify retrieval.

## Governance

- **Spend tracking** — per-org spend logs with monthly/daily budget caps.
- **Guardrails** — configurable content filtering and safety checks.
- **Audit log** — all AI setting changes recorded with the admin user.

## Models

- `AIOrgProviderConfig` — per-org AI provider config (credentials, default model, `isActive`).
- `AIBrandProfile` — brand voice instructions and per-platform prompts.
- `AIContentIndex` — RAG indexed content chunks.
- `AISpendLog` — per-org AI spend records.

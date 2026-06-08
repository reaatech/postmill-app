# Glossary

> **Verified against v3.5.9.**

---

**Activity** — A unit of work invoked by a Temporal workflow (e.g. analytics collection). Lives in
`apps/orchestrator/src/activities`.

**Adapter (AI)** — An `AIProviderAdapter` implementation that constructs language/image/embedding
models for a specific AI provider. See [AI architecture](../developers/ai-architecture.md).

**AIModelProvider / facade** — The single injection point that resolves an AI model for a given
`(scope, orgId?)`. See [AI architecture](../developers/ai-architecture.md).

**BYOK** — Bring Your Own Key. Per-org AI provider credentials (`AIOrgProviderConfig`), supported by
the facade's resolution order.

**Capability flag** — A declared provider capability (e.g. `commentsCapabilities.read/reply/like`)
the UI reads to show only supported actions.

**Channel / Integration** — A connected social account (`Integration` model). "Provider" is the
platform type; "channel" is a connected instance of it.

**Governance** — Guardrails, budgets, telemetry, and health controls around AI usage. See
[AI settings admin](../admin/ai-settings.md).

**Guardrail** — An input/output check (prompt-injection, PII, brand safety, NSFW) with a
`block | redact | warn` action.

**Integration manager** — Registers all social providers and filters them by DB enablement. See
[Adding a provider](../developers/adding-a-provider.md).

**MCP** — Model Context Protocol surface for AI agents/tools, scope-gated. See [MCP](../api/mcp.md).

**Org / Organization** — The tenant boundary (`Organization` model).

**Provider** — A social platform integration (e.g. X, Tumblr). 36 are supported. See
[Channels overview](../channels/overview.md).

**Provider configuration** — DB-backed, encrypted channel credentials managed by admins
(`ProviderConfiguration`). See [Channels admin](../admin/channels.md).

**RAG** — Retrieval-augmented generation. Foundation present in v3.4.0 (`RagService`, `HybridRag`,
`AIBrandProfile`, `AIContentIndex`).

**RUN_CRON** — Env flag that must be `true` on exactly one orchestrator instance to run recurring
analytics collection and comment sync. See
[Temporal & background jobs](../self-hosting/temporal-and-cron.md).

**Scope (AI)** — `utility` · `generator` · `agent` · `mcp`; selects which AI surface a model
resolution is for.

**Scope (MCP)** — `mcp:read` · `mcp:posts:write` · `mcp:admin`; authorization scopes for MCP.

**Snapshot** — A persisted daily metric row (`AnalyticsSnapshot` / `PostAnalyticsSnapshot`) powering
the analytics dashboard.

**Super-admin** — A user with `isSuperAdmin`, able to configure channels, AI, and view
diagnostics. See [Admin overview](../admin/overview.md).

**Temporal** — The durable workflow engine running background jobs in `apps/orchestrator`.

**Workflow** — A durable Temporal orchestration (publishing, analytics collection, comment sync,
token refresh, email). See [Temporal & background jobs](../self-hosting/temporal-and-cron.md).

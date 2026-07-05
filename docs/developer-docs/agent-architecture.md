# Agent Architecture

Postmill's chat agent is a Mastra/CopilotKit agent that lives at `/agents`. It can
understand natural-language requests, delegate to domain specialists, call tools,
and ask for human confirmation before outward actions.

> For the end-user view of what the agent can do, see [Agent User Guide](../user-guide/agent.md).
> For the MCP/A2A surfaces that expose the same tools to external clients, see [MCP Server](./mcp.md).

> Verified against v3.8.10 (agent-surface remediation applied — see the Access
> model & governance section)

---

## High-level flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User (browser)                              │
└──────────────────┬──────────────────────────────────────────────────┘
                   │  natural-language message
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CopilotKit provider  ──►  /copilot/agent  ──►  CopilotRuntime      │
│                         (cookies + CSRF header)                     │
└──────────────────┬──────────────────────────────────────────────────┘
                   │  GraphQL / streaming
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Mastra agent ("postmill")                                          │
│  ┌─────────────┐                                                    │
│  │ Supervisor  │  owns integrationList + groupList                  │
│  │   (when     │  routes intent to specialists                      │
│  │  AGENT_     │                                                    │
│  │ SUPERVISOR_ │                                                    │
│  │ ENABLED)    │                                                    │
│  └──────┬──────┘                                                    │
│         │  delegates                                                │
│         ▼                                                           │
│  ┌─────────┬─────────┬──────────┬─────────┐                         │
│  │ content │  media  │ analytics │   ops   │  specialist agents     │
│  └────┬────┴────┬────┴─────┬────┴────┬────┘                         │
│       │         │          │         │                              │
│       ▼         ▼          ▼         ▼                              │
│  generate.    media       analytics  posts/                          │
│  content,     studios,    tools,     campaigns,                      │
│  rag search,  search      watchlist  comments                        │
│  brand memory                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

* When `AGENT_SUPERVISOR_ENABLED` is not `false`, a supervisor agent routes to
  domain specialists (`content`, `media`, `analytics`, `ops`).
* When the supervisor is disabled, a single flat agent owns all tools directly.
* The same tool set is exposed through the MCP/A2A server; agent tools are not
  duplicated for MCP callers.

---

## Specialist responsibilities

| Specialist | Domain | Typical tools |
|---|---|---|
| `content` | Drafts, rewriting, brand voice, RAG/brand-memory searches | `generateContent`, `runGenerator`, `ragSearch`, `brandMemorySearch`, `brandProfile` |
| `media` | Image/video/audio generation, media studios, stock/library search, Designer | `generateImage`, `generateVideo`, `mediaStudioGenerate`, `mediaJobStatus`, `listMediaProviders`, `listMediaModels`, `stockSearch`, `filesSearch`, `uploadFromUrl`, `designerDesign` |
| `analytics` | Analytics overviews, best-time heatmap, recommendations, per-post metrics, watchlist | `analyticsOverview`, `analyticsBestTime`, `analyticsRecommendations`, `analyticsPost`, `analyticsWatchlist` |
| `ops` | Scheduling posts, campaign management, comments inbox/replies, post operations | `integrationSchedulePost`, `manualPosting` (frontend), `postsList`, `postsGet`, `postsReschedule`, `postsDelete`, `postsApprove`, `campaignCreate`, `campaignUpdate`, `campaignDashboard`, `campaignTag`, `commentsInbox`, `commentReply` |

The supervisor only owns `integrationList` and `groupList` directly; everything
else is delegated.

---

## Tool inventory

All tools live under `libraries/nestjs-libraries/src/chat/tools/` and are
registered in `tool.list.ts`. Every tool that mutates state is wrapped by the
`ToolFirewallService` before being handed to the agent.

| Tool | Kind | Requires write scope | Human-in-the-loop in UI |
|---|---|---|---|
| `integrationList` | read | no | no |
| `groupList` | read | no | no |
| `integrationValidation` | read | no | no |
| `integrationTrigger` | read | no | no |
| `integrationSchedulePost` | write | yes | via `manualPosting` action |
| `manualPosting` | frontend action | n/a | yes (opens composer) |
| `generateImage` | write/AI | yes | no |
| `generateVideo` | write/AI | yes | no |
| `uploadFromUrl` | write | yes | no |
| `designerDesign` | write | yes | no |
| `analyticsOverview` | read | no | no |
| `analyticsBestTime` | read | no | no |
| `analyticsRecommendations` | read | no | no |
| `analyticsPost` | read | no | no |
| `analyticsWatchlist` | read | no | no |
| `listMediaProviders` | read | no | no |
| `listMediaModels` | read | no | no |
| `mediaStudioGenerate` | write | yes | yes |
| `mediaJobStatus` | read | no | no |
| `campaignCreate` | write | yes | yes |
| `campaignUpdate` | write | yes | yes |
| `campaignDashboard` | read | no | no |
| `campaignTag` | write | yes | yes |
| `commentsInbox` | read | no | no |
| `commentReply` | write | yes | yes |
| `generateContent` | read/AI | no | no |
| `runGenerator` | read/AI | no | no |
| `ragSearch` | read | no | no |
| `brandMemorySearch` | read | no | no |
| `brandProfile` | read | no | no |
| `brandMemoryReindex` | write | yes | no |
| `postsList` | read | no | no |
| `postsGet` | read | no | no |
| `postsReschedule` | write | yes | yes |
| `postsDelete` | write | yes | yes |
| `postsApprove` | write | yes | yes |
| `filesSearch` | read | no | no |
| `stockSearch` | read | no | no |

---

## Human-in-the-loop

When the request originates from the UI (`/agents`), the frontend intercepts
outward actions with `useCopilotAction`/`renderAndWaitForResponse` and shows a
confirmation card before the action is finalized:

* `manualPosting` — opens the composer modal pre-filled with the draft.
* `commentReply` — shows the draft message + post/comment id; calls the social
  comments API directly on approval.
* `mediaStudioGenerate` — shows provider, operation, model, and prompt; calls
  `POST /media/studio/:provider/generate` on approval.

MCP/headless callers do not get a UI card; they rely on tool annotations
(`readOnlyHint`, `destructiveHint`, etc.) and the `mcp:posts:write` scope.

---

## Context injection

The frontend can push a compact "current view" payload via
`setAgentUiContext()` (`apps/frontend/src/components/agent/agent-context-bridge.tsx`).
The bridge forwards it to CopilotKit as a readable; the backend reads
`requestContext.get('ag-ui')?.context` and appends a short "Current view"
preamble to the agent instructions.

**Last-view (not live-co-mount) semantics.** The producers (`/launches`,
`/campaigns/[id]`, the post-detail modal) do **not** co-exist on the page with the
agent chat route, so the store would be empty by the time the chat reads it if
unmount deleted the contributed keys. Instead, a producer **unmounting marks the
snapshot stale** (`leftViewAt` timestamp) rather than clearing it, and a producer
**mounting clears `leftViewAt`** (a fresh view wins). The preamble then reads
"currently viewing…" when fresh and "most recently viewed… (may be stale)" when
`leftViewAt` is set. Stale ids are context, never implicit targets — the
instructions tell the model to confirm the intended target before acting.

Payload is intentionally tiny: ids + labels only, never full post bodies.

Supported fields:

| Field | Meaning |
|---|---|
| `view` | Surface name, e.g. `"launches"` |
| `calendarWeek` | ISO week or selected range |
| `visiblePostIds` | Post ids visible in the current calendar/list |
| `selectedCampaignId` | Selected campaign id |
| `currentCustomerId` / `currentGroupId` | Selected customer/group id |
| `currentPostId` | Post id when a post detail modal is open |

---

## Model resolution

The agent resolves its model per-call through `AIModelProvider.languageModel(...)`.
There is no env-key fallback; if the org has no active AI provider, the agent
surface is off and the frontend routes the user to **Settings → AI**.

* Flat agent: `model: () => facade.languageModel('agent', orgId)`
* Supervisor: `model: () => facade.languageModel('utility', orgId)`

---

## MCP / A2A preservation

The same `LoadToolsService.loadTools()` output is used by:

1. The `/agents` chat surface (via CopilotKit + Mastra).
2. The MCP server (`/mcp`, `/mcp/:id`, `/mcp-oauth`, `/media-mcp`).

`start.mcp.ts` builds the MCP tool union **directly from
`LoadToolsService.loadTools()`** (the authoritative flat inventory), not by
reflecting a private Mastra internal — so a Mastra rename can no longer silently
collapse the exposed surface. A deterministic parity test
(`__evals__/routing.eval.ts`) asserts that `SUPERVISOR_TOOL_NAMES ∪` the four
specialist `*_TOOL_NAMES` equals `loadTools()` **exactly**; `pickTools` throws on
an unresolvable name. Adding a tool to `tool.list.ts` and assigning it to a
specialist surfaces it everywhere automatically; forgetting to assign it fails
the parity test.

> **A2A (`/a2a`) is deferred / not mounted.** The prior bridge was written against
> an `@reaatech/a2a-reference-mcp-bridge` API that does not exist in the installed
> `0.1.2` (`A2aAsMcpServer` has no `handleRequest`), so every request 500-ed. It
> is tracked as a future feature rather than shipped broken — a correct build
> needs an in-process MCP transport pair + an A2A JSON-RPC HTTP layer over
> `McpToolAdapter.executeTask`, verified against a live consumer.

The `ToolFirewallService` wraps every execution, so budget, guardrail, and
permission checks apply regardless of caller. `DEV_DISABLE_AGENT` only skips the
agent-graph startup in `start.mcp.ts`; the MCP endpoints themselves remain
available unless explicitly disabled separately.

---

## Access model & governance

Every entrypoint stamps an **access mode** into the tool request context, and each
tool enforces it in `execute` (defense-in-depth beyond the HTTP scope check):

| Mode | Set by | Read allowed | Write allowed |
|---|---|---|---|
| `user` | CopilotKit (`/copilot/*`) | yes | yes |
| `mcp` | `/mcp*`, `/sse` | with `mcp:read` | with `mcp:posts:write` |
| `headless` | weekly digest | yes | **never** (hard invariant) |

- `requireRead(context)` / `requireWrite(context)` (in `tool.helpers.ts`) gate
  every registered tool. A test (`tools/__tests__/guard-coverage.spec.ts`) asserts
  the guard is present **and precedes the first `await this._`** (so a commented-out
  or post-spend guard fails), for every tool in `tool.list.ts`.
- **Text generation stays on `requireRead`; only artifact-spend is `requireWrite`.**
  The artifact tools that create durable media (image/video/designer/media-studio)
  require write scope because an `mcp:read` token must not spend money on a stored
  artifact. The text-spend tools (`generateContent`, `runContentPipeline`, and
  `runGenerator`'s text path) deliberately stay on `requireRead`: ephemeral text is
  the core utility of a read-scoped chat session, it is already bounded by the org
  `agent` budget cap, and "write" scope means *outward / durable side effects*,
  which transient text is not. This is a stated invariant, not an oversight (3.5).
- **Org context is fail-closed**: `parseOrg` throws when the resolved org has no
  `.id`, and `checkAuth` unwraps the MCP auth wrapper (`{ org, userId, role }`) to
  the bare org — otherwise `where: { organizationId: undefined }` would run
  cross-tenant queries.
- **Budget scope is unified onto `agent`**: MCP/A2A entrypoints, CopilotKit, and the
  LangGraph `/posts/generator` run all gate on `checkBudget('agent', orgId)` and
  record spend under `scope: 'agent'` (the retired `scopeCaps.mcp` /
  `scopeCaps.generator` are migrated onto `scopeCaps.agent`). The generator run is
  budget-gated up-front (before the first `res.write`, so a capped org gets a clean
  4xx, not a truncated stream) and records spend against its **real resolved
  provider/model** — the earlier `generator/generator` placeholder was unpriceable,
  so every run logged `$0` and accrued nothing. Attribution is the run's primary
  provider (a mid-run fallback could bill a different one — out of scope this pass).
- **OAuth `pos_` tokens**: expired-but-unrevoked tokens are rejected
  (`findByAccessToken` checks `tokenExpiresAt`), and the persisted `scope` string
  is mapped to MCP scopes (granted write scopes now honoured; `mcp:read` floor).

---

## Feature flags

| Env var | Default | Effect |
|---|---|---|
| `AGENT_SUPERVISOR_ENABLED` | `true` | Enables the supervisor + specialists model. Set to `false` for a flat single agent. Read once at agent-build time — a change requires a process restart. |
| `AGENT_DIGEST_ENABLED` | unset (off) | Weekly headless AI digest per org (requires `USE_INNGEST=true` + a member opting into the `agent` notification category). Skips cleanly for orgs with no active AI provider. |
| `CONTENT_PIPELINE_TOTAL_TIMEOUT_MS` | `300000` | Overall wall-clock deadline for a `runContentPipeline` run (checked between stages). |
| `BACKEND_URL` | falls back to `NEXT_PUBLIC_BACKEND_URL` | Server-side backend URL for the MCP surface; `start.mcp.ts` fails fast at boot if neither is set. |
| `MEDIA_MCP_AUDIT_LOG_PATH` | `/tmp/media-mcp-audit.log` | File path for the media-MCP audit logger. |
| `DEV_DISABLE_AGENT` | unset | When set, `/copilot/agent` and `/copilot/chat` return 422/empty and MCP skips the agent surface. |

> **Content-pipeline timeout is a caller-wait bound, not a hard cancel.** The
> `CONTENT_PIPELINE_TOTAL_TIMEOUT_MS` `Promise.race` bounds only how long the caller
> **waits**; it does not abort in-flight agent-mesh work or its spend (no
> `AbortSignal` reaches `dispatchToAgent`). The deadline is re-checked **between**
> stages, so a stage already dispatched runs to completion even past the deadline —
> the run just rejects before starting the next one. Plumbing a real `AbortSignal`
> through agent-mesh is a tracked follow-up (4.4).

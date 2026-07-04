# Agent Architecture

Postmill's chat agent is a Mastra/CopilotKit agent that lives at `/agents`. It can
understand natural-language requests, delegate to domain specialists, call tools,
and ask for human confirmation before outward actions.

> For the end-user view of what the agent can do, see [Agent User Guide](../user-guide/agent.md).
> For the MCP/A2A surfaces that expose the same tools to external clients, see [MCP Server](./mcp.md).

> Verified against v3.8.10

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
3. The A2A bridge (`/a2a`).

Adding a new tool in `tool.list.ts` surfaces it in all three contexts
automatically. The `ToolFirewallService` wraps every execution, so budget,
guardrail, and permission checks apply regardless of caller.

`DEV_DISABLE_AGENT` only skips the agent-graph startup in `start.mcp.ts`; the
MCP/A2A endpoints themselves remain available unless explicitly disabled
separately.

---

## Feature flags

| Env var | Default | Effect |
|---|---|---|
| `AGENT_SUPERVISOR_ENABLED` | `true` | Enables the supervisor + specialists model. Set to `false` for a flat single agent. |
| `DEV_DISABLE_AGENT` | unset | When set, `/copilot/agent` and `/copilot/chat` return 422/empty and MCP/A2A skips the agent surface. |

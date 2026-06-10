# Developer Documentation

Technical documentation for developers working on the Postmill codebase. This directory covers
architecture, conventions, and infrastructure — everything you need to contribute effectively.

**Target audience:** Developers contributing to the Postmill monorepo (NestJS backend, NestJS +
Temporal orchestrator, Next.js frontend, shared libraries, Prisma).

---

## API Surfaces at a Glance

| Surface | Base path | Description |
|---|---|---|
| Public API v1 | `/public/v1` | REST API for integrations, posts, media, analytics — used by n8n, Zapier, and the SDK |
| Analytics v2 | `/analytics/v2` | Multi-channel analytics dashboard API with snapshot-based data |
| MCP Server | MCP protocol | AI agent tools exposed via Model Context Protocol |

---

## Stability Commitments

- **Legacy analytics route** (`GET /analytics/:integration`) — response shape is **frozen** for
  n8n/Zapier compatibility. A parallel v2 route provides the new shape.
- **Schema** — `prisma db push` is the migration method. Additive changes (nullable columns,
  defaulted columns) are safe. Renames and drops require an expand-contract plan.
- **AI provider resolution** — no env-var fallback. Per-tenant configuration through
  `AIOrgProviderConfig`.

---

## Page Index

| Page | Description |
|---|---|
| [Architecture](./architecture.md) | High-level monorepo architecture, app/library layout, data flow |
| [AI Architecture](./ai-architecture.md) | Pluggable multi-provider AI layer: `AIModelProvider`, four scopes, four surfaces, 25 adapters, governance services |
| [Database](./database.md) | Prisma schema management, `db push` safety rules, repository-only access, encryption at rest |
| [Data Model](./data-model.md) | All 71 Prisma models grouped by domain with keys, relationships, and deprecated models |
| [Backend Conventions](./backend-conventions.md) | NestJS layering (Controller → Service → Repository), DTO validation, CSRF, security invariants |
| [Frontend Conventions](./frontend-conventions.md) | Next.js App Router structure, SWR data fetching, Tailwind 3 styling, capability-aware UI |
| [Public API v1](./public-api.md) | Public REST API endpoints for third-party integrations and automation |
| [Analytics API v2](./analytics-api.md) | Multi-channel analytics dashboard API with snapshot-based data |
| [MCP](./mcp.md) | Model Context Protocol server entrypoints, auth, rate limiting |
| [OAuth Apps](./oauth-apps.md) | OAuth application registration and management |
| [Plugs](./plugs.md) | Automation hooks (auto plugs and post plugs) for social channel providers |
| [SDK](./sdk.md) | Official `@reaatech/postmill-sdk` Node.js SDK for the Public API |
| [Webhooks](./webhooks.md) | Webhook configuration, dispatch, and SSRF-safe delivery |
| [Adding a Provider](./adding-a-provider.md) | Step-by-step guide for adding a new social channel provider |
| [Adding an AI Adapter](./adding-an-ai-adapter.md) | Guide for implementing a new AI provider adapter |
| [Testing](./testing.md) | Vitest per-package configuration, co-located specs, single-threaded execution, CI workflow |
| [Contributing](./contributing.md) | Ground rules, invariants, PR workflow, review checklist |

---

## Related Docs

| Page | Location | Description |
|---|---|---|
| AI Tools (user guide) | [../user-guide/ai-tools.md](../user-guide/ai-tools.md) | End-user view of AI features |
| Provider Capabilities (reference) | [../reference/provider-capabilities.md](../reference/provider-capabilities.md) | Provider capability matrix reference |
| Glossary (reference) | [../reference/glossary.md](../reference/glossary.md) | Terminology used across the codebase |
| Operations Guide | [../operations-guide/](../operations-guide/) | Self-hosting, deployment, monitoring |
| Changes from Upstream | [../reference/changes-from-upstream.md](../reference/changes-from-upstream.md) | Postmill-specific changes vs upstream |

---

## Repository Layout (Quick Reference)

```
apps/
  backend/         NestJS REST API — thin controllers + module wiring
  orchestrator/    NestJS + Temporal — workflows and activities
  frontend/        Next.js (App Router) + React — port 4200
  extension/       Browser extension
  commands/        CLI commands
  sdk/             Published SDK

libraries/
  nestjs-libraries/    Core backend logic, Prisma schema, repositories
  helpers/             Shared utilities, useFetch hook
  react-shared-libraries/  Shared React components
```

> Verified against v3.7.0

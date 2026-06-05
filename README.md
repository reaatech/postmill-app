<p align="center">
  <a href="https://postiz.com/" target="_blank">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/765e9d72-3ee7-4a56-9d59-a2c9befe2311">
    <img alt="Postiz Logo" src="https://github.com/user-attachments/assets/f0d30d70-dddb-4142-8876-e9aa6ed1cb99" width="280"/>
  </picture>
  </a>
<br />
  <a href="https://reaatech.com" target="_blank">
    <img alt="REAA" src="https://reaatech.com/reaa-icon.500x500.png" width="160"/>
  </a>
<br />
<a href="https://opensource.org/license/agpl-v3">
  <img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License">
</a>
</p>

---

**⚠️ This is a modified fork**

This repository is a fork of [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) with the following changes:

- **Three extra social providers** — Adds **Tumblr** (global OAuth2, NPF posts with image/video), **Pixelfed** (instance URL + access token, Mastodon-compatible, images + comments), and **PeerTube** (instance URL + login, single-video uploads + comments), bringing the channel count to **36**. No database migration required.
- **Persisted analytics dashboard** — Replaced the legacy single-channel live-fetch analytics with a persisted multi-channel dashboard. Stores daily metric snapshots (AnalyticsSnapshot, PostAnalyticsSnapshot) collected via a Temporal workflow (requires `RUN_CRON=true` on one orchestrator instance), serves real period-over-period comparisons through `/analytics/v2`, and renders a drill-down UI with date range picker, channel multi-select, KPI cards, line/bar/area/pie charts, and CSV/JSON export. Daily snapshots roll up to weekly after ~18 months and per-post snapshots prune after 90 days (both windows env-configurable).
- **Database-backed provider config** — Channel OAuth/API credentials managed via an admin UI (`/admin/channels`) instead of environment variables, encrypted at rest. Includes a one-time `scripts/migrate-channel-config.ts` to import existing env-var credentials into the database.
- **Admin UI for channels** — Super-admins can enable/disable providers, set credentials, and add per-provider setup instructions. Disabling a provider only blocks new connections — already-connected channels keep posting, refreshing tokens, and reporting analytics.
- **Enhanced test suite** — 1000+ Vitest tests across all providers, core services, analytics, and frontend components with 93%+ statement/function/line coverage.
- **Maintenance & fixes** — Fixes across 36 providers (lazy initialization, credential keys, null safety), frontend hook dependency arrays, and the migration script; plus a safe same-major dependency refresh (React, Next, NestJS, Temporal, TipTap, Sentry, and more).
- **Prebuilt image** — Published to `ghcr.io/reaatech/postiz-app`.

See [github.com/reaatech/postiz-app](https://github.com/reaatech/postiz-app) for the full changelog and source.

---

[**NEW: check out Postiz agent CLI — perfect for OpenClaw and other agents**](https://github.com/gitroomhq/postiz-agent)

**Your ultimate AI social media scheduling tool**

[Postiz](https://postiz.com): An alternative to Buffer.com, Hypefury, Twitter Hunter, etc. Postiz offers everything you need to manage your social media posts, build an audience, capture leads, and grow your business.

Instagram · YouTube · Dribbble · LinkedIn · Reddit · TikTok · Facebook · Pinterest · Threads · X · Slack · Discord · Mastodon · Bluesky

[Explore the docs](https://docs.postiz.com) · [Watch the YouTube Tutorials](https://youtube.com/@postizofficial)

[Register](https://platform.postiz.com) · [Join Our Discord (devs only)](https://discord.postiz.com) · [Public API](https://docs.postiz.com/public-api)

[NodeJS SDK](https://www.npmjs.com/package/@postiz/node) · [N8N custom node](https://www.npmjs.com/package/n8n-nodes-postiz) · [Make.com integration](https://apps.make.com/postiz)

## 🔌 See the leading Postiz features

<p align="center">
  <a href="https://www.youtube.com/watch?v=BdsCVvEYgHU" target="_blank">
    <img alt="Postiz" src="https://github.com/user-attachments/assets/8b9b7939-da1a-4be5-95be-42c6fce772de" />
  </a>
</p>

## ✨ Features

> **Note:** The screenshots below are legacy upstream images and do not reflect this fork's UI. Features such as the persisted analytics dashboard and the channels admin UI are not pictured here.

| ![Image 1](https://github.com/user-attachments/assets/a27ee220-beb7-4c7e-8c1b-2c44301f82ef) | ![Image 2](https://github.com/user-attachments/assets/eb5f5f15-ed90-47fc-811c-03ccba6fa8a2) |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ![Image 3](https://github.com/user-attachments/assets/d51786ee-ddd8-4ef8-8138-5192e9cfe7c3) | ![Image 4](https://github.com/user-attachments/assets/91f83c89-22f6-43d6-b7aa-d2d3378289fb) |

# Intro

- Schedule all your social media posts (many AI features)
- Measure your work with analytics.
- Collaborate with other team members to exchange or buy posts.
- Invite your team members to collaborate, comment, and schedule posts.
- At the moment there is no difference between the hosted version to the self-hosted version
- Perfect for automation (API) with platforms like N8N, Make.com, Zapier, etc.

## Tech Stack

- Pnpm workspaces (Monorepo)
- NextJS (React)
- NestJS
- Prisma (Default to PostgreSQL)
- Temporal
- Resend (email notifications)

## Quick Start

To have the project up and running, please follow the [Quick Start Guide](https://docs.postiz.com/quickstart)

## Postiz Compliance

- Postiz is an open-source, self-hosted social media scheduling tool that supports platforms like X (formerly Twitter), Bluesky, Mastodon, Discord, and others.
- Postiz hosted service uses official, platform-approved OAuth flows.
- Postiz does not automate or scrape content from social media platforms.
- Postiz Users always authenticate directly with the social platform (e.g., X, Discord, etc.), ensuring platform compliance and data privacy.

## License

This repository's source code is available under the [AGPL-3.0 license](LICENSE).

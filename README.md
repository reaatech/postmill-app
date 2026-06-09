<p align="center">
  <a href="https://postiz.com/" target="_blank">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/dece1bba-5703-408c-a712-02f7a7953f02">
    <img alt="Postmill Logo" src="https://github.com/user-attachments/assets/f5861b90-f71f-4ff7-90e4-6eb308023f17" width="280"/>
  </picture>
  </a>
<br />
<a href="https://opensource.org/license/agpl-v3">
  <img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License">
</a>
</p>

---

**⚠️ This is a modified fork**

This repository is an **AI-native** fork of [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app), built by [REAA](https://reaatech.com).

**🤖 AI at the core** — A governed, multi-provider AI layer powers the whole platform. Bring your own keys across **25 providers** — 13 direct model providers (OpenAI, Anthropic, Google Gemini, xAI Grok, Meta Llama, Mistral, DeepSeek, Cohere, Perplexity, Groq, Qwen, MiniMax, Azure OpenAI) plus 12 multi-model hubs & gateways (Amazon Bedrock, Google Vertex AI, OpenRouter, Vercel AI Gateway, Together AI, Fireworks AI, DeepInfra, SiliconFlow, Lightning AI, GMI Cloud, Bitdeer, Vultr) — pick the exact model from an admin screen, and switch providers everywhere without a redeploy. On top of it: on-brand content generation, smart comment replies, brand-voice profiles, a shared prompt library, semantic (RAG) search over your own content, compliance guardrails (prompt-injection / PII / brand-safety / NSFW), and per-org spend caps with a full audit log — every AI entry point scoped, rate-limited, and budget-checked.

Everything else builds around that: persisted multi-channel analytics, a cross-channel comment inbox, campaigns, native polls, **36+ channels**, and a security-hardened, self-hosted stack.

**Full changelog below (newest first):**

**[v3.6.0]**
- **Your own profile page with password and notification controls** — Set your avatar, bio, and name in a new settings profile tab, change your password, see your active sessions, and manage email notification preferences — all in `/settings/profile`.
- **Bring your own storage — S3, R2, Backblaze, IDrive** — Every organization can mount its own storage provider (S3, R2, Backblaze B2, IDrive e2, or local disk) with 5 GB of free space by default. Migrate files between providers at any time. The old global `STORAGE_PROVIDER` env var is gone.
  - **Storage health & quota dashboard** — See which providers are connected (with last-checked timestamp), view your storage usage as a % of quota (warning at 80%+), and drill into usage by folder or provider.
  - **Folder-level provider routing** — Assign a specific storage provider to a folder, so all uploads to that folder automatically use that provider.
  - **Full storage audit log** — Every storage operation (mount, unmount, test, migrate, default-folder config) is logged with timestamp, user, and action.
- **Connect channels with your own OAuth apps** — Configure per-tenant OAuth credentials in the Channels settings tab with a live health dashboard showing connection status — no more global environment variables for every provider's client ID and secret.
- **A real media library with folders, tags, bulk actions, and trash** — Browse media in a folder tree, drag files between folders, tag and describe files, select multiple assets for batch operations, and search/sort/paginate through your library. Deleted files go to trash (soft-delete); restore them from the trash modal or permanently purge.
- **Manage your AI provider and model in-app** — Configure AI providers, models, and API keys per organization in the AI settings tab; set up brand voice profiles and a RAG knowledge base (with file upload support) in the Brand tab. `OPENAI_API_KEY` is deprecated for model resolution — existing keys are auto-migrated on first boot.
- **Datatable rebuilds for Teams, Webhooks, Auto Post, Sets, Signatures** — Each of these settings screens is now a real datatable with search, sort, pagination, educational empty states, and proper CRUD flows. Campaigns get archive/unarchive toggles and engagement stats.
- **Comments inbox fixes, analytics dark mode, calendar improvements** — Comments inbox shows proper error and permission states; analytics charts work in dark mode with skeleton loaders; calendar cards reliably display stats and comment badges.
- **Get started faster** — A new onboarding checklist guides first-time users through connecting channels, configuring AI, creating their first post, and inviting teammates. Channel health monitoring catches token expiry before it breaks publishing.

**[v3.5.10]**
- **It actually starts now** — v3.5.9 shipped without booting (a dependency mix-up took the whole API down). The stack boots cleanly again, and a new automated guard makes sure a non-booting build can never ship.
- **Posting and your calendar work again** — The composer can save, schedule, and publish, your scheduled posts show up on the calendar, and the in-app AI assistant no longer errors on every page.
- **Team management you can actually use** — Change a teammate's role and click through to their profile, right from settings — not just add and remove.
- **Fix failures without leaving the admin screen** — Super-admins can retry a failed post or clear a handled error directly from the error log.
- **No more "dead app" from rate limits, and a more accessible UI** — The hourly request limit is far more generous so normal use never trips it, billing loads, and settings/admin controls are now proper keyboard-accessible buttons.

**[v3.5.9]**
- **Your workspaces stay private** — Campaigns, watchlist, and comments are now fully locked to your organization, and every endpoint has proper permission checks — no one can see or touch your data.
- **A comment inbox that just works** — The inbox loads without 400 errors, comments can be marked read in bulk with org-scoped safety, and a new "Summarize" button lets AI distill the conversation for you.
- **Your profile and settings, right where you expect them** — A new profile section with your name, bio, and picture lives in settings, your avatar menu in the top bar gives you quick access to settings and logout, and a new Media Providers panel shows at a glance which AI providers power your image, video, and voice generation.
- **Admin tools you can actually find** — Super-admins see an "Administration" section in the sidebar linking to AI settings, channels, errors, and stats — no more hunting for admin pages.
- **More dependable, everywhere** — Timezones display correctly on calendars, stats show for every published post, billing forms render completely, and the platform is hardened against memory leaks, race conditions, and N+1 performance pitfalls.

**[v3.5.0]**
- **Analytics that tell you what to do next** — See how every channel trends over time, spot your best times to post at a glance, and get a prioritized list of actions to grow faster — and keep an eye on the competitors that matter to you.
- **AI that does the busy work** — Generate on-brand hashtags, instantly read the mood of your comments, catch compliance problems before you publish, and write new posts in the voice of your best-performing content.
- **Engage everywhere from one inbox** — Auto-post a first comment for extra reach, run native polls on X and LinkedIn, and reply to comments across all your channels from a single place — now covering even more platforms.
- **Plan campaigns, not just posts** — Group posts, media, and analytics by campaign, and schedule weeks of content in one move by importing a spreadsheet — with a pre-publish check that flags issues before they go live.
- **Faster, safer, more dependable** — Your accounts and data are protected by end-to-end encryption and hardened against common web attacks, on a snappier platform that's been re-architected for reliability.

**[v3.4.0]**
- **Use any AI provider you want** — You're no longer locked to a single vendor. Choose from 25 providers — 13 direct model providers (OpenAI, Anthropic, Google Gemini, xAI Grok, Meta Llama, Mistral, DeepSeek, Cohere, Perplexity, Groq, Qwen, MiniMax, Azure OpenAI) plus 12 multi-model hubs & gateways (Amazon Bedrock, Google Vertex AI, OpenRouter, Vercel AI Gateway, Together AI, Fireworks AI, DeepInfra, SiliconFlow, Lightning AI, GMI Cloud, Bitdeer, Vultr) — pick the exact model from an admin screen, test the connection, and watch live health badges. Your existing `OPENAI_API_KEY` keeps working byte-for-byte if you change nothing.
- **Stay in control of cost and safety** — Set monthly and daily spend caps per org or per use case, get an alert at 80% before you hit the limit, and review every request in a full spend log. Built-in guardrails screen input and output for prompt-injection, sensitive data (PII), brand safety, and NSFW content, with your choice of block, redact, or warn — and a dry-run preview to test a rule before it goes live.
- **AI that actually sounds like you** — Reusable brand-voice profiles, a prompt-template builder, a shared team prompt library, semantic search across your own content, smart comment replies, and a usage dashboard — so the AI writes in your voice, not a generic one.
- **One engine behind everything, bring your own keys** — The composer, the agent generator, the chat assistant, and the agent/automation API all run through a single AI provider layer, so switching providers applies everywhere without a redeploy. Teams and self-hosters can plug in their own per-organization keys, and every agent entry point is locked down with scopes, rate limits, and budget checks.

**[v3.3.0]**
- **A calendar that shows performance** — Click any post to open a full detail view: key metrics across the top, the entire post thread in one place, a scheduled-vs-published status pill, and real view/like/comment counts right on each card — plus a dedicated settings control to jump straight into editing.
- **Conversations on your posts** — A new comment-sync foundation keeps the replies on what you publish up to date on a recurring background schedule, tracks what each teammate has already read, and surfaces it all in the app — so you can stay on top of your audience without bouncing between platforms.

**[v3.2.0]**
- **Three more places to reach your audience** — Publish to **Tumblr**, **Pixelfed**, and **PeerTube**, taking Postiz to **36** connected channels. Tumblr posts native rich media (images and video) with automatic token refresh; Pixelfed and PeerTube add comment support — all managed from the same dashboard with no extra database setup.
- **Correct, not just connected** — The new providers shipped with proper formatting (plain-text rendering fixed so posts never leak raw HTML tags) and media-only posting handled correctly, backed by a 64-case provider test suite.

**[v3.1.0]**
- **Real analytics across all your channels** — A persisted, multi-channel dashboard that replaces the old one-channel-at-a-time live view. Track genuine period-over-period trends, drill into any channel, metric, or date range with rich charts, and export everything to CSV or JSON — so you can see what's actually working and act on it.
- **Built to stay accurate over time** — Metrics are snapshotted daily in the background, normalized into a consistent set across providers, and automatically rolled up into long-term weekly history with configurable retention — so collisions between similar platform metrics are eliminated, the numbers stay correct, and the database stays bounded as history grows.

**[v3.0.0+]**
- **Manage every channel from one screen** — Set up and control all your social connections from an admin UI instead of editing environment variables, with credentials encrypted at rest. Turn a provider off and your already-connected accounts keep posting, refreshing, and reporting — only new connections are paused. With no database config, everything falls back to environment variables exactly as before.
- **Dozens of provider fixes for dependable publishing** — A broad hardening pass across all 33 providers fixed real-world publishing bugs (Pinterest and Dribbble token refresh, Bluesky auto-repost thresholds, Telegram bot tokens) and removed unsafe assumptions and import-time side effects — so scheduled posts and token refreshes behave predictably.
- **A foundation you can trust** — Backed by 1000+ automated tests, a ready-to-run prebuilt image, and a stack migrated to the modern Temporal-based job model with a verified zero-data-loss upgrade path — so self-hosting is stable, predictable, and quick to deploy.

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

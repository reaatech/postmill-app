<p align="center">
  <a href="https://postiz.com/" target="_blank">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/765e9d72-3ee7-4a56-9d59-a2c9befe2311">
    <img alt="Postiz Logo" src="https://github.com/user-attachments/assets/f0d30d70-dddb-4142-8876-e9aa6ed1cb99" width="280"/>
  </picture>
  </a>
<br />
REAA Flavor
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

**[v3.5.0]**
- **Analytics that tell you what to do next** — See how every channel trends over time, spot your best times to post at a glance, and get a prioritized list of actions to grow faster — and keep an eye on the competitors that matter to you.
- **AI that does the busy work** — Generate on-brand hashtags, instantly read the mood of your comments, catch compliance problems before you publish, and write new posts in the voice of your best-performing content.
- **Engage everywhere from one inbox** — Auto-post a first comment for extra reach, run native polls on X and LinkedIn, and reply to comments across all your channels from a single place — now covering even more platforms.
- **Plan campaigns, not just posts** — Group posts, media, and analytics by campaign, and schedule weeks of content in one move by importing a spreadsheet — with a pre-publish check that flags issues before they go live.
- **Faster, safer, more dependable** — Your accounts and data are protected by end-to-end encryption and hardened against common web attacks, on a snappier platform that's been re-architected for reliability.

**[v3.4.0]**
- **Use the AI you want** — You're no longer locked to a single AI vendor. Pick your own provider and model from an admin screen, and everywhere Postiz uses AI follows your choice — while your existing setup keeps working out of the box.
- **Stay in control of cost and safety** — Set spending caps, get alerted before you hit them, and keep output on-brand and safe with built-in guardrails for brand safety, sensitive data, and prompt-injection.
- **AI woven through the product** — A reusable brand-voice profile, prompt templates, a shared team prompt library, smart comment replies, and semantic search across your own content — so the AI actually sounds like you.
- **Bring your own keys** — Self-hosters and teams can plug in their own AI accounts, with provider health and usage visible to admins.

**[v3.3.0]**
- **A calendar that shows performance** — Click any post to open its full detail — key metrics up top and the whole thread in view — with live status and engagement stats right on the card.
- **Conversations on your posts** — Postiz now keeps the comments on what you publish in sync, so you can stay on top of your audience without leaving the app.

**[v3.2.0]**
- **Three more places to reach your audience** — Publish to **Tumblr**, **Pixelfed**, and **PeerTube**, bringing Postiz to **36** connected channels — so your content goes further from the same dashboard.

**[v3.1.0]**
- **Real analytics across all your channels** — A true historical dashboard that replaces the old one-channel-at-a-time live view. Track genuine period-over-period trends, drill into any channel or date range with rich charts, and export it all — so you can see what's actually working and act on it.

**[v3.0.0+]**
- **Manage every channel from one screen** — Set up and control all your social connections from an admin UI instead of editing environment variables, with credentials encrypted at rest. Turn a provider off and your already-connected accounts keep posting, refreshing, and reporting — only new connections are paused.
- **A foundation you can trust** — Backed by 1000+ automated tests and a ready-to-run prebuilt image, so self-hosting is stable, predictable, and quick to deploy.

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

---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: Postmill
  text: Schedule social & chat posts across 36 channels
  tagline: Self-hosted scheduling with a calendar, persisted analytics, team management, a media library, and a pluggable AI layer.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/overview
    - theme: alt
      text: Run with Docker
      link: /self-hosting/docker
    - theme: alt
      text: What's Different From Upstream
      link: /CHANGES_FROM_UPSTREAM

features:
  - title: Calendar & Scheduling
    details: Add posts to a calendar; they enter a durable workflow and publish at the scheduled time across 36 channels.
    link: /features/calendar-and-posts
  - title: Persisted Analytics
    details: A multi-channel dashboard built from daily snapshots — period-over-period comparisons, best-time heatmap, and recommendations.
    link: /features/analytics
  - title: Social Comments
    details: Synced platform comments, a cross-channel inbox with sentiment and priority, quick replies, and first-comment auto-posting.
    link: /features/social-comments
  - title: Pluggable AI Layer
    details: An admin-configurable, governed multi-provider AI system for generation, brand voice, hashtags, and compliance.
    link: /ai/
  - title: Campaigns & Bulk Import
    details: Group posts into campaigns and import many at once via CSV with per-row preflight validation.
    link: /features/campaigns
  - title: Self-Hostable
    details: Runs with Docker Compose alongside PostgreSQL, Redis, and a full Temporal stack. Providers and storage configured per-tenant in-app.
    link: /self-hosting/requirements
---

## About this fork

Postmill is a fork of [Postiz](https://github.com/gitroomhq/postiz-app) that has diverged
substantially — see [What's different from upstream](/CHANGES_FROM_UPSTREAM) for the canonical
summary. Maintained by [REAA](https://reaatech.com); source and full changelog at
[github.com/reaatech/postmill-app](https://github.com/reaatech/postmill-app). Licensed under
[AGPL-3.0](https://github.com/reaatech/postmill-app/blob/main/LICENSE).
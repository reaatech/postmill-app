# Operations Guide

This guide is for self-hosters and operators running a production Postmill instance. It covers
deployment, configuration, backup, and ongoing maintenance.

## What's involved in running Postmill

Postmill is a multi-service application that schedules and publishes social media and chat posts
across 36+ channels. Running your own instance means operating:

- The **Postmill** application container (Node.js backend + Next.js frontend combined)
- A **PostgreSQL 17** database (application data)
- A **Redis 7** cache and message broker
- A **Temporal** workflow engine with its own Postgres and Elasticsearch backing stores
- Optional **object storage** for uploaded media (local disk, S3, R2, B2, or IDrive e2)

The operational surface is moderate: most state lives in Postgres, background work is durable
through Temporal, and media can live on local disk or cloud object storage.

## Stack at a glance

| Component          | Technology                          | Role                                |
|--------------------|-------------------------------------|-------------------------------------|
| Application        | Node.js >=22.12.0, Next.js 16, NestJS 11 | API + frontend server           |
| Primary database   | PostgreSQL 17                       | Users, orgs, posts, integrations, config |
| Cache / queue      | Redis 7                             | Session cache, throttle store, analytics cache |
| Workflow engine    | Temporal 1.28.1                     | Background jobs: analytics, comments, post dispatch |
| Temporal DB        | PostgreSQL 16                       | Temporal persistence                |
| Temporal search    | Elasticsearch 7.17.27               | Temporal visibility / search        |
| Media storage      | Local disk or S3/R2/B2/IDrive e2   | Uploaded images, video, audio       |
| Monitoring (opt)   | Sentry + Spotlight                  | Error tracking, debug proxy         |

## Guide pages

| Page | Description |
|------|-------------|
| [Requirements](./requirements.md) | Hardware, software, and network prerequisites |
| [Docker Deployment](./docker.md) | Running the full stack with Docker Compose |
| [Configuration](./configuration.md) | Every environment variable, organised by category |
| [Temporal & Cron](./temporal-and-cron.md) | Background workflow inventory and scheduling |
| [Storage Setup](./storage.md) | Local and cloud storage providers, quotas, per-org routing |
| [Backup & Retention](./backup-and-retention.md) | What to back up, how to restore, automated data retention |
| [Upgrading](./upgrading.md) | Clean upgrade path, Postiz->Postmill migration, building from source |
| [Security](./security.md) | Helmet, CSRF, SSRF, encryption, JWT, Sentry scrubbing, throttling |
| [OAuth / SSO](./oauth-sso.md) | Generic OIDC provider setup (Authentik, Keycloak, etc.) |

> Verified against v3.7.0

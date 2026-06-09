# Channel Provider Setup

Channel (social provider) credentials are now configured **per-tenant** in **Settings → Channels**,
not globally. Each organization provides their own OAuth app credentials (client ID, secret, redirect
URI, scopes) for the providers they use. Credentials are encrypted at rest.

> **Verified against v3.6.0.** Organization-level setup (v3.6.0+).
> API route: `/settings/channels` (organization-scoped).
>
> **Note:** The old `/admin/channels` super-admin UI was removed in v3.6.0. All provider configuration
> is now organization-level. See [Deprecated Admin Pages](#deprecated-admin-pages) below.

---

## Per-Tenant Setup

Each organization independently configures which providers they use and what OAuth credentials to use.

### Access

Organization admins (any member with admin role) can configure channel providers in **Settings →
Channels**. Non-admin users cannot see or change provider configuration.

### What you can do

1. **Connect a channel provider** — click "Add Channel" → select provider → enter OAuth app credentials
   (client ID, secret) → authorize → connected.
2. **View connection status** — a **Connection Status** panel shows each provider with a health badge:
   - 🟢 **Connected** — token is valid and recent.
   - 🟡 **Expiring** — refresh token expires soon; reconnect now.
   - 🔴 **Expired** — token expired; reconnect required.
3. **Reconnect a provider** — click "Reconnect" next to a provider to re-authorize with new credentials.
4. **Disconnect a provider** — click "Disconnect" to remove the OAuth connection. Existing posts remain
   published; only new posts are blocked until you reconnect.

### Getting OAuth Credentials

For each provider you want to use, you need to create an OAuth app in that provider's developer
console (e.g., LinkedIn App Console, Facebook App Manager, etc.). See the per-provider guides below.

---

## Credential Resolution & Fallback

v3.6.0 reads credentials from the database first. If no organization-level config exists, the system
**falls back to environment variables** (for backward compatibility):

- **DB config exists** → use the organization's configured credentials.
- **No DB config, but env var set** → use the env var (deprecated; a warning is logged).
- **No DB config and no env var** → provider is unconfigured; users cannot connect it.

**Migrate away from env vars** by:
1. Create an OAuth app in the provider's console.
2. Configure it in **Settings → Channels**.
3. Test the connection (click "Test" or try posting).
4. Remove the env var from your `.env` file.

---

## Existing Connected Accounts

> **Important:** removing channel configuration only blocks **new** connections. Channels you have
> already connected keep working — they continue posting, refreshing tokens, and reporting analytics.

Disconnecting from Settings does not publish your already-posted content or reset existing tokens.

---

## Deprecated Admin Pages

The old super-admin `/admin/channels` page was removed in v3.6.0. All channel configuration is now
organization-scoped. If you were using the admin setup instructions feature, that is no longer
available; instead, share setup docs (like the per-provider guides below) directly with your users
via your help docs or onboarding materials.

---
rejects disabled providers, but read/maintenance paths for already-connected channels use an
unchecked lookup so that disabling one provider never breaks unrelated channels or aborts a token-
refresh batch.

## Migrating existing env credentials into the database

If you're upgrading from an env-var-only setup, a one-time idempotent script imports your existing
environment credentials into `ProviderConfiguration`:

```bash
# from the repo root
ts-node scripts/migrate-channel-config.ts
```

It maps all providers, is safe to re-run (re-running won't flip an `enabled: true` back off), and
reports migrated/skipped counts. After running it, manage everything from `/admin/channels`.

## The 36 providers

This fork supports 36 channels, including the fork-added **Tumblr**, **Pixelfed**, and **PeerTube**.
Per-provider OAuth-app setup details are covered in the channels reference *(planned docs section)*;
for now, use each provider's setup-instructions field in the admin UI to document app setup for your
users.

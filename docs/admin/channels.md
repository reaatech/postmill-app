# Channels Admin

Channel (social provider) credentials are managed by a **super-admin** in the web UI at
**`/admin/channels`**, with credentials encrypted at rest. This replaces editing environment
variables for each provider, though env vars remain a fallback.

> **Verified against v3.4.0.** Introduced in v3.0.0.
> UI route: `/admin/channels` · API route: `/admin/channel-configs` (super-admin only).

---

## Why this exists

In upstream Postiz, every provider's OAuth/API credentials come from environment variables. This
fork stores them in a `ProviderConfiguration` database model, edited through an admin screen, and
encrypts them using `JWT_SECRET`. Admins can enable/disable providers and add per-provider setup
instructions without redeploying.

## Access

Only users with `isSuperAdmin` can view or change channel configuration. The "Channels" admin nav
and every `/admin/channel-configs` endpoint enforce this; non-admins are rejected.

## What you can do

- **Enable / disable** a provider (toggle auto-saves immediately).
- **Set credentials** — client ID/secret, token, redirect URI, scopes, and any provider-specific
  additional config.
- **Add setup instructions** — free-text guidance shown to users in the "Add Channel" modal.

## Credential resolution & fallback

Credential reads go through a single resolver that checks the **database cache first, then
`process.env`**:

- **No DB configs at all** → every provider falls back to its environment variables (upstream-style
  behaviour). All providers are shown.
- **Some DB configs exist** → only providers enabled in the database are offered for new
  connections. If configs exist but all are disabled, **zero** providers are shown (admin intent is
  respected).

The configuration cache has a short TTL and refreshes atomically, so a single corrupt row can't
take down the whole channel list.

## Disabling a provider is safe for existing channels

> **Important:** disabling a provider only blocks **new** connections. Channels users have already
> connected keep working — they continue posting, refreshing tokens, and reporting analytics.

This is deliberate. Connect, OAuth, posting, and plug-execution paths go through a gated lookup that
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

# Provider round-2 release checklist

Pre- and post-deploy checklist for the **provider-surface round-2 remediation** (part of the
unreleased v4.0.0 provider-framework cutover). These are behaviour changes and data-hygiene steps
that an operator should walk through when upgrading a production instance. Read this alongside the
main [Upgrading](./upgrading.md) guide.

## At a glance

| Item | Type | Action needed |
|------|------|---------------|
| Budget global-cap cleanup (0.4) | Data | None — runs automatically on boot |
| SES `EMAIL_WEBHOOK_SECRET` | Config | Optional — set if you use SES delivery tracking |
| Orphaned `mastodon-custom` channels (5.3) | Data | Count and re-map / notify affected orgs |
| Self-hosted `http://` media (5.7) | Config | Set HTTPS or `SSRF_ALLOWED_PRIVATE_CIDRS` if self-hosting media over http |
| `/providers/catalog` auth + 400 (3.9) | Behaviour | None — internal settings pages only |
| Encryption routes (5.6) | Docs only | None — behaviour unchanged |

## Pre-deploy

### 1. Back up

Take a full backup before deploying. See [Backup & Retention](./backup-and-retention.md).

### 2. Count orphaned `mastodon-custom` channels (item 5.3)

The `mastodon-custom` provider (a custom-instance Mastodon variant carried over from upstream Postiz)
was **removed**. Any production `Integration` rows still pinned to that identifier are now **dead
channels** — they resolve to no kernel module, so they cannot publish or collect analytics. This only
affects forks that ran the older Postiz-era `mastodon-custom` provider; a clean Postmill install has
none.

Count them before deploying:

```sql
SELECT count(*) FROM "Integration" WHERE "providerIdentifier" = 'mastodon-custom';
```

If the count is **0**, there is nothing to do. If it is **> 0**, pick one:

- **Re-map to the standard `mastodon` provider.** The custom-instance provider extended the base
  Mastodon adapter and used the same OAuth token shape, so re-pointing the identifier is generally
  safe — but the instance base URL must be one the base `mastodon` provider can reach. Validate on a
  copy first:

  ```sql
  -- inspect affected rows first (org, name, instance URL in customFields/settings)
  SELECT id, "organizationId", name, "providerIdentifier"
  FROM "Integration"
  WHERE "providerIdentifier" = 'mastodon-custom';

  -- re-map (run only after confirming the rows are genuinely standard Mastodon)
  UPDATE "Integration"
  SET "providerIdentifier" = 'mastodon'
  WHERE "providerIdentifier" = 'mastodon-custom';
  ```

- **Notify affected orgs** to reconnect the channel through Settings → Channels, then disable or
  delete the stale rows.

Do not leave the rows unaddressed: they surface in the org's channel list but silently fail every
publish and analytics sweep.

### 3. Note new / changed env vars

- **SES `EMAIL_WEBHOOK_SECRET`** (carried from PR #50). SES delivery tracking uses SNS topic
  verification; `EMAIL_WEBHOOK_SECRET` can optionally hold the expected SNS `TopicArn` to restrict
  incoming notifications. See [Configuration](./configuration.md) → Email providers. Optional — SES
  works without it; setting it hardens the webhook.
- **`SSRF_ALLOWED_PRIVATE_CIDRS`** — needed only if you self-host media over `http://` or a private
  address (see item 5.7 below).

## Behaviour changes to expect

### `/providers/catalog` now requires auth and rejects unknown domains (item 3.9)

`GET /providers/catalog?domain=` moved into the **authenticated** route group
(`AuthMiddleware`/`CsrfMiddleware` apply) — it is **no longer anonymously reachable**. An unknown or
unsupported `?domain=` value now returns **400 Bad Request** instead of an unfiltered/empty catalog.
Only authenticated settings pages consume this route, so no anonymous integration should break; if
you have a custom anonymous script hitting it, give it an authenticated session.

### Self-hosted media over `http://` is blocked (Pinterest video) (item 5.7)

`safeFetch` enforces **HTTPS + public IP** on outbound provider fetches, so a self-hosted instance
serving media over plain `http://` (LOCAL storage) or a private address now gets a `Blocked URL`
error where it previously worked. The concrete case is **Pinterest video posting**, where the
provider re-fetches the media URL server-side. To restore it, either serve media over **HTTPS** with
a public hostname (recommended), or add the private range to **`SSRF_ALLOWED_PRIVATE_CIDRS`**
(opt-in). Managed cloud storage (S3/R2/B2/etc.) is unaffected. Full detail in
[Security → SSRF protection](./security.md#self-hosted-media-over-http-pinterest-video-local-storage).

### Add-channel blips now surface an error (item 5.2)

Several add-channel connect/list flows (GMB, Kick, LinkedIn-page, Whop) now surface an **error**
instead of an empty account list when the provider returns a transient 4xx/5xx during the connect
handshake. This is a correctness improvement — a provider error is no longer silently swallowed as
"no accounts" — but the visible UX changes from a blank list to an error the user can retry.

## Runs automatically (no action)

### Budget global-cap cleanup (item 0.4)

Pre-fix org budget writes could leak an org-slice cap into the global `AISystemSettings`
`budgetSettings` singleton. A boot-time backfill (`BackfillService.cleanupLeakedGlobalBudgetCaps`,
step "budget global-cap cleanup") removes those leaked top-level caps from the global settings on
the next start. It runs once (migration-ledger-gated) and is idempotent.

**Operator check:** a leaked org cap is indistinguishable from an *intentional* super-admin global
cap set via `PUT /admin/ai-settings/governance`, so the cleanup never destroys the values — it logs
a warning with the removed JSON and parks it under `budgetSettings._strippedLegacyGlobalCaps`. If
your deployment had an intentional platform-wide cap, re-set it via the governance route after the
first boot and delete the backup key.

### Encryption routes (item 5.6) — docs only

`EncryptionService.encrypt/decrypt` delegates to `AuthService.fixedEncryption` (one shared
`getEncryptionKey()`). The two "routes" (per-org domain rows vs. global rows) share one key and do
**not** diverge, even when a dedicated `ENCRYPTION_KEY` is set. This was a documentation correction
only — behaviour is unchanged and all existing rows still decrypt.

> Verified against v4.0.0

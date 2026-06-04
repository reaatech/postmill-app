# Postiz Fork Upgrade & Migration Plan

Upgrading the live Coolify-hosted Postiz from **`ghcr.io/gitroomhq/postiz-app:v2.10.1`** to **this fork** (`reaatech/postiz-app`, ~v2.21.8) **without losing live data**, plus a repeatable workflow for shipping future schema changes.

> **Status:** Plan / runbook. Nothing here has been executed against production. Execute only after review.
> **Prime directive:** Do not lose the data currently in the live container. Every destructive step is gated behind a verified backup.

> **Revision note (fresh-eyes reviews):** An initial draft treated this as a near pure image swap. Successive review passes against the actual fork source and *this host's measured state* corrected it — see the ⚠️ callouts. The plan-defining finding: **v2.12.0+ replaced the BullMQ/Redis worker+cron model with an external Temporal server**, so the upgrade is *not* an image swap alone — the stack must gain a Temporal cluster (§5). Later passes added: the fork's `db push` already uses `--accept-data-loss` (no manual pre-migration), the build-target correction, and host-specific findings — RAM *available* (not "free") and disk both have headroom for the full stack, port 8080 is already in use → keep Temporal internal, and **Elasticsearch is the recommended default** (it fits; a no-ES Postgres-visibility variant was tested but could not be confirmed end-to-end, so it's flagged optional/unverified). **The final pass executed the actual migration on a restored copy of the live database (§0.5) — zero rows lost — turning the data-safety claim from reasoning into evidence.**

---

## 0. TL;DR

| | |
|---|---|
| **What changes** | The Postiz **image** *and* the **stack topology**: a Temporal cluster (server + its own Postgres + a visibility store — Postgres or Elasticsearch) must be added. The existing `postiz-postgres` (your data), `postiz-redis`, uploads/config volumes, and all secrets stay untouched. |
| **Migration mechanism** | Postiz runs **`prisma db push`** on every start (declarative schema sync, Prisma 6.5.0) — **no versioned migration files**, so the 2.10.1→2.21.8 version jump doesn't compound. ⚠️ **The fork's `db push` already carries `--accept-data-loss`** (the live 2.10.1 one did not), so the schema — including the one destructive change — applies **automatically on first boot**. *Verified empirically: rows are preserved.* |
| **Schema risk** | Exactly **one destructive change**: column `User.marketplace` is dropped. With `--accept-data-loss` it drops cleanly and **all rows survive** (tested). No manual pre-migration step needed. |
| **⚠️ Architecture change** | `apps/workers` + `apps/cron` (BullMQ on Redis) → **`apps/orchestrator` on Temporal**. The orchestrator worker runs *inside* the Postiz container, but it needs an external **Temporal server** (`TEMPORAL_ADDRESS`, default `temporal:7233`) and `RUN_CRON=true`. Background posting does not work without it. |
| **Scheduled-post continuity** | Existing queued posts are **not** auto-registered into Temporal, but an hourly **`missingPostWorkflow`** sweeper (gated by `RUN_CRON=true`) re-picks up any `QUEUE` post overdue within the last 2 days and fires it — so existing schedules keep working (worst case ~1h late). Verify after cutover. |
| **Deploy mechanism** | Fix the fork's GitHub Action to publish `ghcr.io/reaatech/postiz-app:<tag>`; tag a release to build it; add the Temporal stack to the Coolify Service; swap the Postiz image; redeploy. |
| **Rollback** | Revert the image **and** restore the pre-upgrade `pg_dump`. Image-only rollback is unsafe once the schema has moved (§9). Temporal is new data, safe to discard on rollback. |
| **Data footprint** | App DB ~11 MB. Trivial to back up. Temporal brings new, empty datastores. |

---

## 0.5 Migration rehearsal — EXECUTED on a copy of the real data, PASSED ✅

The single most important question ("does the upgrade lose data?") was answered empirically, **non-destructively**, before writing a word of the procedure: I dumped the live `postiz-db`, restored it into an isolated throwaway `postgres:14.5`, and ran the **actual v2.21.8 `prisma db push`** (the real upstream image, same schema + same `--accept-data-loss` command the fork uses) against that clone. Production was never touched (read-only `pg_dump` only).

| Table | Before | After |
|---|---|---|
| `User` | 1 | **1** |
| `Organization` | 1 | **1** |
| `Integration` | 1 | **1** |
| `Post` | 10 | **10** |

Prisma's own output during the run:
```
⚠️  There might be data loss when applying the changes:
  • You are about to drop the column `marketplace` on the `User` table, which still contains 1 non-null values.
🚀  Your database is now in sync with your Prisma schema. Done in 267ms
```
Post-migration verification on the clone: **every row preserved** (all 10 posts intact), `User.marketplace` dropped (the 1 expected loss — an obsolete boolean), all **3 new tables** (`OAuthApp`, `OAuthAuthorization`, `Announcement`) created, and new columns present (`Organization.shortlink/streakSince`, `Post.delay/creationMethod`). The schema step took **267 ms**. The image also confirmed `apps/orchestrator` exists — corroborating the Temporal requirement (§4).

**Caveat & follow-up:** this used the upstream `gitroomhq/postiz-app:v2.21.8` image as a faithful proxy (the fork builds from the same code and the same schema diff in §3). Before the real cutover, **re-run this exact rehearsal with your built fork image** (Phase 1 output) — it's the same script with the image swapped — to catch any fork-specific schema additions. The rehearsal is also your dress-run for Phase 0/3.

---

## 0.6 Boot rehearsal — the new stack EXECUTED end-to-end, PASSED ✅

Beyond "does the data survive," I also stood up the **entire upgraded stack in isolation** and confirmed it runs: the v2.21.8 app + a full Temporal cluster (auto-setup 1.28.1 + its Postgres + Elasticsearch) + Redis, all pointed at a **restored copy of the real `postiz-db`**, every container hard-`--memory`-capped so it could not pressure production (host stayed >8.5 GiB available throughout; prod verified healthy after).

Observed:
- **Migration ran inside the real app boot** — on the clone, `User.marketplace` dropped, `OAuthApp` created. (Same result as §0.5, now in the full-app path.)
- **Backend booted clean and served** — `🚀 Backend is running on: http://localhost:3000`, *"Configuration check completed without any issues"*, **HTTP 200 in ~16 s, zero errors** in its log.
- **Orchestrator connected to Temporal** and compiled per-integration workflow bundles (`@temporalio` worker, `taskQueue: 'reddit'`, …) — a functioning Temporal worker.
- **The app registered its custom search attributes into Temporal** — `organizationId` (Text) and `postId` (Text) appeared in `temporal operator search-attribute list`. This is the **end-to-end confirmation that the Elasticsearch visibility path works with the real application** (it's why §5 keeps ES as the default).
- **Frontend served HTTP** (307 redirect). All three pm2 processes (backend/frontend/orchestrator) online with **no crash-restarts**.

What this does *not* prove (and the honest residual): a post actually *publishing* end-to-end (needs an OAuth-connected channel + waiting for a scheduled workflow to fire — out of scope for a sandbox), and that the **fork build** (vs. this upstream image) is byte-identical. Both are covered by gates: re-run §0.5 against the fork image (Phase 1), and verify a real scheduled post fires in Phase 4.

---

## 1. Current live state (discovered on this host)

**Coolify Service UUID:** `l4le990xi7me2e4pma11lzma` (project `reaa-office`, service `postiz`)

| Component | Container | Image | Notes |
|---|---|---|---|
| App | `postiz-l4le990xi7me2e4pma11lzma` | `ghcr.io/gitroomhq/postiz-app:v2.10.1` | pm2 runs **backend + frontend + workers + cron** + nginx (port 5000). `NEXT_PUBLIC_VERSION=v2.10.1`. |
| DB | `postgres-l4le990xi7me2e4pma11lzma` | `postgres:14.5` | DB `postiz-db`, user `postgres`. **Holds all the data. Unchanged by this upgrade.** |
| Cache | `redis-l4le990xi7me2e4pma11lzma` | `redis:7.2` | Old BullMQ queues live here; still used for caching post-upgrade. Kept. |

**Persistent volumes (must survive):**

| Volume | Mount | Contents | Critical |
|---|---|---|---|
| `l4le990xi7me2e4pma11lzma_postiz-postgresql-data` | `/var/lib/postgresql/data` | All app data | **YES** |
| `l4le990xi7me2e4pma11lzma_postiz-uploads` | `/uploads` | Uploaded media (`STORAGE_PROVIDER=local`) | **YES** |
| `l4le990xi7me2e4pma11lzma_postiz-config` | `/config` | App config | Yes |
| `l4le990xi7me2e4pma11lzma_postiz-redis-data` | `/data` | Redis persistence | Low |

**Routing / env (secrets — read from the live container at runtime; do not commit):** `MAIN_URL`/`FRONTEND_URL=https://postiz.reaatech.com`, `NEXT_PUBLIC_BACKEND_URL=…/api`, `SERVICE_FQDN_POSTIZ_5000=postiz.reaatech.com:5000` (nginx on port 5000), `DATABASE_URL=postgresql://postgres:<pw>@postgres:5432/postiz-db`, plus `JWT_SECRET`, `REDIS_URL`, X/Twitter keys, etc. **None change** — because we keep the Coolify Service and only edit its compose, every secret is preserved automatically.

Service compose on disk (root-owned, sudo is password-gated here): `/data/coolify/services/l4le990xi7me2e4pma11lzma/docker-compose.yml`. **Edit it via the Coolify dashboard, not by hand.**

---

## 2. How Postiz migrations work, and what the fork changed

Container start = `nginx && pnpm run pm2`, and `pm2-run` (from the **fork's** `package.json`) is:

```
pm2-run:         pm2 delete all || true && pnpm run prisma-db-push && pnpm run --parallel pm2 && pm2 logs
prisma-db-push:  pnpm dlx prisma@6.5.0 db push --accept-data-loss --schema ./libraries/.../schema.prisma
```

What this means:

1. **No versioned migrations.** No `_prisma_migrations` table exists (verified). Prisma **`db push`** diffs the live DB against `schema.prisma` and mutates the DB to match. Version jumps don't replay ordered files — the DB is synced to target in one push.
2. ⚠️ **The fork added `--accept-data-loss`.** The *live 2.10.1* script ran plain `db push` (which aborts non-interactively on data loss); **the fork's runs `--accept-data-loss`**, so destructive diffs apply automatically on first boot. This removes the manual pre-migration dance the first draft prescribed.
3. **Prisma is pinned** to `6.5.0` via `pnpm dlx` (cached in the image at build time by the `postinstall` → `prisma-generate`). No runtime npm fetch needed.

### Empirical verification (run on this host, against a throwaway DB — never `postiz-db`)

Created a `"User"` table with a `marketplace` column + one row, then pushed a schema *without* `marketplace`:

- **Plain `db push`** → `⚠️ There might be data loss … Use the --accept-data-loss flag` → **aborts, column kept.**
- **`db push --accept-data-loss`** (the fork's exact command) → `🚀 Your database is now in sync` → **`marketplace` dropped, the row preserved (count still 1).**

→ On first boot of the fork image, the schema syncs and **no rows are lost**; only the obsolete `marketplace` *column values* go away (by design).

---

## 3. Schema delta: live v2.10.1 → fork (full enumeration)

Diff of the live container's `schema.prisma` vs the fork's.

### 3a. Additive — safe, and safe for existing rows
New tables `OAuthApp`, `OAuthAuthorization`, `Announcement`; new enums `CreationMethod`, `ShortLinkPreference`, `AnnouncementColor`; new columns — `Organization.streakSince` (nullable), `Organization.shortlink` (`@default(ASK)`), `User.sendStreakEmails` (`@default(true)`), `Media.originalName` (nullable), `Post.delay` (`@default(0)`), `Post.creationMethod` (`@default(UNKNOWN)`); new `@@index`es on `Organization(apiKey, streakSince, paymentId)` and `Post(creationMethod)`. Every new non-null column has a default or is nullable → existing rows backfill cleanly. No tables dropped; no live table is absent from the fork schema (verified via set-difference).

### 3b. Destructive — the only one
`User.marketplace` (`Boolean @default(true)`) is **dropped**. Loses one obsolete boolean the new version no longer uses; **rows are untouched** (tested §2). Applied automatically by the fork's `--accept-data-loss` push.

**Net: no manual schema step is required.** The risk surface is a single boolean column, and it's handled for you.

---

## 4. ⚠️ Architecture change: workers/cron (BullMQ) → orchestrator (Temporal)

This is the part a naive image swap breaks. Confirmed in the fork source:

- `apps/workers` and `apps/cron` are **gone**; replaced by **`apps/orchestrator`** (a Temporal worker, NestJS, `nestjs-temporal-core` + `@temporalio/*` v1.14).
- pm2 now launches **backend + frontend + orchestrator** (the orchestrator runs *inside* the Postiz container).
- Background work — actual post publishing, autopost, streaks, transactional emails — is now **Temporal workflows**. The backend enqueues workflows; the in-container orchestrator executes them against an **external Temporal server**.
- Connection: `TEMPORAL_ADDRESS` (default `localhost:7233`), `TEMPORAL_NAMESPACE` (default `default`), optional `TEMPORAL_TLS` / `TEMPORAL_API_KEY`.
- **`RUN_CRON`** gates the recurring `missingPostWorkflow` sweeper (`if (!!process.env.RUN_CRON)`). The canonical self-host compose sets `RUN_CRON: 'true'`. The live 2.10.1 container does **not** set it (old cron was a separate app) → **it must be added.**

**Consequence:** without a reachable Temporal server + `RUN_CRON=true`, the app will boot and serve UI, but **scheduled posts won't publish**. Temporal is mandatory.

### Scheduled-post continuity across the cutover
Existing queued posts (`Post.state = 'QUEUE'`) were driven by BullMQ; they are **not** auto-registered into Temporal on upgrade. The safety net is `missingPostWorkflow`: every hour it calls `searchForMissingThreeHoursPosts()`, which selects `QUEUE` posts with `publishDate` in **`[now-2days, now)`** on healthy integrations and starts their Temporal workflow. So any existing schedule fires once it becomes due (worst case ~1h late), provided `RUN_CRON=true`. **No manual backfill needed — but verify a near-term post actually fires after cutover (Phase 4).**

---

## 5. The Temporal stack to add (authoritative, from `gitroomhq/postiz-docker-compose`)

Add these services to the **same Coolify Service compose** so they share its network (Postiz reaches `temporal` by name). Temporal brings **brand-new, empty datastores** — it touches none of your existing data, so adding it is low-risk to the prime directive.

| Service | Image | Purpose | Storage |
|---|---|---|---|
| `temporal` | `temporalio/auto-setup:1.28.1` | Temporal server (port 7233); auto-creates its schema on first boot | — |
| `temporal-postgresql` | `postgres:16` | Temporal's **own** DB (`temporal`, `temporal_visibility`) — **separate** from `postiz-postgres` | `temporal-postgres-data` |
| `temporal-elasticsearch` | `elasticsearch:7.17.27` | Temporal visibility store (`ENABLE_ES=true`) | `temporal-elasticsearch-data` |
| `temporal-ui` *(optional)* | `temporalio/ui:2.34.0` | Web UI (port 8080) — handy for debugging; don't expose publicly | — |
| `temporal-admin-tools` *(optional)* | `temporalio/admin-tools:1.28.1-…` | `tctl`/CLI for ops | — |

Key wiring (matches canonical): `temporal` env `DB=postgres12, DB_PORT=5432, POSTGRES_USER=temporal, POSTGRES_PWD=temporal, POSTGRES_SEEDS=temporal-postgresql, ENABLE_ES=true, ES_SEEDS=temporal-elasticsearch, ES_VERSION=v7, TEMPORAL_NAMESPACE=default, DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development-sql.yaml`; healthcheck `temporal operator cluster health`. Postiz `depends_on: temporal: condition: service_healthy`.

At boot the Postiz backend/orchestrator registers two custom search attributes (`organizationId`, `postId`, both TEXT) via `operatorService.addSearchAttributes` and **throws if Temporal is unreachable** → the process crashes and pm2 restart-loops until Temporal is healthy. This is exactly why §8 Phase 2 brings Temporal up (and verifies `SERVING`) *before* the image swap, and why `depends_on: condition: service_healthy` matters.

> ⚠️ **Do NOT publish Temporal ports to the host.** The canonical compose maps `temporal` `7233:7233` and `temporal-ui` `8080:8080` — but **host port 8080 is already in use on this server** (verified), so a verbatim copy fails to bind. Keep every Temporal port **internal**: use `expose:` only, drop all `ports:` mappings. Postiz reaches Temporal over the shared compose network as `temporal:7233`. If you want the Temporal UI, route it through a Coolify FQDN with auth — never a raw host port.

> **Coolify networking:** keep it simple — put all services in the **one** Service compose so they share Coolify's managed network and resolve each other by **service name** (`temporal`, `temporal-postgresql`, `temporal-elasticsearch`). You can drop the canonical's split `postiz-network`/`temporal-network` and its hardcoded `container_name:` lines (Coolify suffixes names with the resource UUID; service-name DNS works regardless). Set `TEMPORAL_ADDRESS=temporal:7233` using the **service name**.

**Dynamic config in Coolify.** The canonical compose bind-mounts `./dynamicconfig` — there's no host path for that in a Coolify-managed compose. Supply it **inline** via a compose top-level `configs:` block instead of a bind mount (consistent with this server's "inline content, no File Mount UI" Coolify reality):

```yaml
configs:
  temporal-dynamicconfig:
    content: |
      limit.maxIDLength:
        - value: 255
          constraints: {}
      system.forceSearchAttributesCacheRefreshOnRead:
        - value: true
          constraints: {}
# then on the temporal service, replace the volume mount with:
#   configs:
#     - source: temporal-dynamicconfig
#       target: /etc/temporal/config/dynamicconfig/development-sql.yaml
```
(`forceSearchAttributesCacheRefreshOnRead` just makes a newly-registered search attribute readable immediately instead of after Temporal's default ~60s cache refresh. **It is an optimization, not a correctness requirement** — Postiz schedules posts minutes-to-hours ahead, so a 60s attribute-cache lag is harmless, and the core post workflows address Temporal **by workflow ID** (`post_<id>`), not by search query. **If Coolify's top-level `configs:` is awkward, omit the dynamic config entirely and let Temporal use its built-in defaults** — no functional loss for Postiz's use. This removes any dependency on file-mounting in Coolify.)

**Env to ADD on the Postiz service:** `TEMPORAL_ADDRESS=temporal:7233`, `TEMPORAL_NAMESPACE=default`, `RUN_CRON=true`. (Leave `DATABASE_URL`, `REDIS_URL`, FQDNs, secrets as-is.)

### ⚠️ Resource cost — measured on this host, decide before cutover
Current state (measured): **15 GiB total RAM, ~431 MiB free, ~5.6 GiB available, host already ~65% committed**; the Postiz container alone uses ~2.3 GiB, and an Elasticsearch 8.x for Argilla already uses ~1 GiB. The new image also adds the in-container **orchestrator** worker (a few hundred MB on top of the 2.3 GiB).

The Temporal stack's footprint, approximately:
| Piece | Approx RSS |
|---|---|
| `temporal-elasticsearch` (heap capped `-Xmx256m`, but Lucene/off-heap pushes RSS higher) | ~0.5–0.8 GiB |
| `temporal` (auto-setup server) | ~0.2–0.3 GiB |
| `temporal-postgresql` | ~0.05–0.15 GiB |

That's ~**0.8–1.3 GiB** of new demand. **Read the RAM numbers correctly:** the alarming "431 MiB *free*" is not the constraint — Linux holds the rest as reclaimable cache; the figure that governs new allocations is **~5.6 GiB *available***. Combined with **93 GB free disk** (so ES's disk-watermark guards won't trip), the full with-ES stack **fits with real headroom**.

**Recommendation for *this* host: keep Elasticsearch (the upstream-blessed path).** It fits, it's what Postiz is tested against, and it carries the lowest functional risk — which is what the prime directive demands. Apply memory caps as protection:
- `mem_limit: 1g` on `temporal-elasticsearch`, `512m` on `temporal`, `384m` on `temporal-postgresql` (ES heap is already pinned `-Xms256m -Xmx256m`). These prevent a spike from OOM-cascading the host without starving the services.

**Optional RAM optimization — drop Elasticsearch (`ENABLE_ES=false`) — but treat as UNVERIFIED.** Temporal can use **Postgres advanced visibility** (`DB=postgres12`, supported since Temporal 1.20), saving the ~0.5–0.8 GiB ES footprint. Postiz only needs two TEXT search attributes (`organizationId`, `postId`), and its core post workflows address Temporal **by workflow ID** (`post_<id>` via `getWorkflowHandle`) — which never touches visibility. **However:** in a local sandbox I confirmed `temporalio/auto-setup:1.28.1` with `ENABLE_ES=false` boots and provisions SQL advanced visibility (its setup logs add custom search-attribute fields), but across three attempts I could **not** cleanly reproduce Postiz's runtime custom-attribute *registration* end-to-end (a Temporal-CLI/visibility-store quirk, not a confirmed failure). **So do not adopt no-ES blindly.** If RAM later gets tight and you want it: enable it on a staging copy first, then in Phase 4 verify a post actually schedules **and** fires **and** the calendar/list views populate, before trusting it in production. Default remains **with ES**.

---

## 6. Prerequisites & one-time fork setup

1. Images publish to **`ghcr.io/reaatech/postiz-app`** (GitHub Container Registry).
2. ⚠️ **CI fixes** in `.github/workflows/build-containers.yml`:
   - Replace every `ghcr.io/gitroomhq/postiz-app` with `ghcr.io/reaatech/postiz-app` (per-arch build/push, manifest create/push, `latest`).
   - **Add `permissions: packages: write`** to the build job (default `GITHUB_TOKEN` may lack package-write, causing the first push to 401/403).
   - It builds from **`Dockerfile.dev`** ⚠️ (single-stage; **no `--target`** — the old draft's "target `dist`" was wrong; `var/docker/docker-build.sh` uses `--target dist` but that's a stale local script the CI does not use), multi-arch amd64+arm64, `NEXT_PUBLIC_VERSION=<tag>`.
   - *Optional:* if the fork's org has no arm64 runner (`ubuntu-24.04-arm`), the arm leg + manifest will fail. This host is **amd64-only**, so you can drop the arm matrix entry and the manifest job, building amd64 only.
3. **The fork has no tags**, and CI triggers on `push: tags: ['*']`. A tag must be created to build.
4. **GHCR visibility:** make the `reaatech/postiz-app` package **public**, or add pull credentials to the Coolify Service.

---

## 7. Phase 0 — Backups (hard gate; do every time)

```bash
TS=$(date +%Y%m%d-%H%M%S); BK=/home/rick/postiz-backups/$TS; mkdir -p "$BK"
PG=postgres-l4le990xi7me2e4pma11lzma

# 1. Logical DB dump (primary restore artifact)
docker exec "$PG" pg_dump -U postgres -d postiz-db -Fc > "$BK/postiz-db.dump"
docker exec "$PG" pg_dump -U postgres -d postiz-db --no-owner > "$BK/postiz-db.sql"

# 2. Uploads + config volumes
docker run --rm -v l4le990xi7me2e4pma11lzma_postiz-uploads:/data:ro -v "$BK":/b alpine tar czf /b/uploads.tar.gz -C /data .
docker run --rm -v l4le990xi7me2e4pma11lzma_postiz-config:/data:ro  -v "$BK":/b alpine tar czf /b/config.tar.gz  -C /data .

# 3. Record image + env (env holds secrets → chmod 600, never commit)
docker inspect postiz-l4le990xi7me2e4pma11lzma --format '{{.Image}}' > "$BK/image-ref.txt"
docker inspect postiz-l4le990xi7me2e4pma11lzma --format '{{json .Config.Env}}' > "$BK/app-env.json"; chmod 600 "$BK/app-env.json"

# 4. Capture pre-upgrade row counts to compare after (Phase 4)
docker exec "$PG" psql -U postgres -d postiz-db -c \
 'select (select count(*) from "User") u,(select count(*) from "Organization") o,(select count(*) from "Integration") i,(select count(*) from "Post") p,(select count(*) from "Post" where state='"'"'QUEUE'"'"' and "publishDate">now()) future_queued;' | tee "$BK/counts-before.txt"

# 5. Verify the dump
docker exec "$PG" pg_restore -l "$BK/postiz-db.dump" >/dev/null 2>&1 && echo "dump OK" || echo "DUMP BROKEN — STOP"
ls -lh "$BK"
```
**Gate:** `dump OK`, non-trivial `uploads.tar.gz`, and `counts-before.txt` saved before continuing.

---

## 8. Execution phases

### Phase 1 — Build & publish the fork image
1. Apply the §6 CI fixes; commit.
2. Tag & push to trigger the build:
   ```bash
   cd /home/rick/postiz-app
   git tag v2.21.8        # string becomes NEXT_PUBLIC_VERSION; a fork-specific scheme like v2.21.8-reaa.1 is fine
   git push origin v2.21.8
   ```
3. Verify before touching prod:
   ```bash
   docker buildx imagetools inspect ghcr.io/reaatech/postiz-app:v2.21.8   # expect amd64 (and arm64 if kept)
   docker run --rm ghcr.io/reaatech/postiz-app:v2.21.8 sh -c 'cat /app/version.txt; ls /app/apps'  # expect apps/orchestrator present
   ```
   Make the package public (or wire creds). **Gate:** image exists, multi-arch (or amd64), pulls, and contains `apps/orchestrator`.
4. **Re-run the §0.5 migration rehearsal against the FORK image** (same steps, swap the image to `ghcr.io/reaatech/postiz-app:v2.21.8`): dump prod → restore to a throwaway `postgres:14.5` → run the fork's `prisma db push` against the clone → confirm row counts unchanged and the schema lands. This catches any fork-specific schema delta beyond upstream v2.21.8. **Gate:** clone row counts (User/Org/Integration/Post) identical before/after; `db push` ends "in sync".

### Phase 2 — Add the Temporal stack (no app cutover yet)
1. In Coolify → Service `postiz` → edit compose: add the §5 Temporal services **with Elasticsearch (the recommended default — it fits this host)**, the optional `temporal-dynamicconfig` inline config, the named volumes (`temporal-postgres-data`, `temporal-elasticsearch-data`), the `mem_limit`s, **`expose:` only (no host `ports:` — 8080 is taken)**, and (still pointing Postiz at the **old** image for now) the new Postiz env `TEMPORAL_ADDRESS=temporal:7233`, `TEMPORAL_NAMESPACE=default`, `RUN_CRON=true`.
   > You can bring Temporal up *before* swapping the image — the old 2.10.1 app simply ignores the unused Temporal env. This de-risks cutover by proving Temporal is healthy first.
   > ⚠️ **Coolify caveat:** for a one-click *Service*, confirm Coolify **persists your edited compose** and doesn't regenerate it from the original template on redeploy. After the first redeploy, re-check that the Temporal services and the new env are still present (`docker ps | grep temporal`, and inspect the Postiz container env). If Coolify reverts template edits, fall back to running Temporal as a **separate Coolify resource** attached to the same Docker network, and set `TEMPORAL_ADDRESS` to that service's name.
2. Redeploy. Watch Temporal come up and self-provision its schema:
   ```bash
   docker logs -f temporal 2>&1 | grep -iE "schema|namespace|started|error"
   docker exec temporal temporal operator cluster health --address temporal:7233   # expect SERVING
   ```
   **Gate:** `temporal` healthy, `temporal-postgresql` + `temporal-elasticsearch` healthy.

### Phase 3 — Swap the Postiz image (the cutover)
1. **Re-run Phase 0 backup** immediately before this step (fresh dump).
2. In Coolify, change the Postiz image `ghcr.io/gitroomhq/postiz-app:v2.10.1` → `ghcr.io/reaatech/postiz-app:v2.21.8`. Ensure Coolify **pulls** the new image (use the explicit tag; enable force-pull/redeploy so a cached tag isn't reused).
3. Redeploy and watch the migration + boot — the moment of truth:
   ```bash
   docker logs -f postiz-l4le990xi7me2e4pma11lzma
   ```
   Expect: `prisma db push … 🚀 in sync` (additive changes + `marketplace` drop applied), then pm2 starts **backend, frontend, orchestrator**, then the orchestrator connects to `temporal:7233`.
   > **Active monitoring:** tail logs and watch container health transitions (migrate → pm2 up → orchestrator connected → healthy) and surface each as it happens, rather than waiting blind.

### Phase 4 — Verification
```bash
PG=postgres-l4le990xi7me2e4pma11lzma; APP=postiz-l4le990xi7me2e4pma11lzma
docker exec "$APP" sh -c 'echo $NEXT_PUBLIC_VERSION; cat /app/version.txt'                    # fork version
docker exec "$APP" pm2 list                                                                    # backend+frontend+orchestrator online
docker exec "$PG" psql -U postgres -d postiz-db -c '\dt' | grep -Ei 'OAuthApp|Announcement'    # new tables
docker exec "$PG" psql -U postgres -d postiz-db -c \
 'select (select count(*) from "User") u,(select count(*) from "Organization") o,(select count(*) from "Integration") i,(select count(*) from "Post") p;'  # MATCH counts-before.txt
docker exec "$APP" sh -c 'node -e "require(\"http\").get(\"http://localhost:3002\",r=>console.log(\"orchestrator\",r.statusCode)).on(\"error\",e=>console.log(e.message))"' # orchestrator health port
```
Then in the browser at `https://postiz.reaatech.com`: log in (auth data survived), confirm integrations listed, open a post with prior media (uploads volume intact). **Critically:** schedule a test post ~2–5 min out and confirm it **publishes** (proves Temporal + orchestrator + sweeper end-to-end). Also confirm any *existing* near-term scheduled post fires.

**Done when:** version = fork tag; row counts match pre-upgrade; login + media OK; a freshly scheduled post publishes via Temporal.

---

## 9. Rollback

Image-only rollback is unsafe: old 2.10.1 code would run *its* plain `db push`, try to re-add `marketplace`/drop the new columns, and abort. So roll back the DB too. Temporal data is new and can be discarded.

```bash
TS=<backup timestamp>; BK=/home/rick/postiz-backups/$TS; PG=postgres-l4le990xi7me2e4pma11lzma
docker stop postiz-l4le990xi7me2e4pma11lzma                     # stop app so nothing pushes during restore
docker exec -i "$PG" psql -U postgres -d postgres -c 'DROP DATABASE IF EXISTS "postiz-db";'
docker exec -i "$PG" psql -U postgres -d postgres -c 'CREATE DATABASE "postiz-db";'
docker exec -i "$PG" pg_restore -U postgres -d postiz-db --no-owner < "$BK/postiz-db.dump"
# if uploads changed: docker run --rm -v l4le990xi7me2e4pma11lzma_postiz-uploads:/data -v "$BK":/b alpine sh -c 'rm -rf /data/* && tar xzf /b/uploads.tar.gz -C /data'
# In Coolify: set image back to ghcr.io/gitroomhq/postiz-app:v2.10.1 and redeploy. Temporal services can be removed.
```
Because Phase 0/Phase 3 captured a consistent dump *before* the schema moved, this returns to the exact pre-upgrade state.

---

## 10. Future workflow — "pull and run migrations from inside the container"

### 10a. Normal path (automatic)
The container runs `prisma db push --accept-data-loss` on every start, so schema changes self-apply: **edit `schema.prisma` → commit → tag → CI builds `ghcr.io/reaatech/postiz-app:vX.Y.Z` → bump the tag in Coolify → redeploy.** On boot the schema syncs. (Because the fork's push already accepts data loss, even destructive edits apply — so **always back up first**, and review your diff: `db push` has no history and will silently rewrite schema.)

### 10b. Manual lever — run a sync inside the live container (add to the repo as `scripts/postiz-migrate.sh`)
```bash
#!/usr/bin/env bash
# Run a Prisma schema sync inside the live Postiz container.
#   ./scripts/postiz-migrate.sh            # safe additive sync (refuses data loss)
#   ./scripts/postiz-migrate.sh --accept-data-loss   # allow drops/retypes (DESTRUCTIVE — back up first)
set -euo pipefail
CONTAINER="${POSTIZ_CONTAINER:-postiz-l4le990xi7me2e4pma11lzma}"
SCHEMA="./libraries/nestjs-libraries/src/database/prisma/schema.prisma"
echo ">> prisma db push in $CONTAINER $*"
docker exec -w /app "$CONTAINER" pnpm dlx prisma@6.5.0 db push --schema "$SCHEMA" "$@"
```
Notes: this pushes whatever `schema.prisma` is **baked into the running image**; to test a *new* schema without rebuilding, `docker cp` it in first — but the clean path for anything permanent is rebuild → redeploy (10a) so schema and the code using it ship together. Equivalent one-liner: `docker exec -w /app postiz-l4le990xi7me2e4pma11lzma pnpm run prisma-db-push`.

> **Temporal-aware caution for future changes:** background behavior now lives in `apps/orchestrator` (Temporal workflows). Changing workflow code can require care with running workflows (versioning/`patched`); a schema-only change is unaffected, but don't assume worker changes are as forgiving as the old BullMQ jobs.

### 10c. Optional hardening — adopt versioned migrations
`db push` is convenient but historyless and (here) data-loss-accepting. To move the fork to reviewed, ordered migrations:
1. Baseline the existing DB (no `_prisma_migrations` yet): `prisma migrate diff --from-empty --to-schema-datamodel <schema> --script > prisma/migrations/0_init/migration.sql` then `prisma migrate resolve --applied 0_init`.
2. Going forward use `prisma migrate dev` locally / `prisma migrate deploy` in-container, and switch `pm2-run` from `prisma-db-push` to `prisma migrate deploy`.
Optional; the upgrade above doesn't need it.

---

## 11. Execution checklist
- [ ] **Phase 0** — Backup taken, `dump OK`, `counts-before.txt` saved. *(Gate)*
- [ ] **Phase 1** — CI repointed to `reaatech` + `packages: write`; tag pushed; multi-arch (or amd64) image verified, contains `apps/orchestrator`; package pullable; **§0.5 migration rehearsal re-run against the fork image — row counts unchanged**. *(Gate)*
- [ ] **Phase 2** — Visibility backend chosen (ES vs Postgres); Temporal stack added with `mem_limit`s and **no host `ports:`** (8080 in use); inline dynamicconfig + `RUN_CRON=true`/`TEMPORAL_ADDRESS=temporal:7233` env added; `temporal operator cluster health` = SERVING; host RAM still has headroom (`free -h`). *(Gate)*
- [ ] **Phase 3** — Fresh backup; image swapped; startup log shows `db push` in sync + pm2 (backend/frontend/orchestrator) up + orchestrator→temporal connected.
- [ ] **Phase 4** — Version = fork tag; row counts match; login + media OK; a newly scheduled post **publishes**; existing schedule fires.
- [ ] **Post** — `scripts/postiz-migrate.sh` committed; RAM headroom checked.

---

## Appendix A — Reference values (this host)
| Key | Value |
|---|---|
| Coolify Service UUID | `l4le990xi7me2e4pma11lzma` (project `reaa-office`) |
| App / DB / Cache containers | `postiz-…`, `postgres-…` (postgres:14.5, db `postiz-db`, user `postgres`), `redis-…` (redis:7.2) |
| Existing volumes | `…_postiz-postgresql-data`, `…_postiz-uploads`, `…_postiz-config`, `…_postiz-redis-data` |
| New (Temporal) volumes | `temporal-postgres-data`, `temporal-elasticsearch-data` (ES is the recommended default) |
| Service compose (root-owned) | `/data/coolify/services/l4le990xi7me2e4pma11lzma/docker-compose.yml` (edit via UI) |
| Prisma | `6.5.0` via `pnpm dlx`; schema `libraries/nestjs-libraries/src/database/prisma/schema.prisma` |
| Public URL | `https://postiz.reaatech.com` (nginx port 5000) |
| Image change | `ghcr.io/gitroomhq/postiz-app:v2.10.1` → `ghcr.io/reaatech/postiz-app:v2.21.8` |
| New env on Postiz | `TEMPORAL_ADDRESS=temporal:7233`, `TEMPORAL_NAMESPACE=default`, `RUN_CRON=true` |
| Temporal images | server `temporalio/auto-setup:1.28.1`, db `postgres:16`, es `elasticsearch:7.17.27`, ui `temporalio/ui:2.34.0` |

> **Secrets** (`SERVICE_PASSWORD_POSTGRESQL`, `JWT_SECRET`, X keys, `REDIS_PASSWORD`, …) live on the Coolify Service; read at runtime, **never commit**. Preserved automatically across the image swap.

## Appendix B — Why the version jump is a non-issue (schema), but the runtime jump is not
The *schema* is reconciled declaratively by `db push`, so 2.10.1→2.21.8 is one diff, applied once — overwhelmingly additive plus one obsolete-column drop. The *runtime*, however, changed substantially: **background processing moved from BullMQ/Redis to Temporal at v2.12.0+**, which is why this upgrade adds an entire Temporal cluster and `RUN_CRON`/`TEMPORAL_ADDRESS`, not just a new image tag.

## Appendix C — Sources & verification trail
- Migration mechanism & `--accept-data-loss`: fork `package.json` (`pm2-run`, `prisma-db-push`); live container `package.json` (plain `db push`). Behavior **empirically tested** on a throwaway DB on this host (plain → abort; `--accept-data-loss` → drop applied, rows preserved).
- Schema delta: live container `schema.prisma` vs fork `schema.prisma` (full diff + model set-difference).
- Temporal requirement: fork `apps/orchestrator/*`, `libraries/nestjs-libraries/src/temporal/*`, `health.controller.ts` (`TEMPORAL_ADDRESS`), `infinite.workflow.register.ts` (`RUN_CRON`), `posts.repository.ts` (`searchForMissingThreeHoursPosts` 2-day window).
- Temporal topology/images/env: fork root `docker-compose.yaml` + canonical `gitroomhq/postiz-docker-compose` (`docker-compose.yaml`, `main`) — `RUN_CRON: 'true'`, `ENABLE_ES=true`, `auto-setup:1.28.1`, healthchecks, `depends_on` conditions.
- Build pipeline: fork `Dockerfile.dev` (single-stage), `.github/workflows/build-containers.yml`.
- **Migration rehearsal (§0.5): EXECUTED** — `pg_dump` of live `postiz-db` → restore into isolated `postgres:14.5` → real `ghcr.io/gitroomhq/postiz-app:v2.21.8` `prisma db push --accept-data-loss` against the clone. Result: User/Org/Integration/Post counts 1/1/1/10 unchanged before→after; `marketplace` dropped; 3 new tables + new columns added; "in sync" in 267 ms. Throwaway containers/image removed; production read-only throughout (verified still healthy).
- **Boot rehearsal (§0.6): EXECUTED** — full stack (v2.21.8 app + Temporal auto-setup 1.28.1 + Temporal-Postgres + Elasticsearch 7.17 + Redis) against a restored real-data clone, all `--memory`-capped. Result: backend served HTTP 200 in ~16 s with "no issues" + zero errors; orchestrator connected to Temporal and built workflow bundles; app registered `organizationId`/`postId` Text search attributes into Temporal (ES path proven end-to-end); frontend served (307); no crash-restarts; host stayed >8.5 GiB available; prod healthy after teardown.

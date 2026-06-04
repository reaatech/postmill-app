# Coolify paste-ready: Temporal stack + Postiz env (Phase 2/3)

This is the exact block to add to the **Postiz Coolify Service** compose (Service UUID
`l4le990xi7me2e4pma11lzma`, project `reaa-office`) via the Coolify dashboard.
**Validated on this host (2026-06-04):** the three services below were brought up with
`docker compose` in isolation and reached `temporal → SERVING` with all three healthy,
ES visibility backend responding. No host ports, mem-capped, prod untouched.

> Decisions baked in (from POSTIZ_FORK_UPGRADE.md §5):
> - **Elasticsearch kept** (recommended/tested default; host has ~10 GiB available, 91 GB free disk).
> - **No host `ports:`** — `expose:` only (host 8080 is already in use; Postiz reaches Temporal as `temporal:7233` over the shared Coolify network).
> - **`mem_limit`s** as OOM protection (ES 1g / temporal 512m / temporal-pg 384m).
> - **No custom dynamicconfig** — auto-setup uses its built-in default (no functional loss for Postiz; avoids Coolify file-mount friction).
> - Temporal datastores are **brand new and empty** → zero risk to existing Postiz data.

---

## 1. Services to ADD (paste under `services:` alongside postiz / postgres / redis)

```yaml
  temporal-postgresql:
    image: postgres:16
    environment:
      POSTGRES_USER: temporal
      POSTGRES_PASSWORD: temporal
    expose:
      - "5432"
    volumes:
      - temporal-postgres-data:/var/lib/postgresql/data
    mem_limit: 384m
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U temporal"]
      interval: 5s
      timeout: 5s
      retries: 24

  temporal-elasticsearch:
    image: elasticsearch:7.17.27
    environment:
      discovery.type: single-node
      ES_JAVA_OPTS: "-Xms256m -Xmx256m"
      xpack.security.enabled: "false"
    expose:
      - "9200"
    volumes:
      - temporal-elasticsearch-data:/usr/share/elasticsearch/data
    mem_limit: 1g
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 24

  temporal:
    image: temporalio/auto-setup:1.28.1
    depends_on:
      temporal-postgresql:
        condition: service_healthy
      temporal-elasticsearch:
        condition: service_healthy
    environment:
      DB: postgres12
      DB_PORT: 5432
      POSTGRES_USER: temporal
      POSTGRES_PWD: temporal
      POSTGRES_SEEDS: temporal-postgresql
      ENABLE_ES: "true"
      ES_SEEDS: temporal-elasticsearch
      ES_VERSION: v7
    expose:
      - "7233"
    mem_limit: 512m
    healthcheck:
      test: ["CMD-SHELL", "temporal operator cluster health --address temporal:7233 2>/dev/null | grep -q SERVING || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 24
      start_period: 30s
```

## 2. Named volumes to ADD (under the top-level `volumes:` key)

```yaml
  temporal-postgres-data:
  temporal-elasticsearch-data:
```

## 3. Env to ADD on the existing `postiz` service (do NOT remove anything existing)

```yaml
      TEMPORAL_ADDRESS: temporal:7233
      TEMPORAL_NAMESPACE: default
      RUN_CRON: "true"
```

Also add to the `postiz` service so it waits for Temporal:

```yaml
    depends_on:
      temporal:
        condition: service_healthy
```

> If Coolify's template already defines `depends_on` for postiz (postgres/redis), **merge**
> the `temporal` entry into it rather than replacing.

---

## 4. Order of operations (matches POSTIZ_FORK_UPGRADE.md §8)

1. **Phase 2 — bring up Temporal first, still on the OLD image.** Paste §1–§2, add §3 env,
   keep the postiz image at `ghcr.io/gitroomhq/postiz-app:v2.10.1`. Redeploy. The old app
   ignores the unused Temporal env. Verify:
   ```bash
   docker ps | grep temporal
   docker exec $(docker ps -qf name=temporal-1) temporal operator cluster health --address temporal:7233   # SERVING
   ```
2. **Phase 3 — swap the image** `ghcr.io/gitroomhq/postiz-app:v2.10.1` →
   `ghcr.io/reaatech/postiz-app:v2.21.8` (enable force-pull). Redeploy. Watch:
   ```bash
   docker logs -f postiz-l4le990xi7me2e4pma11lzma   # expect: prisma db push ... in sync; pm2 backend/frontend/orchestrator; orchestrator -> temporal
   ```
3. **Verify Coolify persisted the edit:** after the first redeploy, re-check `docker ps | grep temporal`
   and the postiz env still contains `RUN_CRON`/`TEMPORAL_ADDRESS`. If Coolify reverted the
   template, fall back to a separate Coolify resource on the same network (§8 Phase 2 caveat).

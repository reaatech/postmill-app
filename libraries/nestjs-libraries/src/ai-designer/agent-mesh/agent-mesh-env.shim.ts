/**
 * `@reaatech/agent-mesh` runs a strict `loadEnv()` (zod parse of ALL of
 * `process.env`, `process.exit(1)` on failure) at module top level. This shim
 * bounds that parse in a zero-exposure window:
 *
 *   1. `agent-mesh-env.stash.ts` seeds the placeholders the schema requires
 *      (`GOOGLE_CLOUD_PROJECT` / `API_KEY`), forces the package's global
 *      circuit breaker off (`ENABLE_CIRCUIT_BREAKER=''`), and stashes any
 *      conflicting generic values (`NODE_ENV=staging`, `LOG_LEVEL=verbose`,
 *      a malformed `PORT`/`OTEL_EXPORTER_OTLP_ENDPOINT`).
 *   2. `import '@reaatech/agent-mesh'` triggers the strict parse — verified
 *      against the package dist: both `dist/index.cjs` and `dist/index.js`
 *      evaluate `var env = loadEnv()` at import time, so by the next
 *      statement the parse has run and its result is cached.
 *   3. The loop below restores the stashed values synchronously, before this
 *      module finishes evaluating — so no OTHER module (in this tick or any
 *      later one) can ever observe the deleted vars. (The previous
 *      `setImmediate` restore left every module imported later in the same
 *      tick reading `NODE_ENV`/`LOG_LEVEL` as undefined at module scope.)
 *
 * This module MUST be the first import in every file that imports an
 * `@reaatech/agent-mesh*` package; both TypeScript's CommonJS output and ESM
 * preserve the import order, so the stash lands before the package's env
 * parse and the restore lands right after it.
 */
import { stashedEnv } from './agent-mesh-env.stash';
import '@reaatech/agent-mesh';

for (const [key, value] of stashedEnv) {
  process.env[key] = value;
}
stashedEnv.length = 0;

export {};

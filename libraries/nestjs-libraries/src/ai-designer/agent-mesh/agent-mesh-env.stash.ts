/**
 * Pre-parse half of the agent-mesh env shim — see `agent-mesh-env.shim.ts`
 * for the full story. This module must evaluate BEFORE `@reaatech/agent-mesh`
 * (the shim imports them in that order): it seeds the placeholders the
 * package's strict schema requires and stashes any conflicting values so the
 * import-time `loadEnv()` sees a passing environment.
 *
 * `@reaatech/agent-mesh` validates its environment schema at import time and
 * `process.exit(1)`s when `GOOGLE_CLOUD_PROJECT` / `API_KEY` are unset. Those
 * vars only feed the package's own Vertex/Gemini classifier and standalone
 * HTTP gateway — neither of which Postmill uses (the in-process transport
 * replaces them) — so seed harmless placeholders before the first agent-mesh
 * import. Real values, when present, are never overwritten.
 */
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  process.env.GOOGLE_CLOUD_PROJECT = 'agent-mesh-unused';
}
if (!process.env.API_KEY) {
  process.env.API_KEY = 'agent-mesh-unused';
}

/**
 * Force the package's built-in circuit breaker OFF. `dispatchToAgent` gates
 * every call on a module-level breaker keyed by agent id only — five failures
 * from ONE org (e.g. a revoked AI key) would open the breaker for EVERY org,
 * defeating the conductor's per-org breaker. The flag is `z.coerce.boolean()`,
 * so any non-empty string (including "false") coerces to true — the empty
 * string is the only value that disables it, which is why this is forced
 * rather than defaulted. (The parsed value is captured by `loadEnv()` at
 * import, so this assignment is intentionally never restored.)
 */
process.env.ENABLE_CIRCUIT_BREAKER = '';

/**
 * Stash unrelated env values the package's strict schema would reject.
 * `loadEnv()` parses ALL of `process.env` at import time and `process.exit(1)`s
 * on any failure, so a generic var set for other tooling (`LOG_LEVEL=verbose`,
 * `NODE_ENV=staging`, a malformed `OTEL_EXPORTER_OTLP_ENDPOINT`) would
 * crash-loop the backend at boot. The shim restores these synchronously right
 * after the `@reaatech/agent-mesh` import — no other module ever evaluates
 * inside the gap.
 */
export const stashedEnv: Array<[string, string]> = [];
const neutralize = (key: string, ok: (value: string) => boolean) => {
  const value = process.env[key];
  if (value !== undefined && !ok(value)) {
    stashedEnv.push([key, value]);
    delete process.env[key];
  }
};
neutralize('NODE_ENV', (v) =>
  ['development', 'production', 'test'].includes(v)
);
neutralize('LOG_LEVEL', (v) => ['debug', 'info', 'warn', 'error'].includes(v));
neutralize('PORT', (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 65535;
});
neutralize('OTEL_EXPORTER_OTLP_ENDPOINT', (v) => {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
});

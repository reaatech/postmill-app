import 'reflect-metadata';
import { vi } from 'vitest';

// Set encryption key for tests
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

// Provider/HTTP code now calls undici's own `fetch` (not the global one) so the SSRF
// `Agent` dispatcher works — Node 22's built-in fetch is undici v6 and rejects the npm
// undici v8 Agent with `invalid onRequestStart method`. Tests stub `globalThis.fetch`;
// route undici.fetch back to it so those stubs keep intercepting.
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    fetch: (...args: any[]) => (globalThis.fetch as any)(...args),
  };
});

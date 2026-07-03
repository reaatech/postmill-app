import { describe, it, expect, vi, afterEach } from 'vitest';
import { AiDesignerGateway } from './ai-designer.gateway';

// Unit-tests the in-process rate-limit/sweep helpers only — no socket stack.
// The gateway's DI dependencies are untouched by these paths, so nulls are fine.
const makeGateway = () =>
  new AiDesignerGateway(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any
  );

const fakeClient = (address: string, headers: Record<string, string> = {}) =>
  ({ handshake: { address, headers } } as any);

afterEach(() => {
  vi.useRealTimers();
});

describe('AiDesignerGateway rate limiting', () => {
  it('caps per-user events at the configured limit and resets after the window', () => {
    vi.useFakeTimers();
    const gw = makeGateway() as any;

    for (let i = 0; i < 5; i++) {
      expect(gw._rateLimit('user-1', 'start')).toBe(true);
    }
    expect(gw._rateLimit('user-1', 'start')).toBe(false);

    // Another user is unaffected; unknown events are unlimited.
    expect(gw._rateLimit('user-2', 'start')).toBe(true);
    expect(gw._rateLimit('user-1', 'unknown-event')).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(gw._rateLimit('user-1', 'start')).toBe(true);
  });

  it('keys the connect budget on the transport address, ignoring X-Forwarded-For', () => {
    const gw = makeGateway() as any;

    // 30 attempts allowed, the 31st rejected — spoofed XFF must not mint a
    // fresh bucket per attempt.
    for (let i = 0; i < 30; i++) {
      expect(
        gw._connectRateLimit(
          fakeClient('10.0.0.9', { 'x-forwarded-for': `spoof-${i}` })
        )
      ).toBe(true);
    }
    expect(
      gw._connectRateLimit(
        fakeClient('10.0.0.9', { 'x-forwarded-for': 'spoof-final' })
      )
    ).toBe(false);

    // A genuinely different transport address gets its own bucket.
    expect(gw._connectRateLimit(fakeClient('10.0.0.10'))).toBe(true);
  });

  it('sweeps expired buckets on the connect path once the map grows large', () => {
    vi.useFakeTimers();
    const gw = makeGateway() as any;

    // Seed past the sweep threshold with already-expiring buckets.
    for (let i = 0; i < 10_001; i++) {
      gw._rateBuckets.set(`ip:seed-${i}:connect`, {
        count: 1,
        resetAt: Date.now() + 60_000,
      });
    }
    vi.advanceTimersByTime(60_001);

    gw._connectRateLimit(fakeClient('10.0.0.9'));
    // All seeded (now expired) buckets were swept; only the fresh one remains.
    expect(gw._rateBuckets.size).toBe(1);
    expect(gw._rateBuckets.has('ip:10.0.0.9:connect')).toBe(true);
  });
});

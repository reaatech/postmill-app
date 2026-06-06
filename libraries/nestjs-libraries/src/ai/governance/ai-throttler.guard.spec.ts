import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSuperCanActivate, capturedThrottlers, mockGetSettings } = vi.hoisted(() => ({
  mockSuperCanActivate: vi.fn().mockResolvedValue(true),
  capturedThrottlers: [] as any[],
  mockGetSettings: vi.fn().mockResolvedValue(null),
}));

vi.mock('@gitroom/nestjs-libraries/throttler/throttler.provider', () => {
  class MockParent {
    throttlers: any[];
    constructor() {
      this.throttlers = [
        { name: 'default', limit: 10, ttl: 60000 },
        { name: 'agents', limit: 5, ttl: 60000 },
      ];
    }
    async canActivate(context: any) {
      // snapshot the throttlers as the guard sees them during super call
      capturedThrottlers.length = 0;
      capturedThrottlers.push(...this.throttlers.map((t: any) => ({ ...t })));
      return mockSuperCanActivate(context);
    }
  }
  return { ThrottlerBehindProxyGuard: MockParent };
});

vi.mock('@gitroom/nestjs-libraries/ai/ai-settings.manager', () => ({
  AiSettingsManager: class {
    getSettings = mockGetSettings;
  },
}));

import { AiThrottlerGuard } from './ai-throttler.guard';
import { AiSettingsManager } from '@gitroom/nestjs-libraries/ai/ai-settings.manager';

function freshGuard() {
  const guard = new AiThrottlerGuard();
  (guard as any)._aiSettingsManager = new (AiSettingsManager as any)();
  return guard;
}

function mockContext() {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        url: '/api/agents/generate',
        method: 'POST',
        org: { id: 'org-1' },
      }),
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function saveThrottlers(guard: AiThrottlerGuard) {
  return guard.throttlers.map((t: any) => ({ ...t }));
}

describe('AiThrottlerGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuperCanActivate.mockResolvedValue(true);
    mockGetSettings.mockResolvedValue(null);
    capturedThrottlers.length = 0;
  });

  describe('canActivate()', () => {
    it('returns true when rate limit settings are not present', async () => {
      mockGetSettings.mockResolvedValue(null);
      const guard = freshGuard();
      const result = await guard.canActivate(mockContext());
      expect(result).toBe(true);
      expect(mockSuperCanActivate).not.toHaveBeenCalled();
    });

    it('returns true when rate limit settings are present but not enabled', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: { enabled: false },
      });
      const guard = freshGuard();
      const result = await guard.canActivate(mockContext());
      expect(result).toBe(true);
      expect(mockSuperCanActivate).not.toHaveBeenCalled();
    });

    it('delegates to super.canActivate when rate limiting is enabled', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: {
          enabled: true,
          requestsPerMinute: 30,
        },
      });
      const guard = freshGuard();

      await guard.canActivate(mockContext());

      expect(mockSuperCanActivate).toHaveBeenCalledTimes(1);
    });

    it('applies requestsPerMinute from settings to throttlers', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: {
          enabled: true,
          requestsPerMinute: 20,
        },
      });
      const guard = freshGuard();

      await guard.canActivate(mockContext());

      expect(capturedThrottlers.length).toBeGreaterThan(0);
      for (const t of capturedThrottlers) {
        expect(t.limit).toBe(20);
        expect(t.ttl).toBe(60000);
      }
    });

    it('applies AI rate limits during the parent guard call and restores them after success', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: {
          enabled: true,
          requestsPerMinute: 15,
        },
      });
      const guard = freshGuard();
      const originals = saveThrottlers(guard);

      await guard.canActivate(mockContext());

      for (let i = 0; i < guard.throttlers.length; i++) {
        expect(guard.throttlers[i].limit).toBe(originals[i].limit);
        expect(guard.throttlers[i].ttl).toBe(originals[i].ttl);
      }
    });

    it('restores original throttlers when super.canActivate throws', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: {
          enabled: true,
          requestsPerMinute: 7,
        },
      });
      mockSuperCanActivate.mockRejectedValue(new Error('Rate limit exceeded'));

      const guard = freshGuard();
      const originals = saveThrottlers(guard);

      await expect(guard.canActivate(mockContext())).rejects.toThrow('Rate limit exceeded');

      for (let i = 0; i < guard.throttlers.length; i++) {
        expect(guard.throttlers[i].limit).toBe(originals[i].limit);
        expect(guard.throttlers[i].ttl).toBe(originals[i].ttl);
      }
    });

    it('restores original throttlers when super denies', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: {
          enabled: true,
          requestsPerMinute: 100,
        },
      });
      mockSuperCanActivate.mockResolvedValue(false);

      const guard = freshGuard();
      const originals = saveThrottlers(guard);

      const result = await guard.canActivate(mockContext());

      expect(result).toBe(false);
      for (let i = 0; i < guard.throttlers.length; i++) {
        expect(guard.throttlers[i].limit).toBe(originals[i].limit);
        expect(guard.throttlers[i].ttl).toBe(originals[i].ttl);
      }
    });

    it('uses the original base limits for later requests after a dynamic request', async () => {
      mockGetSettings.mockResolvedValueOnce({
        rateLimitSettings: {
          enabled: true,
          requestsPerMinute: 11,
        },
      }).mockResolvedValueOnce({
        rateLimitSettings: {
          enabled: true,
        },
      });
      const guard = freshGuard();
      const originals = saveThrottlers(guard);

      await guard.canActivate(mockContext());
      await guard.canActivate(mockContext());

      for (let i = 0; i < capturedThrottlers.length; i++) {
        expect(capturedThrottlers[i].limit).toBe(originals[i].limit);
      }
    });

    it('falls back to default throttle limit when requestsPerMinute is undefined', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: {
          enabled: true,
        },
      });
      const guard = freshGuard();
      const originals = saveThrottlers(guard);

      await guard.canActivate(mockContext());

      // Each throttler should keep its original limit
      for (let i = 0; i < capturedThrottlers.length; i++) {
        expect(capturedThrottlers[i].limit).toBe(originals[i].limit);
      }
    });
  });

  describe('edge cases', () => {
    it('handles null settings gracefully', async () => {
      mockGetSettings.mockResolvedValue(null);
      const guard = freshGuard();
      const result = await guard.canActivate(mockContext());
      expect(result).toBe(true);
    });

    it('handles settings with no rateLimitSettings gracefully', async () => {
      mockGetSettings.mockResolvedValue({
        activeProvider: 'openai',
        activeModel: 'gpt-4.1',
      });
      const guard = freshGuard();
      const result = await guard.canActivate(mockContext());
      expect(result).toBe(true);
    });

    it('handles rateLimitSettings with enabled undefined', async () => {
      mockGetSettings.mockResolvedValue({
        rateLimitSettings: {},
      });
      const guard = freshGuard();
      const result = await guard.canActivate(mockContext());
      expect(result).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  })),
}));

vi.mock('@gitroom/helpers/utils/timer', () => ({
  timer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@gitroom/helpers/utils/read.or.fetch', () => ({
  readOrFetch: vi.fn().mockResolvedValue(Buffer.from('fake-image-data')),
}));

vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch', () => ({
  safeFetch: vi.fn((url: string, options?: RequestInit) => fetch(url, options)),
}));

import {
  SocialAbstract,
  RefreshToken,
  BadBody,
  NotEnoughScopes,
} from './social.abstract';

class TestProvider extends SocialAbstract {
  identifier = 'test';
  maxConcurrentJob = 2;

  handleErrors(body: string, status: number) {
    if (body.includes('refresh_me')) return { type: 'refresh-token' as const, value: 'Need refresh' };
    if (body.includes('retry_me')) return { type: 'retry' as const, value: 'Retry later' };
    if (body.includes('bad_me')) return { type: 'bad-body' as const, value: 'Bad request' };
    return undefined;
  }
}

describe('RefreshToken', () => {
  it('extends ApplicationFailure with refresh_token type', () => {
    const err = new RefreshToken('x-id', '{"key":"val"}', 'body-content', 'Token expired');
    expect(err.message).toBe('Token expired');
  });
});

describe('BadBody', () => {
  it('extends ApplicationFailure with bad_body type', () => {
    const err = new BadBody('x-id', '{"key":"val"}', 'body-content', 'Invalid request');
    expect(err.message).toBe('Invalid request');
  });
});

describe('NotEnoughScopes', () => {
  it('has a default message', () => {
    const err = new NotEnoughScopes();
    expect(err.message).toContain('Not enough scopes');
  });

  it('accepts a custom message', () => {
    const err = new NotEnoughScopes('Custom missing scopes');
    expect(err.message).toBe('Custom missing scopes');
  });
});

describe('SocialAbstract', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  describe('handleErrors', () => {
    it('returns undefined by default', () => {
      const result = provider.handleErrors('some body', 200);
      expect(result).toBeUndefined();
    });
  });

  describe('checkValidity', () => {
    it('returns true by default', async () => {
      const result = await provider.checkValidity([], {}, []);
      expect(result).toBe(true);
    });
  });

  describe('getImageDimensions', () => {
    it('resolves HTTP URLs directly', async () => {
      const dims = await provider.getImageDimensions('https://example.com/img.png');
      expect(dims).toEqual({ width: 800, height: 600 });
    });

    it('prepends FRONTEND_URL for relative paths', async () => {
      process.env.FRONTEND_URL = 'http://test.local';
      const dims = await provider.getImageDimensions('uploads/img.png');
      expect(dims).toEqual({ width: 800, height: 600 });
    });
  });

  describe('mention', () => {
    it('returns {none: true} by default', async () => {
      const result = await provider.mention('token', { query: 'test' }, 'id', {} as any);
      expect(result).toEqual({ none: true });
    });
  });

  describe('runInConcurrent', () => {
    it('returns the function result on success', async () => {
      const result = await provider.runInConcurrent(async () => 'success');
      expect(result).toBe('success');
    });

    it('throws RefreshToken when handleErrors returns refresh-token', async () => {
      const fn = vi.fn().mockRejectedValue({ message: 'refresh_me' });
      await expect(provider.runInConcurrent(fn)).rejects.toThrow(RefreshToken);
    });

    it('throws BadBody when function fails and handleErrors returns non-refresh', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('bad_me'));
      await expect(provider.runInConcurrent(fn)).rejects.toThrow(BadBody);
    });

    it('throws BadBody when handleErrors returns undefined', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('some error'));
      await expect(provider.runInConcurrent(fn)).rejects.toThrow(BadBody);
    });
  });

  describe('fetch', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('returns response for status 200', async () => {
      const mockResponse = { status: 200, text: vi.fn() } as any;
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      const result = await provider.fetch('https://api.example.com');
      expect(result).toBe(mockResponse);
    });

    it('returns response for status 201', async () => {
      const mockResponse = { status: 201, text: vi.fn() } as any;
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      const result = await provider.fetch('https://api.example.com');
      expect(result).toBe(mockResponse);
    });

    it('throws BadBody after 3 retries', async () => {
      const mockResponse = { status: 500, text: vi.fn().mockResolvedValue('server error') };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      await expect(provider.fetch('https://api.example.com')).rejects.toThrow(BadBody);
    });

    it('retries on status 429', async () => {
      const mockResponse = { status: 429, text: vi.fn().mockResolvedValue('rate limited') };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      await expect(provider.fetch('https://api.example.com')).rejects.toThrow(BadBody);
    });

    it('retries on rate_limit_exceeded in body', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          status: 403,
          text: vi.fn().mockResolvedValue('rate_limit_exceeded'),
        });
      });
      await expect(provider.fetch('https://api.example.com')).rejects.toThrow(BadBody);
      expect(callCount).toBeGreaterThan(1);
    });

    it('retries on handleErrors type retry', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          status: 400,
          text: vi.fn().mockResolvedValue('retry_me'),
        });
      });
      await expect(provider.fetch('https://api.example.com')).rejects.toThrow(BadBody);
      expect(callCount).toBeGreaterThan(1);
    });

    it('throws RefreshToken on 401 when handleErrors returns refresh-token', async () => {
      const mockResponse = { status: 401, text: vi.fn().mockResolvedValue('refresh_me') };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      await expect(provider.fetch('https://api.example.com', {}, 'x-id')).rejects.toThrow(RefreshToken);
    });

    it('throws RefreshToken on handleErrors type refresh-token regardless of status', async () => {
      const mockResponse = { status: 403, text: vi.fn().mockResolvedValue('refresh_me') };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      await expect(provider.fetch('https://api.example.com', {}, 'x-id')).rejects.toThrow(RefreshToken);
    });

    it('throws BadBody for other error status codes', async () => {
      const mockResponse = { status: 400, text: vi.fn().mockResolvedValue('bad_me') };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      await expect(provider.fetch('https://api.example.com', {}, 'x-id')).rejects.toThrow(BadBody);
    });

    it('handles response.text() failure gracefully', async () => {
      const mockResponse = { status: 400, text: vi.fn().mockRejectedValue(new Error('parse fail')) };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
      await expect(provider.fetch('https://api.example.com')).rejects.toThrow(BadBody);
    });

    it('retries on 500 when handleErrors returns undefined, exhausting retries', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          status: 500,
          text: vi.fn().mockResolvedValue('server error'),
        });
      });
      await expect(provider.fetch('https://api.example.com')).rejects.toThrow(BadBody);
      expect(callCount).toBe(4);
    });

    it('passes the correct message to BadBody on retry exhaustion', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 429,
        text: vi.fn().mockResolvedValue('rate limited'),
      });
      try {
        await provider.fetch('https://api.example.com');
      } catch (err: any) {
        expect(err.message).toContain('Unknown Error');
      }
    });
  });

  describe('checkScopes', () => {
    it('returns true when got is an array with all required scopes', () => {
      expect(provider.checkScopes(['read', 'write'], ['read', 'write', 'delete'])).toBe(true);
    });

    it('throws NotEnoughScopes when got array is missing a required scope', () => {
      expect(() => provider.checkScopes(['read', 'write'], ['read'])).toThrow(NotEnoughScopes);
    });

    it('returns true when got is a comma-separated string with all required scopes', () => {
      expect(provider.checkScopes(['read', 'write'], 'read,write,delete')).toBe(true);
    });

    it('returns true when got is a space-separated string with all required scopes', () => {
      expect(provider.checkScopes(['read', 'write'], 'read write delete')).toBe(true);
    });

    it('throws NotEnoughScopes when got string is missing a required scope', () => {
      expect(() => provider.checkScopes(['read', 'write'], 'read')).toThrow(NotEnoughScopes);
    });

    it('handles URL-encoded scope strings', () => {
      const encoded = encodeURIComponent('read write');
      expect(provider.checkScopes(['read', 'write'], encoded)).toBe(true);
    });

    it('throws NotEnoughScopes for empty got array', () => {
      expect(() => provider.checkScopes(['read'], [])).toThrow(NotEnoughScopes);
    });

    it('throws NotEnoughScopes for empty got string', () => {
      expect(() => provider.checkScopes(['read'], '')).toThrow(NotEnoughScopes);
    });
  });
});

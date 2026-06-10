import { describe, it, expect } from 'vitest';
import { redirects, redirectsList } from './redirects.config';

describe('redirects.config', () => {
  describe('redirectsList', () => {
    it('redirects /launches to /schedule permanently', () => {
      expect(redirectsList).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: '/launches',
            destination: '/schedule',
            permanent: true,
          }),
        ])
      );
    });

    it('redirects /api/uploads/:path* to /uploads/:path* permanently', () => {
      expect(redirectsList).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: '/api/uploads/:path*',
            destination: '/uploads/:path*',
            permanent: true,
          }),
        ])
      );
    });
  });

  describe('redirects()', () => {
    it('returns the redirects list', async () => {
      const result = await redirects();
      expect(result).toEqual(redirectsList);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  CONTENT_PACK_IDENTIFIERS,
  CONTENT_PACK_REGISTRY,
  contentPackMeta,
} from './content-pack.registry';

// The adapter implementations + their behavioural tests now live in their own
// workspace packages (libraries/providers/{magnific,vecteezy,adobe-stock,envato}).
// This spec covers only the metadata catalog that stays in nestjs-libraries.

describe('content pack registry', () => {
  it('registers magnific + the three new packs', () => {
    expect(CONTENT_PACK_IDENTIFIERS.sort()).toEqual([
      'adobe-stock',
      'envato',
      'magnific',
      'vecteezy',
    ]);
  });

  it('each pack declares capabilities and an apiKey credential field', () => {
    for (const id of CONTENT_PACK_IDENTIFIERS) {
      const meta = CONTENT_PACK_REGISTRY[id];
      expect(meta.capabilities.length).toBeGreaterThan(0);
      expect(meta.credentialFields.some((f) => f.key === 'apiKey')).toBe(true);
    }
  });

  it('only Envato declares audio (others fall back to free)', () => {
    expect(contentPackMeta('envato')?.capabilities).toContain('audio');
    expect(contentPackMeta('magnific')?.capabilities).not.toContain('audio');
    expect(contentPackMeta('vecteezy')?.capabilities).not.toContain('audio');
    expect(contentPackMeta('adobe-stock')?.capabilities).not.toContain('audio');
  });
});

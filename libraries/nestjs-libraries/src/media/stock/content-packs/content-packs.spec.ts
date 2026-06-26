import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSafeFetch = vi.fn();
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/safe.fetch', () => ({
  safeFetch: (url: string, init?: RequestInit) => mockSafeFetch(url, init),
}));

import {
  CONTENT_PACK_IDENTIFIERS,
  CONTENT_PACK_REGISTRY,
  createContentPack,
  contentPackMeta,
} from './content-pack.registry';
import { ContentPackDailyCapError } from './content-pack.interface';
import { VecteezyContentPack } from './vecteezy.content-pack';
import { AdobeStockContentPack } from './adobe-stock.content-pack';
import { EnvatoContentPack } from './envato.content-pack';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  mockSafeFetch.mockReset();
});

describe('content pack registry', () => {
  it('registers magnific + the three new packs', () => {
    expect(CONTENT_PACK_IDENTIFIERS.sort()).toEqual([
      'adobe-stock',
      'envato',
      'magnific',
      'vecteezy',
    ]);
  });

  it('createContentPack returns null for an unknown id', () => {
    expect(createContentPack('nope', { apiKey: 'x' })).toBeNull();
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

describe('VecteezyContentPack', () => {
  const pack = new VecteezyContentPack('vz-key');

  it('searches the resources endpoint with a Bearer key and maps results', async () => {
    mockSafeFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 7, title: 'Sunset', preview_url: 'https://v/p.jpg' }], total_count: 1 })
    );
    const res = await pack.search('photos', 'sunset', 1);
    const [url, init] = mockSafeFetch.mock.calls[0];
    expect(url).toContain('https://api.vecteezy.com/v1/resources');
    expect(url).toContain('content_type=photo');
    expect((init.headers as any).Authorization).toBe('Bearer vz-key');
    expect(res.source).toBe('vecteezy');
    expect(res.results[0]).toMatchObject({ id: '7', url: 'https://v/p.jpg', source: 'vecteezy' });
  });

  it('maps a 429 to ContentPackDailyCapError', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({}, 429));
    await expect(pack.search('photos', 'x', 1)).rejects.toBeInstanceOf(ContentPackDailyCapError);
  });
});

describe('AdobeStockContentPack', () => {
  const pack = new AdobeStockContentPack('adobe-key');

  it('sends x-api-key + content_type filter and reads nb_results/files', async () => {
    mockSafeFetch.mockResolvedValueOnce(
      jsonResponse({
        nb_results: 1,
        files: [{ id: 42, title: 'Cat', thumbnail_500_url: 'https://a/c.jpg', comp_url: 'https://a/comp.jpg', creator_name: 'Jo' }],
      })
    );
    const res = await pack.search('photos', 'cat', 1);
    const [url, init] = mockSafeFetch.mock.calls[0];
    expect(url).toContain('stock.adobe.io/Rest/Media/1/Search/Files');
    expect(decodeURIComponent(url)).toContain('content_type:photo');
    expect((init.headers as any)['x-api-key']).toBe('adobe-key');
    expect(res.source).toBe('adobe-stock');
    expect(res.results[0]).toMatchObject({ id: '42', url: 'https://a/c.jpg', author: 'Jo' });
  });

  it('vectors use the illustration content type', async () => {
    mockSafeFetch.mockResolvedValueOnce(jsonResponse({ nb_results: 0, files: [] }));
    await pack.search('vectors', 'logo', 1);
    expect(decodeURIComponent(mockSafeFetch.mock.calls[0][0])).toContain('content_type:illustration');
  });
});

describe('EnvatoContentPack', () => {
  const pack = new EnvatoContentPack('envato-token');

  it('maps each capability to the right marketplace site', async () => {
    mockSafeFetch.mockResolvedValue(jsonResponse({ total_hits: 0, matches: [] }));
    await pack.search('audio', 'beat', 1);
    expect(mockSafeFetch.mock.calls[0][0]).toContain('site=audiojungle.net');
    await pack.search('videos', 'intro', 1);
    expect(mockSafeFetch.mock.calls[1][0]).toContain('site=videohive.net');
  });

  it('sends a Bearer token and maps matches', async () => {
    mockSafeFetch.mockResolvedValueOnce(
      jsonResponse({
        total_hits: 1,
        matches: [{ id: 9, name: 'Logo', previews: { landscape_preview: { landscape_url: 'https://e/l.jpg' } }, author_username: 'amy' }],
      })
    );
    const res = await pack.search('photos', 'logo', 1);
    const [, init] = mockSafeFetch.mock.calls[0];
    expect((init.headers as any).Authorization).toBe('Bearer envato-token');
    expect(res.results[0]).toMatchObject({ id: '9', url: 'https://e/l.jpg', source: 'envato' });
  });
});

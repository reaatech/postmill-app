import { describe, it, expect } from 'vitest';
import { googleaiMediaModule } from './media.adapter';

interface Rec {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

function makeCtx(handler: (url: string, init: any, n: number) => any) {
  const recs: Rec[] = [];
  const fetch = async (input: any, init: any = {}) => {
    recs.push({
      url: String(input),
      method: init.method || 'GET',
      headers: init.headers || {},
      body: init.body,
    });
    return handler(String(input), init, recs.length);
  };
  return {
    recs,
    ctx: {
      credentials: {},
      encryption: { encrypt: (v: string) => v, decrypt: (v: string) => v },
      fetch: fetch as any,
      logger: { log() {}, warn() {}, error() {}, debug() {} },
      telemetry: { recordCall() {} },
    },
  };
}

const json = (body: any, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});
const bytes = (buf: Buffer, ok = true, status = 200) => ({
  ok,
  status,
  arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  headers: { get: () => 'video/mp4' },
});

describe('google-ai media adapter (Gemini Developer API)', () => {
  it('Nano Banana image goes to :generateContent with the x-goog-api-key header and inline parts', async () => {
    const { recs, ctx } = makeCtx(() =>
      json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } },
        ],
      }),
    );
    const adapter: any = googleaiMediaModule.create(ctx as any);

    const out = await adapter.generateImage('a neon city', {
      apiKey: 'AIza-test',
      model: 'gemini-2.5-flash-image',
    });

    const r = recs[0];
    expect(r.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    );
    expect(r.method).toBe('POST');
    expect(r.headers['x-goog-api-key']).toBe('AIza-test');
    const body = JSON.parse(r.body);
    expect(body.contents).toEqual([{ parts: [{ text: 'a neon city' }] }]);
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
    expect(out.image).toBe('data:image/png;base64,QUJD');
  });

  it('Veo video → :predictLongRunning op name; pollJob downloads the auth-only file uri as a data URL', async () => {
    const mp4 = Buffer.from('VEOBYTES');
    const opName = 'models/veo-3.0-generate-001/operations/op-1';
    const { recs, ctx } = makeCtx((url, _i, n) => {
      if (url.endsWith(':predictLongRunning')) return json({ name: opName });
      if (url.includes('/operations/')) {
        return n <= 2
          ? json({ name: opName, done: false })
          : json({
              name: opName,
              done: true,
              response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://gen/file' } }] } },
            });
      }
      return bytes(mp4); // the file uri download
    });
    const adapter: any = googleaiMediaModule.create(ctx as any);

    const sub = await adapter.generateVideo('a waterfall', { apiKey: 'AIza-test', model: 'veo-3.0-generate-001' });
    expect(sub.jobId).toBe(opName);
    expect(recs[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-generate-001:predictLongRunning',
    );

    const pending = await adapter.pollJob(opName, { apiKey: 'AIza-test' });
    expect(pending.status).toBe('pending');

    const done = await adapter.pollJob(opName, { apiKey: 'AIza-test' });
    expect(done.status).toBe('completed');
    expect(done.artifactUrl).toBe(`data:video/mp4;base64,${mp4.toString('base64')}`);
  });

  it('Imagen image routes to :predict and decodes predictions[].bytesBase64Encoded', async () => {
    const { recs, ctx } = makeCtx(() =>
      json({ predictions: [{ bytesBase64Encoded: 'SU1H', mimeType: 'image/png' }] }),
    );
    const adapter: any = googleaiMediaModule.create(ctx as any);
    const out = await adapter.generateImage('a meadow', {
      apiKey: 'AIza-test',
      model: 'imagen-3.0-generate-002',
      input: { aspectRatio: '1:1' },
    });
    expect(recs[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict',
    );
    const body = JSON.parse(recs[0].body);
    expect(body.instances).toEqual([{ prompt: 'a meadow' }]);
    expect(body.parameters.aspectRatio).toBe('1:1');
    expect(out.image).toBe('data:image/png;base64,SU1H');
  });

  it('testConnection lists models; audio/avatar and missing key throw', async () => {
    const { recs, ctx } = makeCtx(() => json({ models: [] }));
    const adapter: any = googleaiMediaModule.create(ctx as any);
    const tc = await adapter.testConnection({ apiKey: 'AIza-test' });
    expect(tc.ok).toBe(true);
    expect(recs[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    await expect(adapter.generateAudio('x', { apiKey: 'AIza-test' })).rejects.toThrow();
    await expect(adapter.generateAvatar('x', { apiKey: 'AIza-test' })).rejects.toThrow();
    await expect(adapter.generateImage('x', {})).rejects.toThrow('Gemini API key');
  });
});

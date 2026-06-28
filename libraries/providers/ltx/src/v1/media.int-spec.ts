import { describe, it, expect } from 'vitest';
import { ltxMediaModule } from './media.adapter';

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

const res = (body: any, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

describe('ltx media adapter (op-routed submit-and-poll, namespaced job id)', () => {
  it('routes to image-to-video when an image_uri is present and namespaces the job id <op>:<id>', async () => {
    const { recs, ctx } = makeCtx(() => res({ id: 'abc' }));
    const adapter: any = ltxMediaModule.create(ctx as any);

    const sub = await adapter.generateVideo('pan across the city', {
      apiKey: 'ltx-key',
      model: 'ltx-2-3-pro',
      input: { image_uri: 'https://files/frame.png', resolution: '1080p' },
    });

    expect(sub.jobId).toBe('image-to-video:abc');
    const r = recs[0];
    expect(r.url).toBe('https://api.ltx.video/v2/image-to-video');
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer ltx-key');
    const body = JSON.parse(r.body);
    expect(body.model).toBe('ltx-2-3-pro');
    expect(body.prompt).toBe('pan across the city');
    expect(body.image_uri).toBe('https://files/frame.png');
    expect(body.resolution).toBe('1080p');
  });

  it('pollJob splits the namespaced id to hit /v2/<op>/<id> and parses result.video_url', async () => {
    const { recs, ctx } = makeCtx((_u, _i, n) =>
      n === 1
        ? res({ status: 'processing' })
        : res({ status: 'completed', result: { video_url: 'https://ltx/out.mp4' } }),
    );
    const adapter: any = ltxMediaModule.create(ctx as any);

    const pending = await adapter.pollJob('image-to-video:abc', { apiKey: 'ltx-key' });
    expect(pending.status).toBe('pending');
    expect(recs[0].url).toBe('https://api.ltx.video/v2/image-to-video/abc');

    const done = await adapter.pollJob('image-to-video:abc', { apiKey: 'ltx-key' });
    expect(done.status).toBe('completed');
    expect(done.artifactUrl).toBe('https://ltx/out.mp4');
  });

  it('routes to audio-to-video and text-to-video by inputs present', async () => {
    const { recs, ctx } = makeCtx(() => res({ id: 'z' }));
    const adapter: any = ltxMediaModule.create(ctx as any);
    await adapter.generateVideo('p', { apiKey: 'k', input: { audio_uri: 'https://f/a.mp3' } });
    expect(recs[0].url).toBe('https://api.ltx.video/v2/audio-to-video');
    await adapter.generateVideo('p', { apiKey: 'k' });
    expect(recs[1].url).toBe('https://api.ltx.video/v2/text-to-video');
  });

  it('testConnection ok; image and unsupported ops throw', async () => {
    const { ctx } = makeCtx(() => res('', true, 404));
    const adapter: any = ltxMediaModule.create(ctx as any);
    const tc = await adapter.testConnection({ apiKey: 'k' });
    expect(tc.ok).toBe(true);
    await expect(adapter.generateImage('x', { apiKey: 'k' })).rejects.toThrow();
    await expect(adapter.generateAudio('x', { apiKey: 'k' })).rejects.toThrow();
    await expect(adapter.generateAvatar('x', { apiKey: 'k' })).rejects.toThrow();
    await expect(adapter.generateVideo('x', {})).rejects.toThrow('API key is required');
  });
});

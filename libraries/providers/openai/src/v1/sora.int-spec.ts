import { describe, it, expect } from 'vitest';
import { openaiMediaModule } from './media.adapter';

// Sora (OpenAI Videos API) lives on the openai *media* module (the package exports both ai + media).

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

describe('openai media adapter — Sora Videos API', () => {
  it('submits text-to-video to /v1/videos with a JSON body and Bearer auth', async () => {
    const { recs, ctx } = makeCtx(() => json({ id: 'video_abc', status: 'queued' }));
    const adapter: any = openaiMediaModule.create(ctx as any);

    const sub = await adapter.generateVideo('a dog skateboarding', {
      apiKey: 'sk-test',
      model: 'sora-2',
      input: { size: '1280x720', seconds: '8' },
    });

    expect(sub.jobId).toBe('video_abc');
    const r = recs[0];
    expect(r.url).toBe('https://api.openai.com/v1/videos');
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(r.body);
    expect(body.model).toBe('sora-2');
    expect(body.prompt).toBe('a dog skateboarding');
    expect(body.size).toBe('1280x720');
    expect(body.seconds).toBe('8');
  });

  it('pollJob: in_progress → pending; completed → downloads /content and inlines a data:video/mp4 URL', async () => {
    const mp4 = Buffer.from('FAKEMP4BYTES');
    const { recs, ctx } = makeCtx((url, _i, n) => {
      if (url.endsWith('/content')) return bytes(mp4);
      return n === 1 ? json({ id: 'video_abc', status: 'in_progress' }) : json({ id: 'video_abc', status: 'completed' });
    });
    const adapter: any = openaiMediaModule.create(ctx as any);

    const pending = await adapter.pollJob('video_abc', { apiKey: 'sk-test' });
    expect(pending.status).toBe('pending');
    expect(recs[0].url).toBe('https://api.openai.com/v1/videos/video_abc');

    const done = await adapter.pollJob('video_abc', { apiKey: 'sk-test' });
    expect(done.status).toBe('completed');
    expect(done.artifactUrl).toBe(`data:video/mp4;base64,${mp4.toString('base64')}`);
    expect(recs.some((r) => r.url === 'https://api.openai.com/v1/videos/video_abc/content')).toBe(true);
  });

  it('generateImage POSTs /v1/images/generations and parses b64_json into a data URL', async () => {
    const { recs, ctx } = makeCtx(() => json({ data: [{ b64_json: 'SU1H' }] }));
    const adapter: any = openaiMediaModule.create(ctx as any);

    const out = await adapter.generateImage('a red panda', {
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      input: { output_format: 'png', quality: 'high' },
    });

    const r = recs[0];
    expect(r.url).toBe('https://api.openai.com/v1/images/generations');
    expect(r.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(r.body);
    expect(body.model).toBe('gpt-image-1');
    expect(body.prompt).toBe('a red panda');
    expect(out.image).toBe('data:image/png;base64,SU1H');
  });

  it('generateAudio (TTS) POSTs /v1/audio/speech and inlines the clip as a data:audio URL', async () => {
    const clip = Buffer.from('AUDIOBYTES');
    const { recs, ctx } = makeCtx(() => bytes(clip));
    const adapter: any = openaiMediaModule.create(ctx as any);

    const sub = await adapter.generateAudio('hello world', {
      apiKey: 'sk-test',
      model: 'tts-1',
      input: { voice: 'nova', response_format: 'mp3' },
    });

    const r = recs[0];
    expect(r.url).toBe('https://api.openai.com/v1/audio/speech');
    const body = JSON.parse(r.body);
    expect(body.model).toBe('tts-1');
    expect(body.voice).toBe('nova');
    expect(body.input).toBe('hello world');
    expect(sub.artifactUrl).toBe(`data:audio/mpeg;base64,${clip.toString('base64')}`);
  });

  it('rejects avatar generation (unsupported)', async () => {
    const { ctx } = makeCtx(() => json({}));
    const adapter: any = openaiMediaModule.create(ctx as any);
    await expect(adapter.generateAvatar('x', { apiKey: 'sk-test' })).rejects.toThrow();
  });

  it('throws when the API key is missing', async () => {
    const { ctx } = makeCtx(() => json({}));
    const adapter: any = openaiMediaModule.create(ctx as any);
    await expect(adapter.generateImage('x', {})).rejects.toThrow('OpenAI API key is required');
  });
});

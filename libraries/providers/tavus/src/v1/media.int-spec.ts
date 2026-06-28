import { describe, it, expect } from 'vitest';
import { makeCtx, res } from '@gitroom/provider-kernel/testing/media-int-helpers';
import { tavusMediaModule } from './media.adapter';

// Recorded-fixture integration test (plan B4) — no network. A stub ctx.fetch records the
// request the adapter builds and returns canned responses matching Tavus's documented shape.
// Tavus is an async submit-and-poll replica-video provider.

describe('tavus media adapter (async replica-video submit-and-poll)', () => {
  it('POSTs to /videos with the x-api-key header and routes the replica id + prompt script into the body', async () => {
    const { recs, ctx } = makeCtx(() => res({ video_id: 'vid-123' }));
    const adapter: any = tavusMediaModule.create(ctx as any);

    const sub = await adapter.generateVideo('read this script', {
      apiKey: 'tavus-key',
      avatarId: 'replica-7',
    });

    expect(sub.jobId).toBe('vid-123');
    const r = recs[0];
    expect(r.url).toBe('https://tavusapi.com/v2/videos');
    expect(r.method).toBe('POST');
    expect(r.headers['x-api-key']).toBe('tavus-key');
    const body = JSON.parse(r.body);
    expect(body.replica_id).toBe('replica-7');
    expect(body.script).toBe('read this script');
  });

  it('pollJob parses an in-progress status → pending and ready → completed with the download URL', async () => {
    const { ctx } = makeCtx((_url, _init, n) =>
      n === 1
        ? res({ status: 'generating' })
        : res({ status: 'ready', download_url: 'https://cdn.tavus/out.mp4' }),
    );
    const adapter: any = tavusMediaModule.create(ctx as any);

    const pending = await adapter.pollJob('vid-123', { apiKey: 'tavus-key' });
    expect(pending.status).toBe('pending');

    const done = await adapter.pollJob('vid-123', { apiKey: 'tavus-key' });
    expect(done.status).toBe('completed');
    expect(done.artifactUrl).toBe('https://cdn.tavus/out.mp4');
  });

  it('rejects a missing replica id, a missing key, and unsupported image/audio operations', async () => {
    const { ctx } = makeCtx(() => res({}));
    const adapter: any = tavusMediaModule.create(ctx as any);
    // Replica id is validated before the key.
    await expect(adapter.generateVideo('x', { apiKey: 'k' })).rejects.toThrow('replica id');
    await expect(adapter.generateVideo('x', { avatarId: 'replica-7' })).rejects.toThrow(
      'Tavus API key is required',
    );
    await expect(adapter.generateImage('x', { apiKey: 'k' })).rejects.toThrow();
    await expect(adapter.generateAudio('x', { apiKey: 'k' })).rejects.toThrow();
  });
});

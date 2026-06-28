import { describe, it, expect } from 'vitest';
import { makeCtx, res } from '@gitroom/provider-kernel/testing/media-int-helpers';
import { replicateMediaModule } from './media.adapter';

// Recorded-fixture integration test (plan B4) — no network. Replicate: video/audio/avatar
// are async submit (POST /predictions → id) then poll (GET /predictions/{id} → status +
// output). Credentials resolve via resolveApiKey (Bearer).

describe('replicate media adapter (async predictions)', () => {
  it('submits video generation to /predictions with Bearer auth, version, and merged input', async () => {
    const { recs, ctx } = makeCtx(() => res({ id: 'pred-123', status: 'starting' }));
    const adapter: any = replicateMediaModule.create(ctx as any);

    const sub = await adapter.generateVideo('a cat surfing', {
      apiKey: 'replicate-key',
      version: 'some-model-version',
      input: { num_frames: 24 },
    });

    expect(sub.jobId).toBe('pred-123');
    const r = recs[0];
    expect(r.url).toBe('https://api.replicate.com/v1/predictions');
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer replicate-key');
    const body = JSON.parse(r.body);
    expect(body.version).toBe('some-model-version');
    // prompt + native input params are merged into the prediction input.
    expect(body.input).toEqual({ prompt: 'a cat surfing', num_frames: 24 });
  });

  it('pollJob parses processing → pending and succeeded → completed with the output URL', async () => {
    const { ctx } = makeCtx((_url, _init, n) =>
      n === 1
        ? res({ id: 'pred-123', status: 'processing' })
        : res({ id: 'pred-123', status: 'succeeded', output: ['https://cdn.replicate/out.mp4'] }),
    );
    const adapter: any = replicateMediaModule.create(ctx as any);

    const pending = await adapter.pollJob('pred-123', { apiKey: 'replicate-key' });
    expect(pending.status).toBe('pending');

    const done = await adapter.pollJob('pred-123', { apiKey: 'replicate-key' });
    expect(done.status).toBe('completed');
    expect(done.artifactUrl).toBe('https://cdn.replicate/out.mp4');
  });

  it('pollJob maps failed → failed with the error message', async () => {
    const { ctx } = makeCtx(() => res({ id: 'pred-123', status: 'failed', error: 'boom' }));
    const adapter: any = replicateMediaModule.create(ctx as any);
    const out = await adapter.pollJob('pred-123', { apiKey: 'replicate-key' });
    expect(out.status).toBe('failed');
    expect(out.error).toBe('boom');
  });

  it('rejects a missing key', async () => {
    const { ctx } = makeCtx(() => res({}));
    const adapter: any = replicateMediaModule.create(ctx as any);
    await expect(adapter.generateVideo('x', {})).rejects.toThrow('API key is required');
    await expect(adapter.generateImage('x', {})).rejects.toThrow('API key is required');
  });
});

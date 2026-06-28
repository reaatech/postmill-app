import { describe, it, expect } from 'vitest';
import { makeCtx, res } from '@gitroom/provider-kernel/testing/media-int-helpers';
import { minimaxMediaModule } from './media.adapter';

// Recorded-fixture integration test (plan B4) — no network. MiniMax: image + audio are
// synchronous; video is async submit (/video_generation → task_id) then poll
// (/query/video_generation → Success + file_id → /files/retrieve → download_url).

describe('minimax media adapter', () => {
  it('submits video generation to /video_generation with Bearer auth and folds subject_image into subject_reference', async () => {
    const { recs, ctx } = makeCtx(() => res({ task_id: 'task-123' }));
    const adapter: any = minimaxMediaModule.create(ctx as any);

    const sub = await adapter.generateVideo('a cat surfing', {
      apiKey: 'minimax-key',
      model: 'video-01',
      input: { prompt_optimizer: true, subject_image: 'https://img/me.png' },
    });

    expect(sub.jobId).toBe('task-123');
    const r = recs[0];
    expect(r.url).toBe('https://api.minimax.io/v1/video_generation');
    expect(r.method).toBe('POST');
    expect(r.headers.Authorization).toBe('Bearer minimax-key');
    const body = JSON.parse(r.body);
    expect(body.model).toBe('video-01');
    expect(body.prompt).toBe('a cat surfing');
    expect(body.prompt_optimizer).toBe(true);
    // subject_image is flattened into MiniMax's nested subject_reference array.
    expect(body.subject_reference).toEqual([{ type: 'character', image: ['https://img/me.png'] }]);
  });

  it('generateImage POSTs to /image_generation and parses data.image_urls', async () => {
    const { recs, ctx } = makeCtx(() =>
      res({ data: { image_urls: ['https://cdn.minimax/a.png', 'https://cdn.minimax/b.png'] } }),
    );
    const adapter: any = minimaxMediaModule.create(ctx as any);

    const out = await adapter.generateImage('a logo', { apiKey: 'minimax-key', model: 'image-01' });
    const r = recs[0];
    expect(r.url).toBe('https://api.minimax.io/v1/image_generation');
    expect(r.method).toBe('POST');
    const body = JSON.parse(r.body);
    expect(body.prompt).toBe('a logo');
    expect(body.response_format).toBe('url');
    expect(out.image).toBe('https://cdn.minimax/a.png');
    expect(out.multi).toBe(true);
  });

  it('pollJob parses pending then Success (query → files/retrieve → download_url)', async () => {
    const { ctx } = makeCtx((url, _i, n) => {
      if (url.includes('query/video_generation')) {
        return n === 1
          ? res({ status: 'Processing' })
          : res({ status: 'Success', file_id: 'file-9' });
      }
      // files/retrieve
      return res({ file: { download_url: 'https://cdn.minimax/out.mp4' } });
    });
    const adapter: any = minimaxMediaModule.create(ctx as any);

    const pending = await adapter.pollJob('task-123', { apiKey: 'minimax-key' });
    expect(pending.status).toBe('pending');

    const done = await adapter.pollJob('task-123', { apiKey: 'minimax-key' });
    expect(done.status).toBe('completed');
    expect(done.artifactUrl).toBe('https://cdn.minimax/out.mp4');
  });

  it('rejects unsupported avatar and a missing key', async () => {
    const { ctx } = makeCtx(() => res({}));
    const adapter: any = minimaxMediaModule.create(ctx as any);
    await expect(adapter.generateAvatar('x', { apiKey: 'k' })).rejects.toThrow();
    await expect(adapter.generateVideo('x', {})).rejects.toThrow('API key is required');
  });
});

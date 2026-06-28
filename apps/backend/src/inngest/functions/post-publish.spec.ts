import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: {
    createFunction: vi.fn((opts: any, trigger: any, handler: any) => ({
      opts,
      trigger,
      handler,
    })),
  },
}));

// post-publish derives its per-provider task queues at import time from the
// generated provider modules (the kernel's single source of truth). Mock a
// small social subset (plus one non-social module that must be ignored).
vi.mock('@gitroom/backend/providers.generated', () => ({
  providerModules: [
    { manifest: { domain: 'social', providerId: 'x', version: 'v1' }, legacyProvider: { identifier: 'x', maxConcurrentJob: 1 } },
    { manifest: { domain: 'social', providerId: 'instagram', version: 'v1' }, legacyProvider: { identifier: 'instagram', maxConcurrentJob: 400 } },
    { manifest: { domain: 'social', providerId: 'instagram-standalone', version: 'v1' }, legacyProvider: { identifier: 'instagram-standalone', maxConcurrentJob: 200 } },
    { manifest: { domain: 'social', providerId: 'mastodon', version: 'v1' }, legacyProvider: { identifier: 'mastodon', maxConcurrentJob: 5 } },
    { manifest: { domain: 'ai', providerId: 'openai', version: 'v1' } },
  ],
}));

import { createPostPublishFunctions } from './post-publish';
import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { providerModules } from '@gitroom/backend/providers.generated';

describe('createPostPublishFunctions', () => {
  const postActivity = {} as any;

  beforeEach(() => {
    vi.mocked(inngest.createFunction).mockClear();
  });

  it('generates one function per unique task queue', () => {
    createPostPublishFunctions(postActivity);

    const expectedQueues = new Set(
      providerModules
        .filter((m: any) => m.manifest.domain === 'social' && m.legacyProvider)
        .map((m: any) => m.legacyProvider.identifier.split('-')[0].toLowerCase())
    );

    expect(inngest.createFunction).toHaveBeenCalledTimes(expectedQueues.size);
  });

  it('names each function post-publish-{taskQueue} and sets the provider concurrency limit', () => {
    createPostPublishFunctions(postActivity);

    const xCall = vi.mocked(inngest.createFunction).mock.calls.find(
      (call) => call[0].id === 'post-publish-x'
    );

    expect(xCall).toBeDefined();
    expect(xCall![0].concurrency).toEqual({ limit: 1 });
  });

  it('uses the most conservative limit when provider variants share a task queue', () => {
    createPostPublishFunctions(postActivity);

    const instagramCall = vi.mocked(inngest.createFunction).mock.calls.find(
      (call) => call[0].id === 'post-publish-instagram'
    );

    // instagram = 400, instagram-standalone = 200 → queue limit is 200
    expect(instagramCall).toBeDefined();
    expect(instagramCall![0].concurrency).toEqual({ limit: 200 });
  });

  it('routes each function by event.data.taskQueue', () => {
    createPostPublishFunctions(postActivity);

    const mastodonCall = vi.mocked(inngest.createFunction).mock.calls.find(
      (call) => call[0].id === 'post-publish-mastodon'
    );

    expect(mastodonCall![1]).toEqual({
      event: 'post/publish',
      if: 'event.data.taskQueue == "mastodon"',
    });
  });

  it('declares cancelOn keyed by postId on every generated function', () => {
    createPostPublishFunctions(postActivity);

    const anyCall = vi.mocked(inngest.createFunction).mock.calls[0];

    expect(anyCall[0].cancelOn).toEqual([
      {
        event: 'post/cancel',
        if: 'async.data.postId == event.data.postId',
      },
    ]);
  });
});

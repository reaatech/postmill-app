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

import { createPostPublishFunctions } from './post-publish';
import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';

describe('createPostPublishFunctions', () => {
  const postActivity = {} as any;

  beforeEach(() => {
    vi.mocked(inngest.createFunction).mockClear();
  });

  it('generates one function per unique task queue', () => {
    createPostPublishFunctions(postActivity);

    const expectedQueues = new Set(
      socialIntegrationList.map((p) => p.identifier.split('-')[0].toLowerCase())
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

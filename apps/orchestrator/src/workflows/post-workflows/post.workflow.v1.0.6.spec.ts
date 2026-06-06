import { describe, it, expect, vi, beforeEach } from 'vitest';

// All activities (both the module-level proxyActivities() and the per-call
// proxyTaskQueue() inside the workflow) resolve to this single mock object —
// both proxyActivities invocations return `mockActivities`.
const { mockActivities, FakeActivityFailure, FakeApplicationFailure } =
  vi.hoisted(() => {
    class FakeActivityFailure extends Error {
      cause: any;
    }
    class FakeApplicationFailure extends Error {
      type?: string;
    }
    return {
      FakeActivityFailure,
      FakeApplicationFailure,
      mockActivities: {
    // module-level proxyActivities<PostActivity>
    getPostsList: vi.fn(),
    getPost: vi.fn(),
    inAppNotification: vi.fn().mockResolvedValue(undefined),
    changeState: vi.fn().mockResolvedValue(undefined),
    updatePost: vi.fn().mockResolvedValue(undefined),
    updatePostSettings: vi.fn().mockResolvedValue(undefined),
    sendWebhooks: vi.fn().mockResolvedValue(undefined),
    isCommentable: vi.fn().mockResolvedValue(false),
    supportsFirstComment: vi.fn().mockResolvedValue(true),
    // proxyTaskQueue(taskQueue)
    postSocial: vi.fn(),
    postComment: vi.fn(),
    postFirstComment: vi.fn().mockResolvedValue([
      { postId: 'first-comment-id-456', releaseURL: 'https://example.com/c/1' },
    ]),
    getIntegrationById: vi.fn(),
    refreshTokenWithCause: vi.fn(),
    internalPlugs: vi.fn().mockResolvedValue([]),
    globalPlugs: vi.fn().mockResolvedValue([]),
      processInternalPlug: vi.fn(),
      processPlug: vi.fn(),
      },
    };
  });

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: vi.fn(() => mockActivities),
  sleep: vi.fn().mockResolvedValue(undefined),
  startChild: vi.fn().mockResolvedValue(undefined),
  defineSignal: vi.fn(() => 'poke-signal'),
  setHandler: vi.fn(),
  ActivityFailure: FakeActivityFailure,
  ApplicationFailure: FakeApplicationFailure,
}));

vi.mock('@temporalio/common', () => ({
  TypedSearchAttributes: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@gitroom/nestjs-libraries/services/make.is', () => ({
  makeId: vi.fn(() => 'abcdefghij'),
}));

vi.mock('@gitroom/nestjs-libraries/temporal/temporal.search.attribute', () => ({
  postId: { name: 'postId' },
}));

import { postWorkflowV106 } from './post.workflow.v1.0.6';

const ORG_ID = 'org-1';
const POST_ID = 'post-1';
const PUBLISHED_POST_ID = 'published-post-id-123';

const baseArgs = {
  taskQueue: 'tq-1',
  postId: POST_ID,
  organizationId: ORG_ID,
  postNow: true as boolean,
};

const integration = {
  id: 'int-1',
  organizationId: ORG_ID,
  providerIdentifier: 'mastodon',
  name: 'My Mastodon',
  refreshNeeded: false,
  disabled: false,
};

/**
 * Builds the single post row returned by getPost / getPostsList.
 * `settings` is the JSON string the workflow parses for firstComment state.
 */
function makePost(settings: Record<string, any>) {
  return {
    id: POST_ID,
    organizationId: ORG_ID,
    state: 'QUEUE',
    publishDate: new Date().toISOString(),
    intervalInDays: 0,
    integration: { ...integration },
    settings: JSON.stringify(settings),
  };
}

/**
 * Wire up the happy path up to (and including) the social publish so each
 * test only needs to configure the first-comment-relevant bits.
 */
function primeSuccessfulPublish(settings: Record<string, any>) {
  const post = makePost(settings);
  mockActivities.getPost.mockResolvedValue(post);
  mockActivities.getPostsList.mockResolvedValue([post]);
  mockActivities.isCommentable.mockResolvedValue(false);
  mockActivities.postSocial.mockResolvedValue([
    {
      postId: PUBLISHED_POST_ID,
      releaseURL: 'https://example.com/p/1',
      status: 'success',
    },
  ]);
}

/** Returns inAppNotification calls whose severity argument (index 5) is 'fail'. */
function failNotifications() {
  return mockActivities.inAppNotification.mock.calls.filter(
    (call) => call[5] === 'fail'
  );
}

describe('postWorkflowV106 — first comment (2F)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockActivities.inAppNotification.mockResolvedValue(undefined);
    mockActivities.changeState.mockResolvedValue(undefined);
    mockActivities.updatePost.mockResolvedValue(undefined);
    mockActivities.updatePostSettings.mockResolvedValue(undefined);
    mockActivities.sendWebhooks.mockResolvedValue(undefined);
    mockActivities.isCommentable.mockResolvedValue(false);
    mockActivities.supportsFirstComment.mockResolvedValue(true);
    mockActivities.postFirstComment.mockResolvedValue([
      { postId: 'first-comment-id-456', releaseURL: 'https://example.com/c/1' },
    ]);
    mockActivities.internalPlugs.mockResolvedValue([]);
    mockActivities.globalPlugs.mockResolvedValue([]);
  });

  it('(a) success: posts the first comment once, persists firstCommentPostedAt, and emits NO fail notification', async () => {
    primeSuccessfulPublish({ firstComment: 'Great thread, follow me!' });

    await postWorkflowV106(baseArgs);

    // Comment posted exactly once, against the published post id.
    expect(mockActivities.postFirstComment).toHaveBeenCalledTimes(1);
    expect(mockActivities.postFirstComment).toHaveBeenCalledWith(
      PUBLISHED_POST_ID,
      expect.objectContaining({ id: 'int-1' }),
      'Great thread, follow me!'
    );

    // firstCommentId / firstCommentPostedAt written back via updatePostSettings.
    expect(mockActivities.updatePostSettings).toHaveBeenCalledTimes(1);
    const [settingsPostId, settingsJson] =
      mockActivities.updatePostSettings.mock.calls[0];
    expect(settingsPostId).toBe(POST_ID);
    const persisted = JSON.parse(settingsJson);
    expect(persisted.firstComment).toBe('Great thread, follow me!');
    expect(persisted.firstCommentId).toBe('first-comment-id-456');
    expect(persisted.firstCommentReleaseURL).toBe('https://example.com/c/1');
    expect(typeof persisted.firstCommentPostedAt).toBe('string');
    expect(Number.isNaN(Date.parse(persisted.firstCommentPostedAt))).toBe(false);

    // No 'fail' notification for the (now-removed) unconditional bug.
    expect(failNotifications()).toHaveLength(0);

    // Post is published — webhooks still fire.
    expect(mockActivities.sendWebhooks).toHaveBeenCalledTimes(1);
  });

  it('(b) non-fatal failure: postFirstComment throws — post stays published, a fail notification IS emitted, webhooks still run', async () => {
    primeSuccessfulPublish({ firstComment: 'My first comment' });
    mockActivities.postFirstComment.mockRejectedValue(
      new Error('provider rejected comment')
    );

    // Workflow must still complete (non-fatal) — it does not throw or return false.
    await expect(postWorkflowV106(baseArgs)).resolves.not.toBe(false);

    expect(mockActivities.postFirstComment).toHaveBeenCalledTimes(1);

    // firstCommentPostedAt is NOT persisted because the post failed.
    expect(mockActivities.updatePostSettings).not.toHaveBeenCalled();

    // A 'fail' notification is emitted, and only one.
    const fails = failNotifications();
    expect(fails).toHaveLength(1);
    expect(fails[0][0]).toBe(ORG_ID);
    expect(fails[0][1]).toContain('First comment');

    // Post stays published — no ERROR state change, webhooks still run.
    expect(mockActivities.changeState).not.toHaveBeenCalledWith(
      expect.anything(),
      'ERROR',
      expect.anything(),
      expect.anything()
    );
    expect(mockActivities.sendWebhooks).toHaveBeenCalledTimes(1);
  });

  it('(c) idempotency: firstCommentPostedAt already set — postFirstComment is NOT called again (no double-post)', async () => {
    primeSuccessfulPublish({
      firstComment: 'My first comment',
      firstCommentPostedAt: '2026-01-01T00:00:00.000Z',
    });

    await postWorkflowV106(baseArgs);

    expect(mockActivities.postFirstComment).not.toHaveBeenCalled();
    // No re-write of settings, no fail notification.
    expect(mockActivities.updatePostSettings).not.toHaveBeenCalled();
    expect(failNotifications()).toHaveLength(0);
    expect(mockActivities.sendWebhooks).toHaveBeenCalledTimes(1);
  });

  it('(c2) idempotency: firstCommentId already set — postFirstComment is NOT called again (no double-post)', async () => {
    primeSuccessfulPublish({
      firstComment: 'My first comment',
      firstCommentId: 'platform-comment-id',
    });

    await postWorkflowV106(baseArgs);

    expect(mockActivities.postFirstComment).not.toHaveBeenCalled();
    expect(mockActivities.updatePostSettings).not.toHaveBeenCalled();
    expect(failNotifications()).toHaveLength(0);
    expect(mockActivities.sendWebhooks).toHaveBeenCalledTimes(1);
  });

  it('(c3) capability gate: unsupported providers do not call postFirstComment and emit an info notification', async () => {
    primeSuccessfulPublish({ firstComment: 'My first comment' });
    mockActivities.supportsFirstComment.mockResolvedValue(false);

    await postWorkflowV106(baseArgs);

    expect(mockActivities.postFirstComment).not.toHaveBeenCalled();
    expect(mockActivities.updatePostSettings).not.toHaveBeenCalled();
    expect(failNotifications()).toHaveLength(0);
    expect(
      mockActivities.inAppNotification.mock.calls.some(
        (call) => call[5] === 'info' && `${call[1]}`.includes('not supported')
      )
    ).toBe(true);
    expect(mockActivities.sendWebhooks).toHaveBeenCalledTimes(1);
  });

  it('(d) no firstComment configured: postFirstComment never called and no first-comment notification', async () => {
    primeSuccessfulPublish({ someOtherSetting: true });

    await postWorkflowV106(baseArgs);

    expect(mockActivities.postFirstComment).not.toHaveBeenCalled();
    expect(mockActivities.updatePostSettings).not.toHaveBeenCalled();
    expect(failNotifications()).toHaveLength(0);
    expect(mockActivities.sendWebhooks).toHaveBeenCalledTimes(1);
  });
});

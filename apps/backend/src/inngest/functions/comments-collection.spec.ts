import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}));

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { createCommentsCollection } from './comments-collection';
import { createMockStep, captureFunctionHandler } from '../test/step.mock';

describe('createCommentsCollection', () => {
  let commentsActivity: {
    getAllOrganizationIds: ReturnType<typeof vi.fn>;
    getDaysBack: ReturnType<typeof vi.fn>;
    getSweepIntervalMinutes: ReturnType<typeof vi.fn>;
    syncPostComments: ReturnType<typeof vi.fn>;
    dispatchWebhookForComments: ReturnType<typeof vi.fn>;
    pruneComments: ReturnType<typeof vi.fn>;
    notifyNewComments: ReturnType<typeof vi.fn>;
  };
  let getHandler: () => any;

  beforeEach(() => {
    vi.clearAllMocks();

    commentsActivity = {
      getAllOrganizationIds: vi.fn().mockResolvedValue(['org-1']),
      getDaysBack: vi.fn().mockResolvedValue(7),
      getSweepIntervalMinutes: vi.fn().mockResolvedValue(5),
      syncPostComments: vi.fn().mockResolvedValue(undefined),
      dispatchWebhookForComments: vi.fn().mockResolvedValue(undefined),
      pruneComments: vi.fn().mockResolvedValue(undefined),
      notifyNewComments: vi.fn().mockResolvedValue(undefined),
    };

    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createCommentsCollection(commentsActivity as any);
  });

  it('registers a minutely UTC cron handler with concurrency 1', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'comments-collection', concurrency: 1 }),
      { cron: 'TZ=UTC * * * * *' },
      expect.any(Function)
    );
  });

  it('runs get-org-ids, get-days-back, get-interval, per-org comment steps, then sleeps', async () => {
    const step = createMockStep();

    await getHandler()({ step });

    expect(step.run).toHaveBeenCalledWith('get-org-ids', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('get-days-back', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('get-interval', expect.any(Function));

    expect(step.run).toHaveBeenCalledWith(
      'sync-comments-org-1',
      expect.any(Function)
    );
    expect(step.run).toHaveBeenCalledWith(
      'dispatch-webhook-org-1',
      expect.any(Function)
    );
    expect(step.run).toHaveBeenCalledWith(
      'prune-comments-org-1',
      expect.any(Function)
    );
    expect(step.run).toHaveBeenCalledWith(
      'notify-comments-org-1',
      expect.any(Function)
    );

    expect(step.sleep).toHaveBeenCalledWith('wait-interval', '5m');
  });
});

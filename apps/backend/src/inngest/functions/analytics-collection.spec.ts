import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}));

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { createAnalyticsCollection } from './analytics-collection';
import { createMockStep, captureFunctionHandler } from '../test/step.mock';

describe('createAnalyticsCollection', () => {
  let analyticsActivity: {
    getAllOrganizationIds: ReturnType<typeof vi.fn>;
    collectChannelSnapshots: ReturnType<typeof vi.fn>;
    collectPostSnapshots: ReturnType<typeof vi.fn>;
    pruneAndRollupSnapshots: ReturnType<typeof vi.fn>;
    notifySnapshotComplete: ReturnType<typeof vi.fn>;
    probeWatchedAccounts: ReturnType<typeof vi.fn>;
    collectShortLinkSnapshots: ReturnType<typeof vi.fn>;
    pruneShortLinkSnapshots: ReturnType<typeof vi.fn>;
    pruneEmailLogs: ReturnType<typeof vi.fn>;
  };
  let getHandler: () => any;

  beforeEach(() => {
    vi.clearAllMocks();

    analyticsActivity = {
      getAllOrganizationIds: vi.fn().mockResolvedValue(['org-1', 'org-2']),
      collectChannelSnapshots: vi.fn().mockResolvedValue(undefined),
      collectPostSnapshots: vi.fn().mockResolvedValue(undefined),
      pruneAndRollupSnapshots: vi.fn().mockResolvedValue(undefined),
      notifySnapshotComplete: vi.fn().mockResolvedValue(undefined),
      probeWatchedAccounts: vi.fn().mockResolvedValue(undefined),
      collectShortLinkSnapshots: vi.fn().mockResolvedValue(undefined),
      pruneShortLinkSnapshots: vi.fn().mockResolvedValue(undefined),
      pruneEmailLogs: vi.fn().mockResolvedValue(undefined),
    };

    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createAnalyticsCollection(analyticsActivity as any);
  });

  it('registers a daily UTC cron handler with concurrency 1', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'analytics-collection', concurrency: 1 }),
      { cron: 'TZ=UTC 0 2 * * *' },
      expect.any(Function)
    );
  });

  it('runs get-org-ids then per-org channel, post, prune, side-effects, watched, and shortlink steps', async () => {
    const step = createMockStep();

    await getHandler()({ step });

    expect(step.run).toHaveBeenCalledWith('get-org-ids', expect.any(Function));
    expect(analyticsActivity.getAllOrganizationIds).toHaveBeenCalled();

    for (const orgId of ['org-1', 'org-2']) {
      expect(step.run).toHaveBeenCalledWith(
        `collect-channel-${orgId}`,
        expect.any(Function)
      );
      expect(step.run).toHaveBeenCalledWith(
        `collect-post-${orgId}`,
        expect.any(Function)
      );
      expect(step.run).toHaveBeenCalledWith(`prune-${orgId}`, expect.any(Function));
      expect(step.run).toHaveBeenCalledWith(
        `side-effects-${orgId}`,
        expect.any(Function)
      );
      expect(step.run).toHaveBeenCalledWith(
        `probe-watched-${orgId}`,
        expect.any(Function)
      );
      expect(step.run).toHaveBeenCalledWith(
        `shortlink-snap-${orgId}`,
        expect.any(Function)
      );
      expect(step.run).toHaveBeenCalledWith(
        `shortlink-prune-${orgId}`,
        expect.any(Function)
      );
    }

    expect(step.run).toHaveBeenCalledWith('prune-email-logs', expect.any(Function));
  });
});

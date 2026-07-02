import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}));

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import {
  createAnalyticsCollection,
  createAnalyticsSyncOrg,
} from './analytics-collection';
import { createMockStep, captureFunctionHandler } from '../test/step.mock';

const makeActivity = () => ({
  getAllOrganizationIds: vi.fn().mockResolvedValue(['org-1', 'org-2']),
  collectChannelSnapshots: vi.fn().mockResolvedValue(undefined),
  collectPostSnapshots: vi.fn().mockResolvedValue(undefined),
  pruneAndRollupSnapshots: vi.fn().mockResolvedValue(undefined),
  notifySnapshotComplete: vi.fn().mockResolvedValue(undefined),
  probeWatchedAccounts: vi.fn().mockResolvedValue(undefined),
  collectShortLinkSnapshots: vi.fn().mockResolvedValue(undefined),
  pruneShortLinkSnapshots: vi.fn().mockResolvedValue(undefined),
  pruneEmailLogs: vi.fn().mockResolvedValue(undefined),
});

const makeRunRepo = () => ({
  recordStart: vi.fn().mockResolvedValue('2020-01-01T00:00:00.000Z'),
  recordComplete: vi.fn().mockResolvedValue(undefined),
  recordFailed: vi.fn().mockResolvedValue(undefined),
  getAllLatest: vi.fn().mockResolvedValue([]),
});

describe('createAnalyticsCollection (cron, fan-out)', () => {
  let analyticsActivity: ReturnType<typeof makeActivity>;
  let runRepo: ReturnType<typeof makeRunRepo>;
  let getHandler: () => any;

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsActivity = makeActivity();
    runRepo = makeRunRepo();
    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createAnalyticsCollection(analyticsActivity as any, runRepo as any);
  });

  it('registers a daily UTC cron handler with concurrency 1', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'analytics-collection', concurrency: 1 }),
      { cron: 'TZ=UTC 0 2 * * *' },
      expect.any(Function)
    );
  });

  it('reads org ids, fans out one analytics/sync-org event per org, then prunes email logs', async () => {
    const step = createMockStep();

    await getHandler()({ step });

    expect(step.run).toHaveBeenCalledWith('get-org-ids', expect.any(Function));
    expect(analyticsActivity.getAllOrganizationIds).toHaveBeenCalled();

    expect(runRepo.recordStart).toHaveBeenCalledWith('analytics-collection');
    expect(runRepo.recordComplete).toHaveBeenCalledWith(
      'analytics-collection',
      '2020-01-01T00:00:00.000Z'
    );

    // One fan-out batch: an 'analytics/sync-org' event per org.
    expect(step.sendEvent).toHaveBeenCalledWith('fan-out-analytics', [
      { name: 'analytics/sync-org', data: { organizationId: 'org-1' } },
      { name: 'analytics/sync-org', data: { organizationId: 'org-2' } },
    ]);

    // The cron itself no longer does per-org work.
    expect(analyticsActivity.collectChannelSnapshots).not.toHaveBeenCalled();
    expect(analyticsActivity.collectPostSnapshots).not.toHaveBeenCalled();
    expect(analyticsActivity.pruneAndRollupSnapshots).not.toHaveBeenCalled();

    // The trailing cron-level prune step stays.
    expect(step.run).toHaveBeenCalledWith(
      'prune-email-logs',
      expect.any(Function)
    );
  });

  it('does not fan out when there are no orgs', async () => {
    analyticsActivity.getAllOrganizationIds.mockResolvedValue([]);
    const step = createMockStep();

    await getHandler()({ step });

    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(step.run).toHaveBeenCalledWith(
      'prune-email-logs',
      expect.any(Function)
    );
  });
});

describe('createAnalyticsSyncOrg (per-org event handler)', () => {
  let analyticsActivity: ReturnType<typeof makeActivity>;
  let getHandler: () => any;

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsActivity = makeActivity();
    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createAnalyticsSyncOrg(analyticsActivity as any);
  });

  it('registers an event handler with a concurrency cap', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'analytics-sync-org', concurrency: 5 }),
      { event: 'analytics/sync-org' },
      expect.any(Function)
    );
  });

  it('runs the seven per-org analytics steps for the event org', async () => {
    const step = createMockStep();

    await getHandler()({
      step,
      event: { data: { organizationId: 'org-9' } },
    });

    expect(step.run).toHaveBeenCalledWith('collect-channel', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('collect-post', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('prune', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('side-effects', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('probe-watched', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('shortlink-snap', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('shortlink-prune', expect.any(Function));

    expect(analyticsActivity.collectChannelSnapshots).toHaveBeenCalledWith('org-9', 7);
    expect(analyticsActivity.collectPostSnapshots).toHaveBeenCalledWith('org-9', 30);
    expect(analyticsActivity.pruneAndRollupSnapshots).toHaveBeenCalledWith('org-9');
    expect(analyticsActivity.notifySnapshotComplete).toHaveBeenCalledWith('org-9');
    expect(analyticsActivity.probeWatchedAccounts).toHaveBeenCalledWith('org-9');
    expect(analyticsActivity.collectShortLinkSnapshots).toHaveBeenCalledWith('org-9');
    expect(analyticsActivity.pruneShortLinkSnapshots).toHaveBeenCalledWith('org-9');
  });
});

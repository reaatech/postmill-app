import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockActivities, proxyActivitiesArgs } = vi.hoisted(() => {
  const configHolder: { current: any } = { current: undefined };

  return {
    mockActivities: {
      getAllOrganizationIds: vi.fn().mockResolvedValue([]),
      getDaysBack: vi.fn().mockResolvedValue(30),
      syncPostComments: vi.fn().mockResolvedValue(undefined),
      pruneComments: vi.fn().mockResolvedValue(undefined),
      getSweepIntervalMinutes: vi.fn().mockResolvedValue(45),
    },
    proxyActivitiesArgs: configHolder,
  };
});

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: vi.fn((config: any) => {
    proxyActivitiesArgs.current = config;
    return mockActivities;
  }),
  sleep: vi.fn(),
  continueAsNew: vi.fn(),
}));

import { sleep, continueAsNew } from '@temporalio/workflow';
import { commentsCollectionWorkflow } from './comments.collection.workflow';

describe('commentsCollectionWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockActivities.getAllOrganizationIds.mockResolvedValue([]);
    mockActivities.getDaysBack.mockResolvedValue(30);
    mockActivities.syncPostComments.mockResolvedValue(undefined);
    mockActivities.pruneComments.mockResolvedValue(undefined);
    mockActivities.getSweepIntervalMinutes.mockResolvedValue(45);
  });

  describe('proxyActivities config', () => {
    it('uses backoffCoefficient 2 (not 1) in retry config', () => {
      expect(proxyActivitiesArgs.current).toEqual(
        expect.objectContaining({
          startToCloseTimeout: '10 minutes',
          retry: expect.objectContaining({
            maximumAttempts: 3,
            backoffCoefficient: 2,
            initialInterval: '2 minutes',
          }),
        })
      );
    });
  });

  describe('workflow execution', () => {
    it('calls getAllOrganizationIds and getDaysBack', async () => {
      mockActivities.getAllOrganizationIds.mockResolvedValue(['org-1']);

      await commentsCollectionWorkflow();

      expect(mockActivities.getAllOrganizationIds).toHaveBeenCalledTimes(1);
      expect(mockActivities.getDaysBack).toHaveBeenCalledTimes(1);
    });

    it('passes daysBack value to syncPostComments', async () => {
      mockActivities.getAllOrganizationIds.mockResolvedValue(['org-1']);
      mockActivities.getDaysBack.mockResolvedValue(14);

      await commentsCollectionWorkflow();

      expect(mockActivities.syncPostComments).toHaveBeenCalledWith('org-1', 14);
    });

    it('processes orgs in batches of 5 concurrency', async () => {
      mockActivities.getAllOrganizationIds.mockResolvedValue([
        'org-1', 'org-2', 'org-3', 'org-4', 'org-5',
        'org-6', 'org-7',
      ]);

      await commentsCollectionWorkflow();

      expect(mockActivities.syncPostComments).toHaveBeenCalledTimes(7);
      expect(mockActivities.pruneComments).toHaveBeenCalledTimes(7);

      for (let i = 1; i <= 5; i++) {
        expect(mockActivities.syncPostComments).toHaveBeenCalledWith(`org-${i}`, 30);
        expect(mockActivities.pruneComments).toHaveBeenCalledWith(`org-${i}`);
      }

      expect(mockActivities.syncPostComments).toHaveBeenCalledWith('org-6', 30);
      expect(mockActivities.pruneComments).toHaveBeenCalledWith('org-6');
      expect(mockActivities.syncPostComments).toHaveBeenCalledWith('org-7', 30);
      expect(mockActivities.pruneComments).toHaveBeenCalledWith('org-7');
    });

    it('calls syncPostComments and pruneComments for each org', async () => {
      mockActivities.getAllOrganizationIds.mockResolvedValue(['org-1', 'org-2']);

      await commentsCollectionWorkflow();

      expect(mockActivities.syncPostComments).toHaveBeenCalledWith('org-1', 30);
      expect(mockActivities.pruneComments).toHaveBeenCalledWith('org-1');
      expect(mockActivities.syncPostComments).toHaveBeenCalledWith('org-2', 30);
      expect(mockActivities.pruneComments).toHaveBeenCalledWith('org-2');
    });

    it('sleeps for the sweep interval and continues as new', async () => {
      mockActivities.getAllOrganizationIds.mockResolvedValue(['org-1']);
      mockActivities.getSweepIntervalMinutes.mockResolvedValue(25);

      await commentsCollectionWorkflow();

      expect(mockActivities.getSweepIntervalMinutes).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith('25m');
      expect(continueAsNew).toHaveBeenCalledTimes(1);
    });

    it('handles empty organization list without error', async () => {
      mockActivities.getAllOrganizationIds.mockResolvedValue([]);

      await expect(commentsCollectionWorkflow()).resolves.toBeUndefined();

      expect(mockActivities.syncPostComments).not.toHaveBeenCalled();
      expect(mockActivities.pruneComments).not.toHaveBeenCalled();
      expect(mockActivities.getSweepIntervalMinutes).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalled();
      expect(continueAsNew).toHaveBeenCalled();
    });

    it('handles a single organization', async () => {
      mockActivities.getAllOrganizationIds.mockResolvedValue(['org-single']);

      await commentsCollectionWorkflow();

      expect(mockActivities.syncPostComments).toHaveBeenCalledTimes(1);
      expect(mockActivities.syncPostComments).toHaveBeenCalledWith('org-single', 30);
      expect(mockActivities.pruneComments).toHaveBeenCalledTimes(1);
      expect(mockActivities.pruneComments).toHaveBeenCalledWith('org-single');
    });

    it('processes exactly 5 orgs as a single batch', async () => {
      const orgs = Array.from({ length: 5 }, (_, i) => `org-${i + 1}`);
      mockActivities.getAllOrganizationIds.mockResolvedValue(orgs);

      await commentsCollectionWorkflow();

      expect(mockActivities.syncPostComments).toHaveBeenCalledTimes(5);
      expect(mockActivities.pruneComments).toHaveBeenCalledTimes(5);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockActivities } = vi.hoisted(() => ({
  mockActivities: {
    searchForMissingThreeHoursPosts: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: vi.fn(() => mockActivities),
  sleep: vi.fn().mockResolvedValue(undefined),
  continueAsNew: vi.fn().mockRejectedValue(new Error('continue-as-new')),
}));

import { continueAsNew, sleep } from '@temporalio/workflow';
import { missingPostWorkflow } from './missing.post.workflow';

describe('missingPostWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues as new after 24 hourly checks', async () => {
    await expect(missingPostWorkflow()).rejects.toThrow('continue-as-new');

    expect(mockActivities.searchForMissingThreeHoursPosts).toHaveBeenCalledTimes(24);
    expect(sleep).toHaveBeenCalledTimes(23);
    expect(sleep).toHaveBeenCalledWith('1 hour');
    expect(continueAsNew).toHaveBeenCalledTimes(1);
  });
});

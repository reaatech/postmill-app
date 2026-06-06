import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockActivities } = vi.hoisted(() => ({
  mockActivities: {
    autoPost: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: vi.fn(() => mockActivities),
  sleep: vi.fn().mockResolvedValue(undefined),
  continueAsNew: vi.fn().mockRejectedValue(new Error('continue-as-new')),
}));

import { continueAsNew, sleep } from '@temporalio/workflow';
import { autoPostWorkflow } from './autopost.workflow';

describe('autoPostWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues as new after 24 hourly iterations', async () => {
    await expect(
      autoPostWorkflow({ id: 'autopost-1', immediately: true })
    ).rejects.toThrow('continue-as-new');

    expect(mockActivities.autoPost).toHaveBeenCalledTimes(24);
    expect(mockActivities.autoPost).toHaveBeenCalledWith('autopost-1');
    expect(sleep).toHaveBeenCalledTimes(23);
    expect(sleep).toHaveBeenCalledWith(3600000);
    expect(continueAsNew).toHaveBeenCalledWith({
      id: 'autopost-1',
      immediately: true,
    });
  });
});

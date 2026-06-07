import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockActivities } = vi.hoisted(() => ({
  mockActivities: {
    getIntegrationsById: vi.fn(),
    refreshToken: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: vi.fn(() => mockActivities),
  sleep: vi.fn().mockResolvedValue(undefined),
  continueAsNew: vi.fn().mockRejectedValue(new Error('continue-as-new')),
}));

import { continueAsNew, sleep } from '@temporalio/workflow';
import { refreshTokenWorkflow } from './refresh.token.workflow';

const activeIntegration = (tokenExpiration: Date) => ({
  id: 'integration-1',
  organizationId: 'org-1',
  tokenExpiration,
  deletedAt: null as Date | null,
  inBetweenSteps: false,
  refreshNeeded: false,
});

describe('refreshTokenWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-06T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caps long sleeps at 30 days and continues as new before refreshing', async () => {
    mockActivities.getIntegrationsById.mockResolvedValue(
      activeIntegration(new Date('2026-08-05T00:00:00.000Z'))
    );

    await expect(
      refreshTokenWorkflow({ organizationId: 'org-1', integrationId: 'integration-1' })
    ).rejects.toThrow('continue-as-new');

    expect(sleep).toHaveBeenCalledWith(30 * 24 * 60 * 60 * 1000);
    expect(mockActivities.refreshToken).not.toHaveBeenCalled();
    expect(continueAsNew).toHaveBeenCalledWith({
      organizationId: 'org-1',
      integrationId: 'integration-1',
    });
  });

  it('refreshes due tokens and continues as new after the refresh', async () => {
    const integration = activeIntegration(new Date('2026-06-06T01:00:00.000Z'));
    mockActivities.getIntegrationsById
      .mockResolvedValueOnce(integration)
      .mockResolvedValueOnce(integration);

    await expect(
      refreshTokenWorkflow({ organizationId: 'org-1', integrationId: 'integration-1' })
    ).rejects.toThrow('continue-as-new');

    expect(sleep).toHaveBeenCalledWith(60 * 60 * 1000);
    expect(mockActivities.refreshToken).toHaveBeenCalledWith(integration);
    expect(continueAsNew).toHaveBeenCalledWith({
      organizationId: 'org-1',
      integrationId: 'integration-1',
    });
  });
});

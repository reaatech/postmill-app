import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}));

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { createRefreshToken } from './refresh-token';
import { createMockStep, captureFunctionHandler } from '../test/step.mock';

describe('createRefreshToken', () => {
  let integrationsActivity: {
    getIntegrationsById: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };
  let getHandler: () => any;

  beforeEach(() => {
    vi.clearAllMocks();

    integrationsActivity = {
      getIntegrationsById: vi.fn(),
      refreshToken: vi.fn().mockResolvedValue(undefined),
    };

    getHandler = captureFunctionHandler(vi.mocked(inngest.createFunction));
    createRefreshToken(integrationsActivity as any);
  });

  it('registers an integration/refresh-token event handler with cancelOn', () => {
    expect(inngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'refresh-token',
        cancelOn: [
          {
            event: 'integration/refresh-token/cancel',
            if: 'async.data.integrationId == event.data.integrationId',
          },
        ],
      }),
      { event: 'integration/refresh-token' },
      expect.any(Function)
    );
  });

  it('gets the integration, sleeps until expiry, rechecks, refreshes, and re-emits', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    integrationsActivity.getIntegrationsById
      .mockResolvedValueOnce({
        id: 'int-1',
        tokenExpiration: future,
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'int-1',
        tokenExpiration: future,
        deletedAt: null,
      });

    const step = createMockStep();
    const event = {
      data: { integrationId: 'int-1', organizationId: 'org-1' },
    };

    await getHandler()({ step, event });

    expect(step.run).toHaveBeenCalledWith('get', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('recheck', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('refresh', expect.any(Function));
    expect(integrationsActivity.refreshToken).toHaveBeenCalled();
    expect(step.sleep).toHaveBeenCalledWith('sleep-until-expiry', expect.any(Number));
    expect(step.sendEvent).toHaveBeenCalledWith('integration/refresh-token', {
      name: 'integration/refresh-token',
      data: { integrationId: 'int-1', organizationId: 'org-1' },
      id: 'refresh_int-1',
    });
  });

  it('returns early when the integration is missing or deleted', async () => {
    integrationsActivity.getIntegrationsById.mockResolvedValue(null);

    const step = createMockStep();
    const event = {
      data: { integrationId: 'int-1', organizationId: 'org-1' },
    };

    await getHandler()({ step, event });

    expect(step.sleep).not.toHaveBeenCalled();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});

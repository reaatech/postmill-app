import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefreshIntegrationService } from './refresh.integration.service';

const mockAuthTokenDetails = {
  id: 'auth-1',
  name: 'X Account',
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  expiresIn: 3600,
  username: '@user',
  picture: 'https://example.com/pic.jpg',
};

const mockIntegration = {
  id: 'integration-1',
  organizationId: 'org-1',
  providerIdentifier: 'x',
  name: 'My X Account',
  picture: 'https://example.com/avatar.png',
  internalId: 'internal-1',
  rootInternalId: 'internal-1',
  refreshToken: 'old-refresh-token',
  createdAt: new Date(),
  updatedAt: new Date(),
};

let mockRefreshToken: ReturnType<typeof vi.fn>;
let mockWorkflowStart: ReturnType<typeof vi.fn>;
let mockIntegrationManager: any;
let mockIntegrationService: any;
let mockTemporalService: any;

vi.mock('./integration.manager', () => ({
  IntegrationManager: vi.fn(() => mockIntegrationManager),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: vi.fn(() => mockIntegrationService),
}));

vi.mock('nestjs-temporal-core', () => ({
  TemporalService: vi.fn(() => mockTemporalService),
}));

describe('RefreshIntegrationService', () => {
  let service: RefreshIntegrationService;

  beforeEach(() => {
    mockRefreshToken = vi.fn().mockResolvedValue(mockAuthTokenDetails);
    mockIntegrationService = {
      createOrUpdateIntegration: vi.fn().mockResolvedValue({}),
      setBetweenRefreshSteps: vi.fn().mockResolvedValue(undefined),
      informAboutRefreshError: vi.fn().mockResolvedValue(undefined),
      refreshNeeded: vi.fn().mockResolvedValue(undefined),
      disconnectChannel: vi.fn().mockResolvedValue(undefined),
    };
    mockIntegrationManager = {
      getSocialIntegration: vi.fn().mockReturnValue({
        identifier: 'x',
        name: 'X',
        refreshToken: mockRefreshToken,
        reConnect: undefined,
        refreshCron: true,
        oneTimeToken: false,
      }),
    };
    mockWorkflowStart = vi.fn().mockResolvedValue({ workflowId: 'refresh_integration-1' });
    mockTemporalService = {
      client: {
        getRawClient: vi.fn(() => ({
          workflow: { start: mockWorkflowStart },
        })),
      },
    };
    service = new RefreshIntegrationService(
      mockIntegrationManager as any,
      mockIntegrationService as any,
      mockTemporalService as any,
    );
  });

  describe('refresh', () => {
    it('successfully refreshes token and updates integration', async () => {
      const result = await service.refresh(mockIntegration as any);
      expect(mockIntegrationManager.getSocialIntegration).toHaveBeenCalledWith('x');
      expect(mockRefreshToken).toHaveBeenCalledWith('old-refresh-token');
      expect(mockIntegrationService.createOrUpdateIntegration).toHaveBeenCalledWith(
        undefined,
        false,
        'org-1',
        'My X Account',
        'https://example.com/avatar.png',
        'social',
        'internal-1',
        'x',
        'new-access-token',
        'new-refresh-token',
        3600,
      );
      expect(result).toEqual(mockAuthTokenDetails);
    });

    it('returns false when refreshProcess returns false', async () => {
      mockRefreshToken.mockRejectedValue(new Error('API error'));
      const result = await service.refresh(mockIntegration as any);
      expect(result).toBe(false);
    });

    it('passes cause to refreshProcess on failure', async () => {
      mockRefreshToken.mockRejectedValue(new Error('fail'));
      const result = await service.refresh(mockIntegration as any, 'token_expired');
      expect(result).toBe(false);
      expect(mockIntegrationService.refreshNeeded).toHaveBeenCalled();
    });
  });

  describe('setBetweenSteps', () => {
    it('calls setBetweenRefreshSteps and informAboutRefreshError', async () => {
      await service.setBetweenSteps(mockIntegration as any, 'error cause');
      expect(mockIntegrationService.setBetweenRefreshSteps).toHaveBeenCalledWith('integration-1');
      expect(mockIntegrationService.informAboutRefreshError).toHaveBeenCalledWith(
        'org-1',
        mockIntegration,
        'error cause',
      );
    });
  });

  describe('startRefreshWorkflow', () => {
    it('starts Temporal workflow when refreshCron is true', async () => {
      const result = await service.startRefreshWorkflow('org-1', 'integration-1', mockIntegrationManager.getSocialIntegration());
      expect(mockWorkflowStart).toHaveBeenCalledWith('refreshTokenWorkflow', {
        workflowId: 'refresh_integration-1',
        args: [{ integrationId: 'integration-1', organizationId: 'org-1' }],
        taskQueue: 'main',
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
      });
      expect(result).toEqual({ workflowId: 'refresh_integration-1' });
    });

    it('returns false when refreshCron is false', async () => {
      const result = await service.startRefreshWorkflow('org-1', 'integration-1', { refreshCron: false } as any);
      expect(result).toBe(false);
    });

    it('returns false when refreshCron is undefined', async () => {
      const result = await service.startRefreshWorkflow('org-1', 'integration-1', {} as any);
      expect(result).toBe(false);
    });

    it('handles missing raw client gracefully', async () => {
      mockTemporalService.client.getRawClient.mockReturnValue(undefined);
      const result = await service.startRefreshWorkflow('org-1', 'integration-1', mockIntegrationManager.getSocialIntegration());
      expect(result).toBeUndefined();
    });
  });

  describe('refreshProcess (via refresh)', () => {
    it('returns refresh directly when rootInternalId equals internalId', async () => {
      const result = await service.refresh(mockIntegration as any);
      expect(result).toEqual(mockAuthTokenDetails);
      expect(mockIntegrationService.createOrUpdateIntegration).toHaveBeenCalled();
    });

    it('calls reConnect when reConnect exists and rootInternalId differs', async () => {
      const reConnectResult = { id: 'reconnected-id', name: 'Reconnected', accessToken: 're-token', username: '@re' };
      mockIntegrationManager.getSocialIntegration.mockReturnValue({
        identifier: 'x',
        refreshToken: mockRefreshToken,
        reConnect: vi.fn().mockResolvedValue(reConnectResult),
        oneTimeToken: false,
      });
      const integrationWithDiffRoot = { ...mockIntegration, rootInternalId: 'root-1', internalId: 'child-1' };
      const result = await service.refresh(integrationWithDiffRoot as any);
      const provider = mockIntegrationManager.getSocialIntegration();
      expect(provider.reConnect).toHaveBeenCalledWith('root-1', 'child-1', 'new-access-token');
      expect(result).toMatchObject({ ...mockAuthTokenDetails, ...reConnectResult });
    });

    it('triggers disconnect chain when refresh returns no accessToken', async () => {
      mockRefreshToken.mockResolvedValue({ ...mockAuthTokenDetails, accessToken: '' });
      const result = await service.refresh(mockIntegration as any);
      expect(result).toBe(false);
      expect(mockIntegrationService.refreshNeeded).toHaveBeenCalled();
      expect(mockIntegrationService.informAboutRefreshError).toHaveBeenCalled();
      expect(mockIntegrationService.disconnectChannel).toHaveBeenCalled();
    });

    it('triggers disconnect chain when refresh returns false', async () => {
      mockRefreshToken.mockResolvedValue(false);
      const result = await service.refresh(mockIntegration as any);
      expect(result).toBe(false);
      expect(mockIntegrationService.disconnectChannel).toHaveBeenCalled();
    });
  });
});

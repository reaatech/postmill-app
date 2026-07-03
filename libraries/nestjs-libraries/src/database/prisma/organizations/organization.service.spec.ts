import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRepo = {
  markSetupCompleted: vi.fn(),
};

const mockOrgAiSettingsService = {
  getActiveProvider: vi.fn(),
};

vi.mock('./organization.repository', () => ({
  OrganizationRepository: vi.fn(() => mockRepo),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.service', () => ({
  OrgAiSettingsService: vi.fn(() => mockOrgAiSettingsService),
}));

vi.mock('@gitroom/nestjs-libraries/database/prisma/notifications/notification.service', () => ({
  NotificationService: vi.fn(() => ({ hasEmailProvider: vi.fn(() => false) })),
}));

import { OrganizationService } from './organization.service';

describe('OrganizationService.completeSetup', () => {
  let service: OrganizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrganizationService(mockRepo as any, {} as any, mockOrgAiSettingsService as any);
  });

  it('throws BadRequestException when no active LLM provider exists', async () => {
    mockOrgAiSettingsService.getActiveProvider.mockResolvedValue(null);

    await expect(service.completeSetup('org-1')).rejects.toThrow('active LLM provider is required');
    expect(mockRepo.markSetupCompleted).not.toHaveBeenCalled();
  });

  it('marks setup completed when an active LLM provider exists', async () => {
    mockOrgAiSettingsService.getActiveProvider.mockResolvedValue({ identifier: 'openai' });
    mockRepo.markSetupCompleted.mockResolvedValue({ id: 'org-1', setupCompletedAt: new Date() });

    const result = await service.completeSetup('org-1');

    expect(mockRepo.markSetupCompleted).toHaveBeenCalledWith('org-1');
    expect(result.setupCompletedAt).toBeInstanceOf(Date);
  });
});

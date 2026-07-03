import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOrganizationRepo = {
  organization: {
    update: vi.fn(),
  },
};

const mockPrismaRepository = (model: any) => ({ model });

import { OrganizationRepository } from './organization.repository';

describe('OrganizationRepository.markSetupCompleted', () => {
  let repository: OrganizationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new OrganizationRepository(
      mockPrismaRepository(mockOrganizationRepo) as any,
      mockPrismaRepository({}) as any,
      mockPrismaRepository({}) as any,
      mockPrismaRepository({}) as any,
      mockPrismaRepository({}) as any
    );
  });

  it('sets setupCompletedAt to a non-null timestamp', async () => {
    const now = new Date();
    mockOrganizationRepo.organization.update.mockResolvedValue({
      id: 'org-1',
      setupCompletedAt: now,
    });

    const result = await repository.markSetupCompleted('org-1');

    expect(mockOrganizationRepo.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { setupCompletedAt: expect.any(Date) },
    });
    expect(result.setupCompletedAt).toEqual(now);
  });

  it('is idempotent on repeat calls', async () => {
    mockOrganizationRepo.organization.update.mockResolvedValue({
      id: 'org-1',
      setupCompletedAt: new Date(),
    });

    await repository.markSetupCompleted('org-1');
    await repository.markSetupCompleted('org-1');

    expect(mockOrganizationRepo.organization.update).toHaveBeenCalledTimes(2);
  });
});

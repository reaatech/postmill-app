import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: vi.fn(function () {
    return { model: {} };
  }),
}));

import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { IntegrationRepository } from './integration.repository';

describe('IntegrationRepository', () => {
  let repository: IntegrationRepository;
  let mockIntegration: Record<string, ReturnType<typeof vi.fn>>;
  let mockPosts: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIntegration = {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: 'int-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };

    mockPosts = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };

    const integrationRepo = new (PrismaRepository as any)();
    integrationRepo.model = { integration: mockIntegration };

    const postsRepo = new (PrismaRepository as any)();
    postsRepo.model = { post: mockPosts };

    const plugsRepo = new (PrismaRepository as any)();
    plugsRepo.model = { plugs: {} };

    const customersRepo = new (PrismaRepository as any)();
    customersRepo.model = { customer: {} };

    const mentionsRepo = new (PrismaRepository as any)();
    mentionsRepo.model = { mentions: {} };

    repository = new IntegrationRepository(
      integrationRepo,
      postsRepo,
      plugsRepo,
      customersRepo,
      mentionsRepo
    );
  });

  describe('updateIntegration', () => {
    it('soft-deletes posts scoped to the organization when the integration is found', async () => {
      mockIntegration.findUnique.mockResolvedValue({ id: 'existing-id' });

      await repository.updateIntegration('int-1', {
        organizationId: 'org-1',
        internalId: 'internal-1',
      });

      expect(mockPosts.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            integrationId: 'int-1',
            organizationId: 'org-1',
          }),
          data: { deletedAt: expect.any(Date) },
        })
      );
    });

    it('does not soft-delete posts for a cross-org integration lookup', async () => {
      mockIntegration.findUnique.mockResolvedValue(null);

      await repository.updateIntegration('int-1', {
        organizationId: 'org-2',
        internalId: 'internal-1',
      });

      expect(mockPosts.updateMany).not.toHaveBeenCalled();
    });
  });
});

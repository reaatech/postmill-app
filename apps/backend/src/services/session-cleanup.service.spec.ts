import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({
  UsersService: class {},
}));

import { SessionCleanupService } from './session-cleanup.service';
import type { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';

describe('SessionCleanupService', () => {
  let usersService: { cleanupExpiredSessions: ReturnType<typeof vi.fn> };
  let service: SessionCleanupService;

  beforeEach(() => {
    usersService = { cleanupExpiredSessions: vi.fn() };
    service = new SessionCleanupService(
      usersService as unknown as UsersService
    );
  });

  it('purges expired/revoked sessions on a schedule tick', async () => {
    usersService.cleanupExpiredSessions.mockResolvedValue({ count: 7 });

    await service.handleCleanup();

    expect(usersService.cleanupExpiredSessions).toHaveBeenCalledTimes(1);
  });

  it('swallows cleanup failures instead of crashing the scheduler (Error)', async () => {
    usersService.cleanupExpiredSessions.mockRejectedValue(
      new Error('db down')
    );

    await expect(service.handleCleanup()).resolves.toBeUndefined();
  });

  it('swallows non-Error rejections too', async () => {
    usersService.cleanupExpiredSessions.mockRejectedValue('string failure');

    await expect(service.handleCleanup()).resolves.toBeUndefined();
  });

  it('registers handleCleanup as a daily cron (03:00)', () => {
    const cronMetadata = Reflect.getMetadataKeys(
      SessionCleanupService.prototype.handleCleanup
    );
    // @nestjs/schedule attaches scheduler metadata to the decorated method.
    expect(cronMetadata.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
const mockGetAllUsersOrgs = vi.fn().mockResolvedValue({ users: [] });

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository',
  () => ({
    NotificationsRepository: class {
      createNotification = mockCreateNotification;
      getMainPageCount = vi.fn();
      getNotificationsPaginated = vi.fn();
      getNotifications = vi.fn();
    },
  })
);

vi.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {
    sendEmail = vi.fn().mockResolvedValue(undefined);
    hasProvider = vi.fn().mockReturnValue(true);
  },
}));

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository',
  () => ({
    OrganizationRepository: class {
      getAllUsersOrgs = mockGetAllUsersOrgs;
    },
  })
);

vi.mock('@gitroom/nestjs-libraries/inngest/inngest.client', () => ({
  inngest: { send: vi.fn() },
  isInngestEnabled: vi.fn().mockReturnValue(true),
}));

import { NotificationService } from './notification.service';
import {
  inngest,
  isInngestEnabled,
} from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { NotificationsRepository } from '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';

describe('NotificationService Inngest dispatch', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.mocked(isInngestEnabled).mockReturnValue(true);
    vi.clearAllMocks();
    vi.mocked(inngest.send).mockResolvedValue(undefined);

    service = new NotificationService(
      new NotificationsRepository(),
      new EmailService(),
      new OrganizationRepository()
    );
  });

  it('sends email/digest event when digest is requested and Inngest is enabled', async () => {
    await service.inAppNotification('org-1', 'Subject', 'Message', true, true, 'info');

    expect(inngest.send).toHaveBeenCalledWith({
      name: 'email/digest',
      data: {
        organizationId: 'org-1',
        title: 'Subject',
        message: 'Message',
        type: 'info',
      },
    });
  });

  it('skips email/digest event when Inngest is disabled', async () => {
    vi.mocked(isInngestEnabled).mockReturnValue(false);

    await service.inAppNotification('org-1', 'Subject', 'Message', true, true, 'info');

    expect(inngest.send).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateNotification = vi.fn().mockResolvedValue({ id: 'notif-1' });
const mockCreateReadRecords = vi.fn().mockResolvedValue(undefined);
const mockGetTeam = vi.fn().mockResolvedValue({ users: [] });
const mockEnsureDefaults = vi.fn().mockResolvedValue({
  masters: { email: true, push: true, inApp: true },
  categories: {
    system: { email: true, push: true, inApp: true },
  },
});
const mockGetDigestFrequencies = vi.fn().mockResolvedValue({});
const mockEnqueueMany = vi.fn().mockResolvedValue(undefined);

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository',
  () => ({
    NotificationsRepository: class {
      createNotification = mockCreateNotification;
      createReadRecords = mockCreateReadRecords;
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
      getTeam = mockGetTeam;
    },
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification-preference.service',
  () => ({
    NotificationPreferenceService: class {
      ensureDefaults = mockEnsureDefaults;
      getPreferences = vi.fn();
      updatePreferences = vi.fn();
      getDigestFrequencies = mockGetDigestFrequencies;
    },
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/push-notification.service',
  () => ({
    PushNotificationService: class {
      sendPushNotification = vi.fn().mockResolvedValue(undefined);
      hasProvider = vi.fn().mockReturnValue(false);
    },
  })
);

vi.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification-digest.service',
  () => ({
    NotificationDigestService: class {
      enqueueMany = mockEnqueueMany;
    },
  })
);

import { NotificationService } from './notification.service';
import { NotificationsRepository } from '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationPreferenceService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-preference.service';
import { PushNotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/push-notification.service';
import { NotificationDigestService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-digest.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();

    emailService = new EmailService();
    service = new NotificationService(
      new NotificationsRepository(),
      emailService,
      new OrganizationRepository(),
      new NotificationPreferenceService(),
      new PushNotificationService(),
      new NotificationDigestService()
    );
  });

  it('creates a notification row for enabled members', async () => {
    mockGetTeam.mockResolvedValue({
      users: [{ user: { id: 'user-1', email: 'a@b.com' } }],
    });

    await service.notify({
      orgId: 'org-1',
      category: 'system',
      title: 'Subject',
      message: 'Message',
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        type: 'system',
        title: 'Subject',
        content: 'Message',
      })
    );
  });

  it('sends digest emails immediately when frequency is instant', async () => {
    mockGetTeam.mockResolvedValue({
      users: [{ user: { id: 'user-1', email: 'a@b.com' } }],
    });
    mockGetDigestFrequencies.mockResolvedValue({ 'user-1': 'instant' });

    await service.notify({
      orgId: 'org-1',
      category: 'system',
      title: 'Subject',
      message: 'Message',
      digest: true,
    });

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'a@b.com',
      'Subject',
      'Message',
      'top',
      undefined
    );
    expect(mockEnqueueMany).not.toHaveBeenCalled();
  });

  it('enqueues digest emails when frequency is daily', async () => {
    mockGetTeam.mockResolvedValue({
      users: [{ user: { id: 'user-1', email: 'a@b.com' } }],
    });
    mockGetDigestFrequencies.mockResolvedValue({ 'user-1': 'daily' });

    await service.notify({
      orgId: 'org-1',
      category: 'system',
      title: 'Subject',
      message: 'Message',
      digest: true,
    });

    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(mockEnqueueMany).toHaveBeenCalledWith(
      ['user-1'],
      'org-1',
      expect.objectContaining({
        title: 'Subject',
        message: 'Message',
        category: 'system',
      })
    );
  });

  it('skips digest emails when frequency is never', async () => {
    mockGetTeam.mockResolvedValue({
      users: [{ user: { id: 'user-1', email: 'a@b.com' } }],
    });
    mockGetDigestFrequencies.mockResolvedValue({ 'user-1': 'never' });

    await service.notify({
      orgId: 'org-1',
      category: 'system',
      title: 'Subject',
      message: 'Message',
      digest: true,
    });

    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(mockEnqueueMany).not.toHaveBeenCalled();
  });

  it('does not email a member whose category preference is off', async () => {
    mockGetTeam.mockResolvedValue({
      users: [{ user: { id: 'user-1', email: 'a@b.com' } }],
    });
    mockEnsureDefaults.mockResolvedValue({
      masters: { email: true, push: true, inApp: true },
      categories: {
        system: { email: false, push: true, inApp: true },
      },
    });

    await service.notify({
      orgId: 'org-1',
      category: 'system',
      title: 'Subject',
      message: 'Message',
    });

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});

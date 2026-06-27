import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DigestActivity } from './digest.activity';
import { NotificationDigestService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-digest.service';
import { NotificationPreferenceService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-preference.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';

describe('DigestActivity', () => {
  let activity: DigestActivity;
  let digestService: NotificationDigestService;
  let preferenceService: NotificationPreferenceService;
  let emailService: EmailService;

  beforeEach(() => {
    digestService = {
      getPendingForUser: vi.fn(),
      deleteByIds: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationDigestService;

    preferenceService = {
      getPreferencesByDigestFrequency: vi.fn(),
    } as unknown as NotificationPreferenceService;

    emailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;

    activity = new DigestActivity(digestService, preferenceService, emailService);
  });

  it('sends pending digests to users with the matching frequency', async () => {
    vi.mocked(preferenceService.getPreferencesByDigestFrequency).mockResolvedValue([
      { userId: 'user-1', user: { email: 'a@b.com' } },
      { userId: 'user-2', user: { email: 'c@d.com' } },
    ]);

    vi.mocked(digestService.getPendingForUser).mockImplementation(async (userId: string) => {
      if (userId === 'user-1') {
        return [
          { id: 'q-1', title: 'T1', message: 'M1', html: null, category: 'comment', createdAt: new Date() },
        ] as any;
      }
      return [];
    });

    const result = await activity.sendPendingDigests('daily');

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'a@b.com',
      '[Postmill] Daily digest',
      '<p><strong>T1</strong><br/>M1</p>',
      'top'
    );
    expect(digestService.deleteByIds).toHaveBeenCalledWith(['q-1']);
  });

  it('uses html when present', async () => {
    vi.mocked(preferenceService.getPreferencesByDigestFrequency).mockResolvedValue([
      { userId: 'user-1', user: { email: 'a@b.com' } },
    ]);
    vi.mocked(digestService.getPendingForUser).mockResolvedValue([
      { id: 'q-1', title: 'T1', message: 'M1', html: '<h1>Rich</h1>', category: 'comment', createdAt: new Date() },
    ] as any);

    await activity.sendPendingDigests('weekly');

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'a@b.com',
      '[Postmill] Weekly digest',
      '<h1>Rich</h1>',
      'top'
    );
  });

  it('counts failures without stopping', async () => {
    vi.mocked(preferenceService.getPreferencesByDigestFrequency).mockResolvedValue([
      { userId: 'user-1', user: { email: 'a@b.com' } },
    ]);
    vi.mocked(digestService.getPendingForUser).mockRejectedValue(new Error('db down'));

    const result = await activity.sendPendingDigests('daily');

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});

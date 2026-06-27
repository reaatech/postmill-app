import { Injectable } from '@nestjs/common';
import { NotificationDigestService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-digest.service';
import { NotificationPreferenceService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification-preference.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { DigestFrequency } from '@gitroom/nestjs-libraries/dtos/notifications/notification-preference.dto';

@Injectable()
export class DigestActivity {
  constructor(
    private _digestService: NotificationDigestService,
    private _preferenceService: NotificationPreferenceService,
    private _emailService: EmailService,
  ) {}

  async sendPendingDigests(frequency: Extract<DigestFrequency, 'daily' | 'weekly'>): Promise<{
    sent: number;
    failed: number;
  }> {
    const rows = await this._preferenceService.getPreferencesByDigestFrequency(frequency);

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const pending = await this._digestService.getPendingForUser(row.userId);
        if (pending.length === 0) continue;

        const body = pending
          .map((item) => item.html || `<p><strong>${item.title}</strong><br/>${item.message}</p>`)
          .join('');

        await this._emailService.sendEmail(
          row.user.email,
          `[Postmill] ${frequency === 'daily' ? 'Daily' : 'Weekly'} digest`,
          body,
          'top'
        );

        await this._digestService.deleteByIds(pending.map((p) => p.id));
        sent++;
      } catch (err) {
        failed++;
      }
    }

    return { sent, failed };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private _usersService: UsersService) {}

  @Cron('0 3 * * *')
  async handleCleanup() {
    try {
      const result = await this._usersService.cleanupExpiredSessions();
      this.logger.log(`Cleaned up ${result.count} expired/revoked sessions`);
    } catch (err) {
      this.logger.error('Session cleanup failed', err instanceof Error ? err.message : String(err));
    }
  }
}

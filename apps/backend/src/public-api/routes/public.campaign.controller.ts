import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CampaignReportService } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaign-report.service';

@Controller('/public/campaign-report')
export class PublicCampaignController {
  constructor(
    private _reportService: CampaignReportService,
  ) {}

  @Get('/:token')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getSharedReport(@Param('token') token: string) {
    try {
      return await this._reportService.toPublicJson(token);
    } catch {
      throw new NotFoundException();
    }
  }
}

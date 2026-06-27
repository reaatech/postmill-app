import { Injectable } from '@nestjs/common';
import { CampaignItemRepository } from '@gitroom/nestjs-libraries/database/prisma/campaigns/campaign-item.repository';

@Injectable()
export class CampaignActivity {
  constructor(private _campaignItems: CampaignItemRepository) {}

  async purgeExpiredItems(days: number): Promise<{ deleted: number }> {
    const result = await this._campaignItems.deleteExpired(days, new Date());
    return { deleted: result.count };
  }
}

import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { CampaignActivity } from '@gitroom/nestjs-libraries/inngest/activities/campaign.activity';

function getPurgeDays(): number {
  const raw = process.env.CAMPAIGN_PURGE_DAYS;
  if (!raw) return 30;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 1 ? 30 : parsed;
}

export const createCampaignTagPurge = (campaignActivity: CampaignActivity) =>
  inngest.createFunction(
    { id: 'campaign-tag-purge' },
    { cron: 'TZ=UTC 0 3 * * *' },
    async ({ step }) => {
      const days = getPurgeDays();
      const result = await step.run('purge-expired-campaign-tags', () =>
        campaignActivity.purgeExpiredItems(days)
      );
      return { ...result, days };
    }
  );

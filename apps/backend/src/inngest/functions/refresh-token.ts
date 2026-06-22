import { inngest } from '@gitroom/nestjs-libraries/inngest/inngest.client';
import { IntegrationsActivity } from '@gitroom/nestjs-libraries/inngest/activities/integrations.activity';

export const createRefreshToken = (integrationsActivity: IntegrationsActivity) =>
  inngest.createFunction(
    {
      id: 'refresh-token',
      cancelOn: [
        {
          event: 'integration/refresh-token/cancel',
          if: 'async.data.integrationId == event.data.integrationId',
        },
      ],
    },
    { event: 'integration/refresh-token' },
    async ({ step, event }) => {
      const { integrationId, organizationId } = event.data;

      const integration = await step.run('get', () =>
        integrationsActivity.getIntegrationsById(integrationId, organizationId)
      );

      if (!integration || integration.deletedAt) {
        return;
      }

      const expiresIn = Math.max(
        0,
        new Date(integration.tokenExpiration).getTime() - Date.now()
      );
      if (!expiresIn) {
        return;
      }

      const sleepTime = Math.min(expiresIn, 30 * 24 * 60 * 60 * 1000);
      await step.sleep('sleep-until-expiry', sleepTime);

      const fresh = await step.run('recheck', () =>
        integrationsActivity.getIntegrationsById(integrationId, organizationId)
      );
      if (!fresh || fresh.deletedAt) {
        return;
      }

      await step.run('refresh', () =>
        integrationsActivity.refreshToken(fresh as any)
      );

      await step.sendEvent('integration/refresh-token', {
        name: 'integration/refresh-token',
        data: { integrationId, organizationId },
        id: `refresh_${integrationId}`,
      });
    }
  );

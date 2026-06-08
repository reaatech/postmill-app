import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';

const { getIntegrationsById, refreshToken } =
  proxyActivities<IntegrationsActivity>({
    startToCloseTimeout: '10 minute',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });

const MAX_SLEEP_MS = 30 * 24 * 60 * 60 * 1000;

export async function refreshTokenWorkflow({
  organizationId,
  integrationId,
}: {
  integrationId: string;
  organizationId: string;
}) {
  while (true) {
    let integration = await getIntegrationsById(integrationId, organizationId);
    if (
      !integration ||
      integration.deletedAt ||
      integration.inBetweenSteps ||
      integration.refreshNeeded
    ) {
      return false;
    }

    const today = new Date();
    const endDate = new Date(integration.tokenExpiration);

    const minMax = Math.max(0, endDate.getTime() - today.getTime());
    if (!minMax) {
      return false;
    }

    await sleep(Math.min(minMax, MAX_SLEEP_MS));

    if (minMax > MAX_SLEEP_MS) {
      await continueAsNew({ organizationId, integrationId });
    }

    // while we were sleeping, the integration might have been deleted
    integration = await getIntegrationsById(integrationId, organizationId);
    if (
      !integration ||
      integration.deletedAt ||
      integration.inBetweenSteps ||
      integration.refreshNeeded
    ) {
      return false;
    }

    await refreshToken(integration);
    await continueAsNew({ organizationId, integrationId });
  }
}

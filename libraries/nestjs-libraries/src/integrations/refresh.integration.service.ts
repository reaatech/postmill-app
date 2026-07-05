import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Integration } from '@prisma/client';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  AuthTokenDetails,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  inngest,
  isInngestEnabled,
} from '@gitroom/nestjs-libraries/inngest/inngest.client';

@Injectable()
export class RefreshIntegrationService {
  constructor(
    private _integrationManager: IntegrationManager,
    @Inject(forwardRef(() => IntegrationService))
    private _integrationService: IntegrationService
  ) {}
  async refresh(
    integration: Integration,
    cause = ''
  ): Promise<false | AuthTokenDetails> {
    const socialProvider =
      this._integrationManager.getSocialIntegrationUnchecked(
        integration.providerIdentifier,
        // 4.13: pin the row's stored version so a retired adapter stops
        // refreshing (no silent 410 bypass) once a social v2 ships.
        integration.providerVersion ?? undefined
      );

    const refresh = await this.refreshProcess(
      integration,
      socialProvider,
      cause
    );

    if (!refresh) {
      return false as const;
    }

    await this._integrationService.createOrUpdateIntegration(
      undefined,
      !!socialProvider.oneTimeToken,
      integration.organizationId,
      integration.name,
      integration.picture!,
      'social',
      integration.internalId,
      integration.providerIdentifier,
      refresh.accessToken,
      refresh.refreshToken,
      refresh.expiresIn
    );

    return refresh;
  }

  public async setBetweenSteps(integration: Integration, cause = '') {
    await this._integrationService.setBetweenRefreshSteps(integration.id);
    await this._integrationService.informAboutRefreshError(
      integration.organizationId,
      integration,
      cause
    );
  }

  public async startRefreshWorkflow(
    orgId: string,
    id: string,
    integration: SocialProvider
  ) {
    if (!integration.refreshCron) {
      return false;
    }

    if (!isInngestEnabled()) {
      Logger.debug(
        `Skipping integration/refresh-token event for ${id} — Inngest is disabled`
      );
      return false;
    }

    return inngest.send({
      name: 'integration/refresh-token',
      data: { integrationId: id, organizationId: orgId },
      id: `refresh_${id}`,
    });
  }

  private async refreshProcess(
    integration: Integration,
    socialProvider: SocialProvider,
    cause = ''
  ): Promise<AuthTokenDetails | false> {
    const clientInformation = await this._integrationManager.requireClientInformation(
      integration.providerIdentifier,
      integration.organizationId,
      integration.providerConfigId
    ).catch(() => undefined);

    const refresh: false | AuthTokenDetails = await socialProvider
      .refreshToken(integration.refreshToken, clientInformation)
      .catch((err) => false);

    if (!refresh || !refresh.accessToken) {
      await this._integrationService.refreshNeeded(
        integration.organizationId,
        integration.id
      );

      await this._integrationService.informAboutRefreshError(
        integration.organizationId,
        integration,
        cause
      );

      await this._integrationService.disconnectChannel(
        integration.organizationId,
        integration
      );

      return false;
    }

    if (
      !socialProvider.reConnect ||
      integration.rootInternalId === integration.internalId
    ) {
      return refresh;
    }

    const reConnect = await socialProvider.reConnect(
      integration.rootInternalId,
      integration.internalId,
      refresh.accessToken
    );

    return {
      ...refresh,
      ...reConnect,
    };
  }
}

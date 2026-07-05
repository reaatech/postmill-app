import { Injectable, Logger } from '@nestjs/common';
import { OrgMediaProviderSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.repository';
import { OrgAiSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';

// §11.4 auto-config live-link: OpenAI and MiniMax are both AI providers and media
// providers and share one API key. Configuring (or re-keying) either surface updates
// both rows — single credential source. The media row keeps its own storage binding
// (the upsert only touches credentials/enabled). Depends only on the two repositories,
// so the AI- and media-settings services can both inject it without a DI cycle.
const LINKED_PROVIDERS = new Set(['openai', 'minimax']);

@Injectable()
export class ProviderCredentialLinkService {
  private readonly _logger = new Logger(ProviderCredentialLinkService.name);

  constructor(
    private _mediaRepository: OrgMediaProviderSettingsRepository,
    private _aiRepository: OrgAiSettingsRepository,
    private _encryption: EncryptionService,
    private _resolution: ProviderResolutionService,
  ) {}

  isLinked(identifier: string): boolean {
    return LINKED_PROVIDERS.has(identifier);
  }

  // 1.4: resolve the pinned version for the mirror-target row the same way the
  // owning settings services do — the target row's stored version, else the
  // latest active version, else v1. Hardcoding v1 would split rows (mirror at v1,
  // primary at v2) the moment a linked provider ships v2.
  private async _pinnedMediaVersion(orgId: string, identifier: string): Promise<string> {
    const existing = await this._mediaRepository.getByIdentifier(orgId, identifier);
    return (
      existing?.version ??
      this._resolution.latestActiveVersion('media', identifier) ??
      'v1'
    );
  }

  private async _pinnedAiVersion(orgId: string, identifier: string): Promise<string> {
    const existing = await this._aiRepository.getByIdentifier(orgId, identifier);
    return (
      existing?.version ??
      this._resolution.latestActiveVersion('ai', identifier) ??
      'v1'
    );
  }

  // AI provider configured/re-keyed → mirror credentials onto the media config.
  async syncFromAiProvider(
    orgId: string,
    identifier: string,
    credentials: Record<string, string>,
  ): Promise<void> {
    if (!this.isLinked(identifier)) return;
    try {
      const version = await this._pinnedMediaVersion(orgId, identifier);
      await this._mediaRepository.upsert(
        orgId,
        identifier,
        {
          enabled: true,
          credentials: this._encryption.encrypt(JSON.stringify(credentials)),
        },
        version,
      );
    } catch (err) {
      // Non-fatal: the primary surface's save must not fail because of the mirror.
      this._logger.warn(
        `Failed to mirror AI credentials to media config for ${identifier}: ${(err as Error).message}`,
      );
    }
  }

  // Media provider configured/re-keyed → mirror credentials onto the AI config.
  async syncFromMediaProvider(
    orgId: string,
    identifier: string,
    credentials: Record<string, string>,
  ): Promise<void> {
    if (!this.isLinked(identifier)) return;
    try {
      const version = await this._pinnedAiVersion(orgId, identifier);
      await this._aiRepository.upsert(
        orgId,
        identifier,
        {
          enabled: true,
          credentials: this._encryption.encrypt(JSON.stringify(credentials)),
        },
        version,
      );
    } catch (err) {
      this._logger.warn(
        `Failed to mirror media credentials to AI config for ${identifier}: ${(err as Error).message}`,
      );
    }
  }
}

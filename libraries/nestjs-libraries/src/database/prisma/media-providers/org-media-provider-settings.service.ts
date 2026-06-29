import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { OrgMediaProviderSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/media-providers/org-media-provider-settings.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/encryption/encryption.service';
import { ProviderResolutionService } from '@gitroom/nestjs-libraries/providers/provider-resolution.service';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { ProviderKernel } from '@gitroom/provider-kernel';
import { FileService } from '@gitroom/nestjs-libraries/database/prisma/file/file.service';
import { ProviderCredentialLinkService } from '@gitroom/nestjs-libraries/database/prisma/media-providers/provider-credential-link.service';
import { OrgAiSettingsRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-settings/org-ai-settings.repository';

const STANDARD_FOLDERS = ['documents', 'audio', 'images', 'video', 'other'];

// Providers whose media credential is the SAME key as their AI/LLM provider (Qwen on
// DashScope). When no dedicated media credential exists, fall back to the org's AI
// provider key — configure once, works for both surfaces. (openai/minimax instead
// write-mirror both ways via ProviderCredentialLinkService; Qwen has no media-side
// settings flow yet, so a read-fallback is the lighter, immediate path.)
const UNIVERSAL_AI_CREDENTIAL = new Set([
  'qwen',
  'google',
  'togetherai',
  'siliconflow',
  'groq',
  'openrouter',
  'fireworks',
  'deepinfra',
  'gateway',
  'bedrock',
  'azure',
  'xai',
]);

export interface MediaProviderExtraConfig {
  operations?: string[];
  c2paAvailable?: boolean;
}

export interface EnabledMediaProvider {
  identifier: string;
  storageProviderId: string | null;
  storageRootFolderId: string | null;
  extraConfig: MediaProviderExtraConfig;
}

@Injectable()
export class OrgMediaProviderSettingsService {
  private readonly _logger = new Logger(OrgMediaProviderSettingsService.name);

  constructor(
    private _repository: OrgMediaProviderSettingsRepository,
    private _encryption: EncryptionService,
    private _resolution: ProviderResolutionService,
    private _fileService: FileService,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel,
    @Optional() private _credentialLink?: ProviderCredentialLinkService,
    // layering: sanctioned leaf-read of OrgAiSettingsRepository (OrgAiSettingsService
    // imports ProviderCredentialLinkService from media-providers → routing up would cycle)
    @Optional() private _orgAiRepository?: OrgAiSettingsRepository,
  ) {}

  // Enumerate the registered media providers (one entry per provider id) from the
  // ProviderKernel — replaces the legacy in-memory registry enumeration.
  private _listProviders(): { identifier: string; name: string; capabilities: Record<string, boolean> }[] {
    const seen = new Set<string>();
    const out: { identifier: string; name: string; capabilities: Record<string, boolean> }[] = [];
    for (const manifest of this._kernel.listManifests('media')) {
      if (seen.has(manifest.providerId)) continue;
      seen.add(manifest.providerId);
      out.push({
        identifier: manifest.providerId,
        name: manifest.displayName,
        capabilities: manifest.capabilities as Record<string, boolean>,
      });
    }
    return out;
  }

  async getProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    const adapters = this._listProviders();
    // Universal-credential providers (Qwen) count as configured/active when the org has
    // the matching AI provider key, even without a dedicated media credential row.
    const universalConfigured = await this._universalAiConfigured(orgId, adapters);
    return adapters.map((adapter) => {
      const dbConfig = configs.find((c) => c.identifier === adapter.identifier);
      const inherited = universalConfigured.has(adapter.identifier);
      return {
        identifier: adapter.identifier,
        name: adapter.name,
        capabilities: adapter.capabilities,
        enabled: dbConfig?.enabled || inherited || false,
        isActive: dbConfig?.isActive || false,
        isConfigured: !!dbConfig?.credentials || inherited,
        storageProviderId: dbConfig?.storageProviderId || null,
        storageRootFolderId: dbConfig?.storageRootFolderId || null,
        version: dbConfig?.version ?? 'v1',
        createdAt: dbConfig?.createdAt || null,
        updatedAt: dbConfig?.updatedAt || null,
      };
    });
  }

  async getActiveProviders(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    return configs
      .filter((c) => c.enabled && c.credentials)
      .map((c) => ({
        identifier: c.identifier,
        storageProviderId: c.storageProviderId,
        storageRootFolderId: c.storageRootFolderId,
      }));
  }

  // Org-enabled, credentialed providers with their parsed extraConfig (no secrets) —
  // the capability-driven resolution + the 4F summary read this.
  async getEnabledProviders(orgId: string): Promise<EnabledMediaProvider[]> {
    const configs = await this._repository.getByOrg(orgId);
    return configs
      .filter((c) => c.enabled && c.credentials)
      .map((c) => ({
        identifier: c.identifier,
        storageProviderId: c.storageProviderId ?? null,
        storageRootFolderId: c.storageRootFolderId ?? null,
        extraConfig: this._parseExtraConfig(c.extraConfig),
      }));
  }

  async upsert(
    orgId: string,
    identifier: string,
    data: {
      enabled?: boolean;
      credentials?: Record<string, string>;
      storageProviderId?: string;
      storageRootFolderId?: string;
      version?: string;
    },
  ) {
    const encryptedCredentials = data.credentials
      ? this._encryption.encrypt(JSON.stringify(data.credentials))
      : undefined;

    const version =
      data.version ?? this._resolution.latestActiveVersion('media', identifier) ?? 'v1';

    const result = await this._repository.upsert(
      orgId,
      identifier,
      {
        enabled: data.enabled,
        credentials: encryptedCredentials,
        storageProviderId: data.storageProviderId,
        storageRootFolderId: data.storageRootFolderId,
      },
      version,
    );

    if (data.storageProviderId && data.storageRootFolderId) {
      await this.ensureStandardFolders(orgId, data.storageRootFolderId);
    }

    // §11.4 auto-config: OpenAI/MiniMax media credentials live-link to the AI surface.
    if (data.credentials && this._credentialLink) {
      await this._credentialLink.syncFromMediaProvider(orgId, identifier, data.credentials);
    }

    return result;
  }

  async delete(orgId: string, identifier: string) {
    return this._repository.delete(orgId, identifier);
  }

  /**
   * Mark a provider as the org's Primary media provider (call-time default;
   * plan §1.4/§2.4). Validates the provider is configured (own creds OR the
   * universal-credential AI fallback), ensures a row exists to flip, then clears
   * the prior Primary's `isActive` and sets this one (enable-many + one Primary).
   */
  async setActive(orgId: string, identifier: string, version?: string) {
    const resolvedVersion =
      version ?? this._resolution.latestActiveVersion('media', identifier) ?? 'v1';
    const config = await this.getConfigForProvider(orgId, identifier, resolvedVersion);
    if (!config || Object.keys(config.credentials).length === 0) {
      throw new Error(
        `Media provider "${identifier}" is not configured. Add credentials first.`,
      );
    }
    // Universal-credential providers (Qwen) may have no media row yet — make one so
    // there is an `isActive` flag to flip.
    await this._repository.upsert(orgId, identifier, { enabled: true }, resolvedVersion);
    return this._repository.setActive(orgId, identifier, resolvedVersion);
  }

  /** The org's Primary media provider row, or null. Studio pickers default to it. */
  async getPrimaryProvider(orgId: string) {
    const configs = await this._repository.getByOrg(orgId);
    return configs.find((c) => c.isActive) ?? null;
  }

  /** Identifiers enabled in at least one org — for the platform-admin overview. */
  async getEnabledIdentifiers(): Promise<string[]> {
    return this._repository.getEnabledIdentifiers();
  }

  async isProviderEnabledForOperation(orgId: string, identifier: string, operation: string): Promise<boolean> {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config || !config.enabled) return false;
    if (!config.extraConfig) return true;
    const ops = this._parseExtraConfig(config.extraConfig).operations;
    if (!ops || ops.length === 0) return true;
    return ops.includes(operation);
  }

  async getConfigForProvider(orgId: string, identifier: string, version = 'v1') {
    const config = await this._repository.getByIdentifier(orgId, identifier, version);
    const credentials = config ? this._decryptCredentials(config.credentials) : {};
    // Prefer the dedicated media credential; for universal-credential providers (Qwen),
    // fall back to the org's AI provider key so the same key drives both surfaces.
    if (Object.keys(credentials).length === 0 && UNIVERSAL_AI_CREDENTIAL.has(identifier)) {
      const aiCredentials = await this._aiCredentials(orgId, identifier);
      if (aiCredentials) {
        return {
          credentials: aiCredentials,
          storageProviderId: config?.storageProviderId ?? null,
          storageRootFolderId: config?.storageRootFolderId ?? null,
          version: config?.version ?? version,
        };
      }
    }
    if (!config) return null;
    return {
      credentials,
      storageProviderId: config.storageProviderId,
      storageRootFolderId: config.storageRootFolderId,
      version: config.version,
    };
  }

  async testConnection(orgId: string, identifier: string) {
    const config = await this._repository.getByIdentifier(orgId, identifier);
    if (!config) {
      throw new Error(`Media provider "${identifier}" not configured for this organization`);
    }

    const decrypted = this._decryptCredentials(config.credentials);
    const adapter = this._resolution.resolveMedia(identifier, {
      version: config.version,
      credentials: decrypted,
      orgId,
    });

    try {
      // Prefer the adapter's own auth check; only image-capable providers can be
      // verified via generateImage. Without either, the key can't be actively tested.
      if (adapter.testConnection) {
        return await adapter.testConnection({ credentials: decrypted });
      }
      if (adapter.capabilities.image) {
        await adapter.generateImage('test', { credentials: decrypted });
        return { ok: true, message: 'Connection successful' };
      }
      return { ok: true, message: 'Credentials saved (no live connection test for this provider)' };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  // Decrypt the org's AI provider credentials for a universal-credential provider. Per-org
  // AI configs (AIOrgProviderConfig, written by OrgAiSettingsService) are encrypted with the
  // SAME EncryptionService as media creds — so reuse our own _decryptCredentials. (Note: the
  // GLOBAL AIProviderConfig uses AuthService.fixedEncryption instead; the two are NOT
  // interchangeable, which is why we read the org row directly rather than via AiSettingsService.)
  private async _aiCredentials(orgId: string, identifier: string): Promise<Record<string, string> | null> {
    if (!this._orgAiRepository) return null;
    const config = await this._orgAiRepository.getByIdentifier(orgId, identifier);
    if (!config?.credentials) return null;
    const credentials = this._decryptCredentials(config.credentials);
    return Object.keys(credentials).length > 0 ? credentials : null;
  }

  // Which universal-credential adapters (Qwen) the org has an AI key for — drives the
  // configured/active flags in getProviders without a media credential row.
  private async _universalAiConfigured(
    orgId: string,
    adapters: { identifier: string }[],
  ): Promise<Set<string>> {
    const universal = adapters.filter((a) => UNIVERSAL_AI_CREDENTIAL.has(a.identifier));
    const configured = new Set<string>();
    await Promise.all(
      universal.map(async (a) => {
        if (await this._aiCredentials(orgId, a.identifier)) configured.add(a.identifier);
      }),
    );
    return configured;
  }

  private _parseExtraConfig(extraConfig: string | null | undefined): MediaProviderExtraConfig {
    if (!extraConfig) return {};
    try {
      const parsed = JSON.parse(extraConfig) as MediaProviderExtraConfig;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private _decryptCredentials(encrypted: string | null): Record<string, string> {
    if (!encrypted) return {};
    try {
      return JSON.parse(this._encryption.decrypt(encrypted));
    } catch {
      this._logger.warn('Failed to decrypt media provider credentials');
      return {};
    }
  }

  // Ensure the provider root's typed 5-folder tree (§11.5). Public so the async-job
  // completion path can lazily (re)create it before landing an artifact.
  async ensureStandardFolders(orgId: string, rootFolderId: string) {
    const existing = await this._fileService.findFoldersByParent(orgId, rootFolderId);
    const existingNames = new Set(existing.map((f) => f.name.toLowerCase()));

    for (const folderName of STANDARD_FOLDERS) {
      if (!existingNames.has(folderName)) {
        try {
          await this._fileService.createFolder(orgId, {
            name: folderName,
            parentId: rootFolderId,
          });
        } catch (err) {
          this._logger.warn(`Failed to create standard folder "${folderName}": ${(err as Error).message}`);
        }
      }
    }
  }

  // Resolve (creating on demand) the typed folder under a provider root.
  async getStandardFolderId(orgId: string, rootFolderId: string, folderName: string): Promise<string | null> {
    if (!STANDARD_FOLDERS.includes(folderName)) return null;
    await this.ensureStandardFolders(orgId, rootFolderId);
    const folders = await this._fileService.findFoldersByParent(orgId, rootFolderId);
    const match = folders.find((f) => f.name.toLowerCase() === folderName);
    return match?.id ?? null;
  }
}

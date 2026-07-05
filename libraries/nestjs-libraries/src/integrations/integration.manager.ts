import 'reflect-metadata';

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  SocialProvider,
  SocialAbstract,
  ProviderKernel,
  DEFAULT_VERSION,
} from '@gitroom/provider-kernel';
import { PROVIDER_KERNEL } from '@gitroom/nestjs-libraries/providers/providers.module';
import { ProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/provider-config.manager';
import { OrgProviderConfigManager } from '@gitroom/nestjs-libraries/integrations/org-provider-config.manager';
import { ProviderNotConfiguredError } from '@gitroom/nestjs-libraries/integrations/provider-not-configured.error';
import {
  getEnvClientInfo,
  getEnvEnabledIdentifiers,
  isEnvEnabled,
} from '@gitroom/nestjs-libraries/integrations/channel-env-credentials';

@Injectable()
export class IntegrationManager {
  private readonly _logger = new Logger(IntegrationManager.name);

  constructor(
    private _providerConfigManager: ProviderConfigManager,
    private _orgProviderConfigManager: OrgProviderConfigManager,
    @Inject(PROVIDER_KERNEL) private _kernel: ProviderKernel
  ) {}

  // Raw social provider singletons, sourced from the ProviderKernel registry —
  // the single source of truth (the legacy in-memory social registry and the
  // PROVIDER_KERNEL kill switch were removed). The kernel's
  // `create()` returns a credential-mapping bridge that intentionally does NOT
  // carry the providers' @Plug/@Rules/@Tool decorator metadata or their custom
  // tool methods, so enumeration + dynamic dispatch read the raw `legacyProvider`
  // instance each registered module exposes.
  getSocialProviders(): Array<SocialAbstract & SocialProvider> {
    const seen = new Set<string>();
    const list: Array<SocialAbstract & SocialProvider> = [];
    for (const manifest of this._kernel.listManifests('social')) {
      if (seen.has(manifest.providerId)) {
        continue;
      }
      const mod = this._kernel.get(
        'social',
        manifest.providerId,
        manifest.version
      );
      const raw = mod?.legacyProvider as
        | (SocialAbstract & SocialProvider)
        | undefined;
      if (!raw) {
        continue;
      }
      seen.add(manifest.providerId);
      list.push(raw);
    }
    return list;
  }

  async getAllIntegrations(orgId?: string) {
    if (orgId) {
      await this._orgProviderConfigManager.ensureFresh(orgId);
    } else {
      await this._providerConfigManager.ensureFresh();
    }
    const enabledIdentifiers = orgId
      ? await this._orgProviderConfigManager.getEnabledIdentifiers(orgId)
      : await this._providerConfigManager.getEnabledIdentifiers();
    const allConfigs = orgId
      ? await this._orgProviderConfigManager.getAllConfigs(orgId)
      : await this._providerConfigManager.getAllConfigs();
    // Providers the deployment env supplies a platform OAuth app for always stay
    // connectable (click-connect), even after the org has added its own configs.
    const envEnabled = getEnvEnabledIdentifiers();
    const enabledSet = new Set([...enabledIdentifiers, ...envEnabled]);
    const hasAnyConfigs = allConfigs.length > 0;

    return {
      social: await Promise.all(
        this.getSocialProviders()
          .filter((p) => !hasAnyConfigs || enabledSet.has(p.identifier))
          .map(async (p) => {
            const config = orgId
              ? await this._orgProviderConfigManager.getConfig(orgId, p.identifier)
              : await this._providerConfigManager.getConfig(p.identifier);
            return {
              name: p.name,
              identifier: p.identifier,
              toolTip: p.toolTip,
              editor: p.editor,
              isExternal: !!p.externalUrl,
              isWeb3: !!p.isWeb3,
              isChromeExtension: !!p.isChromeExtension,
              ...(p.extensionCookies
                ? { extensionCookies: p.extensionCookies }
                : {}),
              ...(p.customFields
                ? { customFields: await p.customFields() }
                : {}),
              ...('setupInstructions' in (config || {}) && (config as any)?.setupInstructions
                ? { setupInstructions: (config as any).setupInstructions }
                : {}),
              ...('setupNotes' in (config || {}) && (config as any)?.setupNotes
                ? { setupInstructions: (config as any).setupNotes }
                : {}),
            };
          })
      ),
      article: [] as any[],
    };
  }

  getAllTools(): {
    [key: string]: {
      description: string;
      dataSchema: any;
      methodName: string;
    }[];
  } {
    return this.getSocialProviders().reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata('custom:tool', current.constructor.prototype) ||
          [],
      }),
      {}
    );
  }

  getAllRulesDescription(): {
    [key: string]: string;
  } {
    return this.getSocialProviders().reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata(
            'custom:rules:description',
            current.constructor
          ) || '',
      }),
      {}
    );
  }

  getAllPlugs() {
    return this.getSocialProviders()
      .map((p) => {
        return {
          name: p.name,
          identifier: p.identifier,
          plugs: (
            Reflect.getMetadata('custom:plug', p.constructor.prototype) || []
          )
            .filter((f: any) => !f.disabled)
            .map((p: any) => ({
              ...p,
              fields: p.fields.map((c: any) => ({
                ...c,
                validation: c?.validation?.toString(),
              })),
            })),
        };
      })
      .filter((f) => f.plugs.length);
  }

  async getInternalPlugs(providerName: string, orgId?: string) {
    const p = this.getSocialIntegrationUnchecked(providerName);
    if (!p) {
      this._logger.warn(`Unknown provider '${providerName}' requested in getInternalPlugs`);
      return { internalPlugs: [] };
    }
    const enabled =
      (orgId
        ? await this._orgProviderConfigManager.isEnabled(orgId, providerName)
        : false) ||
      (await this._providerConfigManager.isEnabled(providerName)) ||
      isEnvEnabled(providerName);
    if (!enabled) {
      throw new NotFoundException(`Integration not available: ${providerName}`);
    }
    return {
      internalPlugs:
        (
          Reflect.getMetadata(
            'custom:internal_plug',
            p.constructor.prototype
          ) || []
        ).filter((f: any) => !f.disabled) || [],
    };
  }

  getAllowedSocialsIntegrations() {
    return this.getSocialProviders().map((p) => p.identifier);
  }
  async getSocialIntegration(
    integration: string,
    orgId?: string,
    version?: string
  ): Promise<SocialProvider> {
    // When the caller pins the connected row's stored version, resolve that exact
    // adapter and reject a retired version (see getSocialIntegrationUnchecked).
    const provider = this.getSocialIntegrationUnchecked(integration, version);
    if (!provider) {
      throw new NotFoundException(`Unknown integration: ${integration}`);
    }
    const enabled =
      (orgId
        ? await this._orgProviderConfigManager.isEnabled(orgId, integration)
        : false) ||
      (await this._providerConfigManager.isEnabled(integration)) ||
      isEnvEnabled(integration);
    if (!enabled) {
      throw new NotFoundException(`Integration not available: ${integration}`);
    }
    return provider;
  }

  // Returns the provider definition WITHOUT checking the enabled state.
  // Used for listing/maintaining already-connected integrations (channel list,
  // token refresh), which must keep working even if an admin later disables the
  // provider for new connections. Returns undefined for genuinely unknown ids.
  getSocialIntegrationUnchecked(
    integration: string,
    version?: string
  ): SocialProvider | undefined {
    // Resolve the raw provider singleton from the ProviderKernel registry. The
    // raw instance (not the kernel's credential-mapping bridge) is returned so
    // callers can invoke custom tool / internal-plug methods by name — these
    // live only on the provider class, not on the bridge interface.
    const mod = version
      ? this._kernel.get('social', integration, version)
      : this._kernel.get('social', integration, DEFAULT_VERSION) ??
        this._kernel.latestActive('social', integration);

    // 1.3: the Unchecked variant is documented to RETURN undefined for
    // unknown/unavailable ids so a single bad provider can't abort a cross-org
    // sweep (channel list, token refresh — callers rely on `if (!provider)
    // continue`). A retired pinned version must therefore return undefined here,
    // NOT throw — the throw belonged to the CHECKED getSocialIntegration, which
    // surfaces the 404/410 for a single user-facing lookup. Version-less listing
    // paths keep their existing, status-agnostic behaviour. Latent today (all
    // social providers are v1), so this is behaviour-neutral for real data.
    if (version && mod?.manifest.status === 'retired') {
      return undefined;
    }

    return mod?.legacyProvider as SocialProvider | undefined;
  }

  // INTERNAL USE ONLY - returns decrypted client credentials.
  // When configId is provided the credentials of that specific named config are used
  // (each named credential set has its own auth); otherwise resolution falls back to
  // the org's primary config for the provider identifier.
  async getClientInformation(integration: string, orgId?: string, configId?: string | null) {
    // Resolve the pinned version from the org's channel config (or the global default
    // when no org context). This version is returned with the credentials so callers
    // can resolve the exact provider adapter that matches the pinned config.
    const configVersion =
      orgId && this._orgProviderConfigManager
        ? await (async () => {
            const config = configId
              ? await this._orgProviderConfigManager.getConfigById(orgId, configId)
              : await this._orgProviderConfigManager.getConfig(orgId, integration);
            return config?.version ?? 'v1';
          })()
        : 'v1';

    if (orgId) {
      // A specific named credential set, or the org's own app for this provider,
      // always wins over the platform default (BYO-app override).
      const orgInfo = configId
        ? await this._orgProviderConfigManager.getClientInfoById(orgId, configId)
        : await this._orgProviderConfigManager.getClientInfo(orgId, integration);
      if (orgInfo?.client_id || orgInfo?.token) {
        return { ...orgInfo, version: configVersion };
      }
      // Platform-owned OAuth app (deployment env) — powers click-connect when the
      // org hasn't brought its own keys. Falls through to the global config below.
      const envInfo = getEnvClientInfo(integration);
      if (envInfo) {
        return { ...envInfo, version: configVersion };
      }
      return orgInfo ? { ...orgInfo, version: configVersion } : undefined;
    }
    const globalInfo =
      (await this._providerConfigManager.getClientInfo(integration)) ||
      getEnvClientInfo(integration);
    return globalInfo ? { ...globalInfo, version: configVersion } : undefined;
  }

  async requireClientInformation(integration: string, orgId?: string, configId?: string | null) {
    const info = await this.getClientInformation(integration, orgId, configId);
    if (!info?.client_id && !info?.token) {
      throw new ProviderNotConfiguredError(integration, orgId);
    }
    return info;
  }

  async isProviderEnabled(integration: string, orgId?: string) {
    if (
      (orgId &&
        (await this._orgProviderConfigManager.isEnabled(orgId, integration))) ||
      (await this._providerConfigManager.isEnabled(integration)) ||
      isEnvEnabled(integration)
    ) {
      return true;
    }
    return false;
  }
}

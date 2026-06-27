import {
  VpnConfigValidationResult,
  VpnCredentialField,
  VpnProviderCapabilities,
} from './vpn.types';

export interface VpnProviderAdapter {
  readonly identifier: string;
  readonly name: string;
  readonly credentialFields: VpnCredentialField[];
  readonly capabilities: VpnProviderCapabilities;
  readonly setupNotes?: string;

  validateConfig(config: Record<string, string>): VpnConfigValidationResult;

  /**
   * Optional health-check stub. In this credential-only phase it is a no-op
   * placeholder; later it can attempt a lightweight API/status probe.
   */
  healthCheck?(config: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
}

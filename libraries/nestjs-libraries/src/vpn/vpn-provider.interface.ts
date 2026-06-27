import {
  VpnConfigValidationResult,
  VpnCredentialField,
  VpnProviderCapabilities,
  VpnProxyAuth,
  VpnProxyRegion,
} from './vpn.types';

export interface VpnProviderAdapter {
  readonly identifier: string;
  readonly name: string;
  readonly credentialFields: VpnCredentialField[];
  readonly capabilities: VpnProviderCapabilities;
  readonly setupNotes?: string;

  /**
   * Egress regions this provider exposes as request-routable proxies. Present
   * only on SOCKS5 / HTTP-CONNECT-capable providers; absent ⇒ the provider
   * never appears in the per-channel VPN region picker and never routes traffic.
   */
  readonly proxyRegions?: VpnProxyRegion[];

  validateConfig(config: Record<string, string>): VpnConfigValidationResult;

  /**
   * Derive the proxy username/password from the stored credentials. Required on
   * providers that declare `proxyRegions`. Returns null when creds are missing
   * or malformed.
   */
  resolveProxyAuth?(config: Record<string, string>): VpnProxyAuth | null;

  /**
   * Optional health-check stub. In this credential-only phase it is a no-op
   * placeholder; later it can attempt a lightweight API/status probe.
   */
  healthCheck?(config: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
}

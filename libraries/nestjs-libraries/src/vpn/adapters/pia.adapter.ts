import { Injectable } from '@nestjs/common';
import { VpnProviderAdapter } from '../vpn-provider.interface';
import {
  VpnConfigValidationResult,
  VpnCredentialField,
  VpnProviderCapabilities,
  VpnProxyAuth,
  VpnProxyRegion,
} from '../vpn.types';

@Injectable()
export class PiaAdapter implements VpnProviderAdapter {
  readonly identifier = 'pia';
  readonly name = 'Private Internet Access';

  readonly credentialFields: VpnCredentialField[] = [
    {
      key: 'serviceCredentials',
      label: 'Service Credentials',
      type: 'password',
      required: true,
      placeholder: 'username:password from PIA account settings',
    },
    {
      key: 'configUrl',
      label: 'OpenVPN Config URL',
      type: 'text',
      required: false,
      placeholder: 'https://www.privateinternetaccess.com/.../config',
    },
  ];

  readonly capabilities: VpnProviderCapabilities = {
    wireguard: true,
    openvpn: true,
    ikev2: false,
    socks5: true,
    multiHop: false,
    killSwitch: true,
  };

  readonly setupNotes =
    'PIA uses the same username and password as your account for manual OpenVPN/WireGuard configurations. SOCKS5 proxy egress is Netherlands-only and uses the same credentials.';

  // PIA exposes a single public SOCKS5 proxy (Netherlands), port 1080. Verify
  // host + credential scheme against a live account.
  readonly proxyRegions: VpnProxyRegion[] = [
    { id: 'nl', label: 'Netherlands', host: 'proxy-nl.privateinternetaccess.com', port: 1080, protocol: 'socks5' },
  ];

  resolveProxyAuth(config: Record<string, string>): VpnProxyAuth | null {
    const creds = config.serviceCredentials?.trim() || '';
    const idx = creds.indexOf(':');
    if (idx <= 0) return null;
    return { username: creds.slice(0, idx), password: creds.slice(idx + 1) };
  }

  validateConfig(config: Record<string, string>): VpnConfigValidationResult {
    const errors: string[] = [];
    const creds = config.serviceCredentials?.trim() || '';
    if (!creds) {
      errors.push('Service credentials are required.');
    } else if (!creds.includes(':')) {
      errors.push('Service credentials must be in the format username:password.');
    }

    const configUrl = config.configUrl?.trim() || '';
    if (configUrl && !/^https:\/\//i.test(configUrl)) {
      errors.push('Config URL must be an HTTPS URL.');
    }

    return { valid: errors.length === 0, errors };
  }

  async healthCheck(config: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }
}

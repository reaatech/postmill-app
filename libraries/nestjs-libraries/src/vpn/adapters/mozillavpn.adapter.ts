import { Injectable } from '@nestjs/common';
import { VpnProviderAdapter } from '../vpn-provider.interface';
import {
  VpnConfigValidationResult,
  VpnCredentialField,
  VpnProviderCapabilities,
} from '../vpn.types';

@Injectable()
export class MozillavpnAdapter implements VpnProviderAdapter {
  readonly identifier = 'mozillavpn';
  readonly name = 'Mozilla VPN';

  readonly credentialFields: VpnCredentialField[] = [
    {
      key: 'subscriptionKey',
      label: 'Subscription Key',
      type: 'password',
      required: true,
      placeholder: 'Mozilla VPN subscription or device key',
    },
    {
      key: 'configUrl',
      label: 'WireGuard Config URL',
      type: 'text',
      required: false,
      placeholder: 'https://vpn.mozilla.org/.../config',
    },
  ];

  readonly capabilities: VpnProviderCapabilities = {
    wireguard: true,
    openvpn: false,
    ikev2: false,
    socks5: false,
    multiHop: false,
    killSwitch: true,
  };

  readonly setupNotes =
    'Mozilla VPN runs on Mullvad’s WireGuard backend. Paste your subscription/device key and an optional WireGuard config URL.';

  validateConfig(config: Record<string, string>): VpnConfigValidationResult {
    const errors: string[] = [];
    if (!config.subscriptionKey?.trim()) {
      errors.push('Subscription key is required.');
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

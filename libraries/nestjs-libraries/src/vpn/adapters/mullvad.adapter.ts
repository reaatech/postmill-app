import { Injectable } from '@nestjs/common';
import { VpnProviderAdapter } from '../vpn-provider.interface';
import {
  VpnConfigValidationResult,
  VpnCredentialField,
  VpnProviderCapabilities,
} from '../vpn.types';

@Injectable()
export class MullvadAdapter implements VpnProviderAdapter {
  readonly identifier = 'mullvad';
  readonly name = 'Mullvad VPN';

  readonly credentialFields: VpnCredentialField[] = [
    {
      key: 'accountNumber',
      label: 'Account Number',
      type: 'password',
      required: true,
      placeholder: '16-digit account number',
    },
    {
      key: 'configUrl',
      label: 'WireGuard Config URL',
      type: 'text',
      required: false,
      placeholder: 'https://mullvad.net/.../wireguard-config',
    },
  ];

  readonly capabilities: VpnProviderCapabilities = {
    wireguard: true,
    openvpn: true,
    ikev2: false,
    socks5: true,
    multiHop: true,
    killSwitch: true,
  };

  readonly setupNotes =
    'Mullvad accounts are identified by a 16-digit account number. Paste it here along with an optional WireGuard config URL.';

  validateConfig(config: Record<string, string>): VpnConfigValidationResult {
    const errors: string[] = [];
    const accountNumber = config.accountNumber?.trim().replace(/\s/g, '') || '';
    if (!accountNumber) {
      errors.push('Account number is required.');
    } else if (!/^\d{16}$/.test(accountNumber)) {
      errors.push('Account number must be 16 digits.');
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

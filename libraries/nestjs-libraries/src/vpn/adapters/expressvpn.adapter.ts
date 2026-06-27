import { Injectable } from '@nestjs/common';
import { VpnProviderAdapter } from '../vpn-provider.interface';
import {
  VpnConfigValidationResult,
  VpnCredentialField,
  VpnProviderCapabilities,
} from '../vpn.types';

@Injectable()
export class ExpressvpnAdapter implements VpnProviderAdapter {
  readonly identifier = 'expressvpn';
  readonly name = 'ExpressVPN';

  readonly credentialFields: VpnCredentialField[] = [
    {
      key: 'activationCode',
      label: 'Activation Code',
      type: 'password',
      required: true,
      placeholder: 'XXXX-XXXX-XXXX-XXXX',
    },
    {
      key: 'configUrl',
      label: 'OpenVPN Config URL',
      type: 'text',
      required: false,
      placeholder: 'https://www.expressvpn.com/.../ovpn-config',
    },
  ];

  readonly capabilities: VpnProviderCapabilities = {
    wireguard: false,
    openvpn: true,
    ikev2: true,
    socks5: false,
    multiHop: false,
    killSwitch: true,
  };

  readonly setupNotes =
    'Use the activation code from your ExpressVPN account setup. It is separate from your account password.';

  validateConfig(config: Record<string, string>): VpnConfigValidationResult {
    const errors: string[] = [];
    const code = config.activationCode?.trim() || '';
    if (!code) {
      errors.push('Activation code is required.');
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

import { Injectable } from '@nestjs/common';
import { VpnProviderAdapter } from '../vpn-provider.interface';
import {
  VpnConfigValidationResult,
  VpnCredentialField,
  VpnProviderCapabilities,
} from '../vpn.types';

@Injectable()
export class CyberghostAdapter implements VpnProviderAdapter {
  readonly identifier = 'cyberghost';
  readonly name = 'CyberGhost';

  readonly credentialFields: VpnCredentialField[] = [
    {
      key: 'serviceCredentials',
      label: 'Service Credentials',
      type: 'password',
      required: true,
      placeholder: 'username:password from CyberGhost manual setup',
    },
    {
      key: 'configUrl',
      label: 'OpenVPN Config URL',
      type: 'text',
      required: false,
      placeholder: 'https://www.cyberghostvpn.com/.../config',
    },
  ];

  readonly capabilities: VpnProviderCapabilities = {
    wireguard: true,
    openvpn: true,
    ikev2: true,
    socks5: false,
    multiHop: false,
    killSwitch: true,
  };

  readonly setupNotes =
    'Generate manual service credentials in your CyberGhost account area for OpenVPN/WireGuard setups.';

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

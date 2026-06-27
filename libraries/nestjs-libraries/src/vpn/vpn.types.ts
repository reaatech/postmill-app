export type VpnCredentialFieldType = 'text' | 'password' | 'select';

export interface VpnCredentialField {
  key: string;
  label: string;
  type: VpnCredentialFieldType;
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

export interface VpnProviderCapabilities {
  wireguard: boolean;
  openvpn: boolean;
  ikev2: boolean;
  socks5: boolean;
  multiHop: boolean;
  killSwitch: boolean;
}

export interface VpnConfigValidationResult {
  valid: boolean;
  errors?: string[];
}

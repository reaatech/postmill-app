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

export type VpnProxyProtocol = 'socks5' | 'http-connect';

// A selectable egress region backed by a real proxy endpoint. Only providers
// that expose a public SOCKS5 / HTTP-CONNECT proxy declare these; WireGuard /
// OpenVPN tunnels can't be applied per-request and are out of scope.
export interface VpnProxyRegion {
  id: string; // stable, e.g. 'us-atlanta'
  label: string; // 'United States — Atlanta'
  host: string; // proxy endpoint host
  port: number;
  protocol: VpnProxyProtocol;
}

export interface VpnProxyAuth {
  username: string;
  password: string;
}

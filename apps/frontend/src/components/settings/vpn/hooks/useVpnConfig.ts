'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';

export interface VpnProviderCapabilityInfo {
  wireguard: boolean;
  openvpn: boolean;
  ikev2: boolean;
  socks5: boolean;
  multiHop: boolean;
  killSwitch: boolean;
}

export interface VpnCredentialFieldInfo {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface VpnProviderInfo {
  identifier: string;
  name: string;
  enabled: boolean;
  isConfigured: boolean;
  capabilities: VpnProviderCapabilityInfo;
  credentialFields: VpnCredentialFieldInfo[];
  setupNotes?: string;
}

export interface VpnConfigResponse {
  providers: VpnProviderInfo[];
}

export const useVpnConfig = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/vpn/config');
    if (!res.ok) throw new Error('Failed to load VPN config');
    return res.json();
  }, [fetch]);
  return useSWR<VpnConfigResponse>('org-vpn-config', load, {
    revalidateOnFocus: false,
  });
};

export const useVpnProviders = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/settings/vpn/providers');
    if (!res.ok) throw new Error('Failed to load VPN providers');
    return res.json();
  }, [fetch]);
  return useSWR<VpnConfigResponse>('org-vpn-providers', load, {
    revalidateOnFocus: false,
  });
};

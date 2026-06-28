import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VpnTab } from './vpn.tab';

const mockFetch = vi.fn();
const mockMutate = vi.fn();

vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));

vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));

vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

vi.mock('@gitroom/frontend/components/shared/provider-icon', () => ({
  __esModule: true,
  default: () => <span data-testid="provider-icon">icon</span>,
}));

vi.mock('swr', () => ({
  default: vi.fn(),
  useSWRConfig: () => ({ mutate: mockMutate }),
}));

vi.mock('@gitroom/frontend/components/settings/shared/use-provider-catalog', () => ({
  useProviderCatalog: () => ({ data: [] }),
}));

import useSWR from 'swr';

const mockProviders = {
  providers: [
    {
      identifier: 'nordvpn',
      name: 'NordVPN',
      enabled: false,
      isConfigured: false,
      capabilities: { wireguard: true, openvpn: true, ikev2: true, socks5: true, multiHop: true, killSwitch: true },
      credentialFields: [{ key: 'serviceCredentials', label: 'Service Credentials', type: 'password', required: true }],
    },
    {
      identifier: 'mullvad',
      name: 'Mullvad VPN',
      enabled: true,
      isConfigured: true,
      capabilities: { wireguard: true, openvpn: true, ikev2: false, socks5: true, multiHop: true, killSwitch: true },
      credentialFields: [{ key: 'accountNumber', label: 'Account Number', type: 'password', required: true }],
    },
  ],
};

describe('VpnTab', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProviders),
    });
    vi.mocked(useSWR).mockReturnValue({
      data: mockProviders,
      isLoading: false,
      error: null,
      mutate: mockMutate,
    } as any);
  });

  it('renders provider list with capability chips', async () => {
    render(<VpnTab />);

    await waitFor(() => {
      expect(screen.getByText('NordVPN')).toBeDefined();
      expect(screen.getByText('Mullvad VPN')).toBeDefined();
    });

    expect(screen.getAllByText('WireGuard').length).toBe(2);
    expect(screen.getAllByText('OpenVPN').length).toBe(2);
  });

  it('shows Configure for unconfigured provider and Edit for configured provider', async () => {
    render(<VpnTab />);

    await waitFor(() => {
      expect(screen.getByText('Configure')).toBeDefined();
      expect(screen.getByText('Edit')).toBeDefined();
    });
  });
});

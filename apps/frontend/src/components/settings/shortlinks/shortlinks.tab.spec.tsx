import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

const mockFetchFn = vi.fn();
const mockToasterShow = vi.fn();
const mockT = vi.fn((_key: string, fallback?: string, opts?: Record<string, any>) => {
  if (!fallback) return _key;
  if (opts?.count !== undefined) return fallback.replace('{{count}}', String(opts.count));
  return fallback;
});

vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetchFn,
}));

vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToasterShow }),
}));

vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));

vi.mock('@gitroom/frontend/components/shared/provider-icon', () => ({
  default: ({ identifier, name }: { identifier: string; name: string }) => (
    <span data-testid="provider-icon" data-identifier={identifier}>{name}</span>
  ),
}));

const mockMutate = vi.fn();
let mockLocationSearch = '';

const defaultProviders = [
  {
    identifier: 'bitly',
    name: 'Bitly',
    capabilities: { create: true, statistics: true, customDomain: true, expand: false, bulkStatistics: false },
    isActive: false,
    isConfigured: false,
    customDomain: '',
    configs: [],
  },
  {
    identifier: 'tinyurl',
    name: 'TinyURL',
    capabilities: { create: true, statistics: false, customDomain: false, expand: false, bulkStatistics: false },
    isActive: false,
    isConfigured: true,
    customDomain: '',
    configs: [{ id: 'cfg-1', name: '', accountFingerprint: '', isActive: false, customDomain: '', createdAt: '', updatedAt: '' }],
  },
  {
    identifier: 'rebrandly',
    name: 'Rebrandly',
    capabilities: { create: true, statistics: true, customDomain: true, expand: false, bulkStatistics: false },
    isActive: true,
    isConfigured: true,
    customDomain: '',
    configs: [{ id: 'cfg-2', name: '', accountFingerprint: '', isActive: true, customDomain: '', createdAt: '', updatedAt: '' }],
  },
  {
    identifier: 'readonly-provider',
    name: 'ReadOnly',
    capabilities: { create: false, statistics: false, customDomain: false, expand: false, bulkStatistics: false },
    isActive: false,
    isConfigured: false,
    customDomain: '',
    configs: [],
  },
];

let mockConfigData: any = {
  active: {
    identifier: 'rebrandly',
    name: 'Rebrandly',
    capabilities: { create: true, statistics: true, customDomain: true },
    customDomain: '',
  },
  providers: defaultProviders,
};
let mockLoading = false;
let mockError: Error | null = null;

const mockProvidersList = defaultProviders.map((p) => ({
  ...p,
  credentialFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
  authType: p.identifier === 'bitly' ? 'oauth2' : 'apiKey',
}));

vi.mock('./hooks/useShortlinksConfig', () => ({
  useShortlinksConfig: () => ({
    data: mockConfigData,
    isLoading: mockLoading,
    error: mockError,
    mutate: mockMutate,
  }),
  useShortlinksProviders: () => ({ data: mockProvidersList }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

beforeEach(() => {
  vi.clearAllMocks();
  mockLocationSearch = '';
  Object.defineProperty(window, 'location', {
    value: { search: '', href: 'https://example.com/settings?tab=shortlinks', origin: 'https://example.com' },
    writable: true,
  });
  mockConfigData = {
    active: {
      identifier: 'rebrandly',
      name: 'Rebrandly',
      capabilities: { create: true, statistics: true, customDomain: true },
      customDomain: '',
    },
    providers: [...defaultProviders],
  };
  mockLoading = false;
  mockError = null;
});

describe('ShortlinksTab', () => {
  describe('Provider List', () => {
    it('renders all providers', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      expect(screen.getAllByText('Bitly').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('TinyURL').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Rebrandly').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Configure button for unconfigured providers', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const configureButtons = screen.getAllByText('Configure');
      expect(configureButtons.length).toBe(2);
    });

    it('shows Edit button for configured providers', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const editButtons = screen.getAllByText('Edit');
      expect(editButtons.length).toBe(2);
    });

    it('shows Set Active button only for configured but inactive providers', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      expect(screen.getByText('Set Active')).toBeDefined();
    });

    it('filters providers by search', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const searchInput = screen.getByPlaceholderText('Search providers...');
      fireEvent.change(searchInput, { target: { value: 'tiny' } });

      await waitFor(() => {
        expect(screen.getAllByText('TinyURL').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Bitly')).toBeNull();
      });
    });
  });

  describe('Capability Chips', () => {
    it('renders Stats chip for providers with statistics', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const statsChips = screen.getAllByText('Stats');
      expect(statsChips.length).toBeGreaterThan(0);
    });

    it('renders Custom domain chip for providers with customDomain', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const customDomainChips = screen.getAllByText('Custom domain');
      expect(customDomainChips.length).toBeGreaterThan(0);
    });

  });

  describe('Delete Provider', () => {
    it('shows confirm dialog before deleting', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockFetchFn.mockResolvedValueOnce({ ok: true });

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to remove this configuration?');
      expect(mockFetchFn).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('calls delete endpoint by identifier after confirm', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockFetchFn.mockResolvedValueOnce({ ok: true });

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockFetchFn).toHaveBeenCalledWith('/settings/shortlinks/config/rebrandly', {
          method: 'DELETE',
        });
      });

      await waitFor(() => {
        expect(mockToasterShow).toHaveBeenCalledWith('Configuration deleted', 'success');
        expect(mockMutate).toHaveBeenCalled();
      });
      confirmSpy.mockRestore();
    });
  });

  describe('Error State', () => {
    it('renders error message on fetch failure', async () => {
      mockError = new Error('Failed');
      mockConfigData = null;

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      expect(screen.getByText('Failed to load shortlink settings')).toBeDefined();
      expect(screen.getByText('Try again')).toBeDefined();
    });
  });

  describe('Provider Form Toggle', () => {
    it('opens provider form when Configure is clicked', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      fireEvent.click(screen.getAllByText('Configure')[0]);

      await waitFor(() => {
        expect(screen.getByText('Close')).toBeDefined();
      });
    });
  });

  describe('OAuth Callback', () => {
    beforeEach(() => {
      sessionStorage.setItem('oauth_shortlink_provider', 'bitly');
      window.location.search = '?code=abc123&state=xyz789';
      window.history.replaceState = vi.fn();
    });

    afterEach(() => {
      sessionStorage.removeItem('oauth_shortlink_provider');
    });

    it('sends state in the callback POST body', async () => {
      mockFetchFn.mockResolvedValueOnce({ ok: true });

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      await waitFor(() => {
        expect(mockFetchFn).toHaveBeenCalledWith('/settings/shortlinks/config/bitly/oauth/callback', {
          method: 'POST',
          body: JSON.stringify({ code: 'abc123', state: 'xyz789', redirectUri: 'https://example.com/settings?tab=shortlinks' }),
        });
      });
    });

    it('shows warning toast and returns when storedIdentifier is missing', async () => {
      sessionStorage.removeItem('oauth_shortlink_provider');

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      await waitFor(() => {
        expect(mockToasterShow).toHaveBeenCalledWith('Could not resume the connection — please retry.', 'warning');
      });

      expect(mockFetchFn).not.toHaveBeenCalled();
    });
  });
});

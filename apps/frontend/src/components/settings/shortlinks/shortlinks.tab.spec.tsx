import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

vi.mock('@gitroom/frontend/components/settings/shortlink-preference.component', () => ({
  default: () => null,
  useShortlinkPreference: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }),
}));

const mockMutate = vi.fn();
let mockLocationSearch = '';

const defaultProviders = [
  {
    identifier: 'bitly',
    name: 'Bitly',
    capabilities: { create: true, statistics: true, customDomain: true },
    isActive: false,
    isConfigured: false,
    customDomain: '',
  },
  {
    identifier: 'tinyurl',
    name: 'TinyURL',
    capabilities: { create: true, statistics: false, customDomain: false },
    isActive: false,
    isConfigured: true,
    customDomain: '',
  },
  {
    identifier: 'rebrandly',
    name: 'Rebrandly',
    capabilities: { create: true, statistics: true, customDomain: true },
    isActive: true,
    isConfigured: true,
    customDomain: '',
  },
  {
    identifier: 'readonly-provider',
    name: 'ReadOnly',
    capabilities: { create: false, statistics: false, customDomain: false },
    isActive: false,
    isConfigured: false,
    customDomain: '',
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
  authType: 'apiKey',
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
  describe('Active Provider Card', () => {
    it('renders active provider card with provider name', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      expect(screen.getByText('Active Provider')).toBeDefined();
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges.length).toBeGreaterThan(0);

      const activeCard = screen.getByText('Active Provider').closest('.bg-newBgColorInner')!;
      expect(within(activeCard).getByText('Rebrandly')).toBeDefined();
    });

    it('shows empty state when no active provider', async () => {
      mockConfigData = { active: null, providers: [] };

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      expect(screen.getByText('No provider configured. Search and configure a provider below.')).toBeDefined();
    });
  });

  describe('Provider List', () => {
    it('renders all providers', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const bitlyEntries = screen.getAllByText('Bitly');
      expect(bitlyEntries.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('TinyURL')).toBeDefined();

      const rebrandlyEntries = screen.getAllByText('Rebrandly');
      expect(rebrandlyEntries.length).toBeGreaterThanOrEqual(2);
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

    it('shows Remove button for configured providers', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const removeButtons = screen.getAllByText('Remove');
      expect(removeButtons.length).toBe(2);
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

    it('renders No stats chip for providers without statistics', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      expect(screen.getByText('No stats')).toBeDefined();
    });

    it('renders Read-only chip for providers without create capability (U4)', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      expect(screen.queryByText('Create-only')).toBeFalsy();
      expect(screen.getByText('Read-only')).toBeDefined();
    });
  });

  describe('Search Functionality', () => {
    it('filters providers by search query', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const searchInput = screen.getByPlaceholderText('Search providers...');
      fireEvent.change(searchInput, { target: { value: 'bitly' } });

      await waitFor(() => {
        const bitlyEntries = screen.getAllByText('Bitly');
        expect(bitlyEntries.length).toBeGreaterThanOrEqual(1);
      });

      const providerList = screen.getByText('All Providers').closest('.bg-newBgColorInner')!;
      expect(within(providerList).queryByText('TinyURL')).toBeFalsy();
      expect(within(providerList).queryByText('Rebrandly')).toBeFalsy();
    });

    it('shows no results message when search has no matches', async () => {
      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const searchInput = screen.getByPlaceholderText('Search providers...');
      fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

      await waitFor(() => {
        expect(screen.getByText('No providers match your search')).toBeDefined();
      });
    });
  });

  describe('Set Active', () => {
    it('calls set-active endpoint for configured but inactive provider', async () => {
      mockFetchFn.mockResolvedValueOnce({ ok: true });

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      fireEvent.click(screen.getByText('Set Active'));

      await waitFor(() => {
        expect(mockFetchFn).toHaveBeenCalledWith('/settings/shortlinks/config/tinyurl/set-active', {
          method: 'POST',
        });
      });

      await waitFor(() => {
        expect(mockToasterShow).toHaveBeenCalledWith('Provider activated', 'success');
        expect(mockMutate).toHaveBeenCalled();
      });
    });

    it('shows error toast on set-active failure', async () => {
      mockFetchFn.mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Server error') });

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      fireEvent.click(screen.getByText('Set Active'));

      await waitFor(() => {
        expect(mockToasterShow).toHaveBeenCalledWith('Server error', 'warning');
      });
    });
  });

  describe('Delete Provider (U5)', () => {
    it('shows confirm dialog before deleting', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockFetchFn.mockResolvedValueOnce({ ok: true });

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to remove this provider?');
      expect(mockFetchFn).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('calls delete endpoint after confirm', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockFetchFn.mockResolvedValueOnce({ ok: true });

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockFetchFn).toHaveBeenCalledWith('/settings/shortlinks/config/tinyurl', {
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

  describe('Loading State', () => {
    it('shows loading indicator while fetching', async () => {
      mockLoading = true;
      mockConfigData = null;

      const { ShortlinksTab } = await import('./shortlinks.tab');
      render(<ShortlinksTab />, { wrapper });

      const loadingElements = screen.getAllByText('Loading...');
      expect(loadingElements.length).toBeGreaterThan(0);
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

  describe('OAuth Callback (B-3b, U6)', () => {
    beforeEach(() => {
      sessionStorage.setItem('oauth_shortlink_provider', 'bitly');
      window.location.search = '?code=abc123&state=xyz789';
      window.history.replaceState = vi.fn();
    });

    afterEach(() => {
      sessionStorage.removeItem('oauth_shortlink_provider');
    });

    it('sends state in the callback POST body (B-3b)', async () => {
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

    it('shows warning toast and returns when storedIdentifier is missing (U6)', async () => {
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

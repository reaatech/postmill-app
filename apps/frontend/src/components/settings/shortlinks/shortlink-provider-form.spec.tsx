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

const defaultProvidersData = [
  {
    identifier: 'bitly',
    name: 'Bitly',
    capabilities: { create: true, expand: true, statistics: true, bulkStatistics: true, customDomain: true },
    credentialFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Enter your API key' },
    ],
    authType: 'apiKey',
    defaultDomain: 'bit.ly',
    setupNotes: 'Get your API key from Bitly dashboard.',
  },
  {
    identifier: 'tinyurl',
    name: 'TinyURL',
    capabilities: { create: true, expand: false, statistics: false, bulkStatistics: false, customDomain: false },
    credentialFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
    authType: 'apiKey',
  },
];

let mockProvidersData: any[] = [...defaultProvidersData];

vi.mock('./hooks/useShortlinksConfig', () => ({
  useShortlinksConfig: () => ({ data: null, isLoading: false, error: null, mutate: vi.fn() }),
  useShortlinksProviders: () => ({ data: mockProvidersData }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

const defaultProps = {
  identifier: 'bitly',
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockProvidersData = [...defaultProvidersData];
});

const oauthProvider = {
  identifier: 'bitly-oauth',
  name: 'Bitly OAuth',
  capabilities: { create: true, expand: true, statistics: true, bulkStatistics: true, customDomain: true },
  credentialFields: [
    { key: 'accessToken', label: 'Access Token', type: 'password', required: false, placeholder: 'Paste a generated token' },
  ],
  authType: 'oauth2',
  defaultDomain: 'bit.ly',
  setupNotes: 'Configure OAuth below.',
};

describe('ShortlinkProviderForm', () => {
  it('renders credential fields for the provider', async () => {
    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    expect(screen.getByText('Bitly')).toBeDefined();
    expect(screen.getByText('API Key')).toBeDefined();
  });

  it('renders Configuration Name input', async () => {
    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    expect(screen.getByText('Configuration Name')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. My Bitly Account')).toBeDefined();
  });

  it('renders customDomain field when provider supports it', async () => {
    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    expect(screen.getByText('Custom Domain')).toBeDefined();
  });

  it('does not render customDomain field when provider does not support it', async () => {
    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} identifier="tinyurl" />, { wrapper });

    expect(screen.queryByText('Custom Domain')).toBeFalsy();
  });

  it('renders setup notes when available', async () => {
    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    expect(screen.getByText('Get your API key from Bitly dashboard.')).toBeDefined();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} onClose={onClose} />, { wrapper });

    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls the test endpoint when Test Connection is clicked', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: true });

    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith('/settings/shortlinks/config/bitly/test', {
        method: 'POST',
        body: JSON.stringify({ credentials: { apiKey: '' }, customDomain: undefined }),
      });
    });
  });

  it('displays success message on successful test', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: true });

    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeDefined();
    });
  });

  it('displays failure message on failed test', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: false });

    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed — check your credentials')).toBeDefined();
    });
  });

  it('calls save endpoint with name when Save is clicked', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: true });
    const onSaved = vi.fn();

    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} onSaved={onSaved} />, { wrapper });

    fireEvent.change(screen.getByPlaceholderText('e.g. My Bitly Account'), { target: { value: 'My Bitly' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith('/settings/shortlinks/config/bitly', {
        method: 'PUT',
        body: JSON.stringify({ name: 'My Bitly', credentials: undefined, customDomain: undefined }),
      });
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('shows error toast on save failure', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: false });

    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockToasterShow).toHaveBeenCalledWith('Failed to save configuration', 'warning');
    });
  });

  it('renders loading state when provider is not found', async () => {
    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm {...defaultProps} identifier="nonexistent" />, { wrapper });

    expect(screen.getByText('Loading...')).toBeDefined();
  });

  describe('B-3a OAuth fields', () => {
    it('renders Client ID and Client Secret inputs for oauth2 providers', async () => {
      mockProvidersData = [oauthProvider];
      const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
      render(<ShortlinkProviderForm identifier="bitly-oauth" onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper });

      expect(screen.getByText('Client ID')).toBeDefined();
      expect(screen.getByText('Client Secret')).toBeDefined();
      expect(screen.getByPlaceholderText('Bitly OAuth Client ID')).toBeDefined();
    });

    it('does not render OAuth fields for apiKey providers', async () => {
      const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
      render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

      expect(screen.queryByText('Client ID')).toBeFalsy();
      expect(screen.queryByText('Client Secret')).toBeFalsy();
    });

    it('includes extraConfig in save body when clientId/clientSecret are set', async () => {
      mockFetchFn.mockResolvedValueOnce({ ok: true });
      mockProvidersData = [oauthProvider];
      const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
      render(<ShortlinkProviderForm identifier="bitly-oauth" onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper });

      const clientIdInput = screen.getByPlaceholderText('Bitly OAuth Client ID');
      fireEvent.change(clientIdInput, { target: { value: 'my-client-id' } });

      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockFetchFn).toHaveBeenCalledWith('/settings/shortlinks/config/bitly-oauth', {
          method: 'PUT',
          body: JSON.stringify({
            name: undefined,
            credentials: undefined,
            customDomain: undefined,
            extraConfig: { clientId: 'my-client-id' },
          }),
        });
      });
    });

    it('has a password reveal toggle on clientSecret field', async () => {
      mockProvidersData = [oauthProvider];
      const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
      render(<ShortlinkProviderForm identifier="bitly-oauth" onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper });

      const showButtons = screen.getAllByText('Show');
      expect(showButtons.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(showButtons[0]);
      expect(screen.getByText('Hide')).toBeDefined();
    });
  });

  describe('U2 password reveal toggle', () => {
    it('shows a reveal toggle for password credential fields', async () => {
      const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
      render(<ShortlinkProviderForm {...defaultProps} />, { wrapper });

      const showButtons = screen.getAllByText('Show');
      expect(showButtons.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(showButtons[0]);
      expect(screen.getByText('Hide')).toBeDefined();
    });
  });

  it('renders select fields when field type is select', async () => {
    mockProvidersData = [
      {
        identifier: 'provider-with-select',
        name: 'Select Provider',
        capabilities: { create: true, expand: false, statistics: false, bulkStatistics: false, customDomain: false },
        credentialFields: [
          { key: 'region', label: 'Region', type: 'select', required: true, options: [{ label: 'US', value: 'us' }, { label: 'EU', value: 'eu' }] },
        ],
        authType: 'apiKey',
      },
    ];

    const { ShortlinkProviderForm } = await import('./shortlink-provider-form');
    render(<ShortlinkProviderForm identifier="provider-with-select" onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper });

    const select = screen.getByRole('combobox');
    expect(select).toBeDefined();
    expect(screen.getByText('US')).toBeDefined();
    expect(screen.getByText('EU')).toBeDefined();
  });
});

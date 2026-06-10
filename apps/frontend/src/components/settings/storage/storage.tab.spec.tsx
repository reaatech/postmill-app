import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockToasterShow = vi.fn();

vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToasterShow }),
}));

const mockDeleteDialog = vi.fn().mockResolvedValue(false);

vi.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: mockDeleteDialog,
}));

vi.mock('@gitroom/frontend/components/settings/storage/provider-form.modal', () => ({
  ProviderFormModal: () => null,
}));

vi.mock('@gitroom/frontend/components/settings/storage/migration.modal', () => ({
  MigrationModal: () => null,
}));

vi.mock('@gitroom/frontend/components/settings/storage/audit.tab', () => ({
  AuditTab: () => null,
}));

let mockProviders: any[] = [];

const mockFetchFn = vi.fn(async (url: string) => {
  if (url === '/settings/storage') {
    return { ok: true, json: () => Promise.resolve(mockProviders) };
  }
  if (typeof url === 'string' && url.startsWith('/settings/storage/usage-breakdown')) {
    return { ok: true, json: () => Promise.resolve(null) };
  }
  if (typeof url === 'string' && url.startsWith('/settings/storage/usage')) {
    return { ok: true, json: () => Promise.resolve({ providers: [] }) };
  }
  if (typeof url === 'string' && url.startsWith('/settings/storage/quota-status')) {
    return { ok: true, json: () => Promise.resolve(null) };
  }
  return { ok: true, json: () => Promise.resolve({}) };
});

vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetchFn,
}));

const localProvider = {
  id: 'local-1',
  type: 'LOCAL',
  name: 'Local Storage',
  mounted: true,
  quotaBytes: null,
  bucket: null,
  region: null,
};

const s3Provider = {
  id: 's3-1',
  type: 'S3',
  name: 'AWS S3 Provider',
  mounted: true,
  quotaBytes: '10737418240',
  bucket: 'my-bucket',
  region: 'us-east-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockProviders = [];
});

describe('StorageTab', () => {
  describe('Base Storage (always on)', () => {
    it('renders the "Base Storage (always on)" heading when LOCAL providers exist', async () => {
      mockProviders = [localProvider, s3Provider];

      const { StorageTab } = await import('./storage.tab');
      render(<StorageTab />);

      await waitFor(() => {
        expect(screen.getByText('Base Storage (always on)')).toBeDefined();
      });
    });

    it('renders the LOCAL provider card under the base storage section', async () => {
      mockProviders = [localProvider];

      const { StorageTab } = await import('./storage.tab');
      render(<StorageTab />);

      await waitFor(() => {
        expect(screen.getByText('Always on')).toBeDefined();
        expect(screen.getByText('Local Storage')).toBeDefined();
      });
    });
  });

  describe('Additional Providers', () => {
    it('renders the "Additional Providers" heading when non-LOCAL providers exist', async () => {
      mockProviders = [localProvider, s3Provider];

      const { StorageTab } = await import('./storage.tab');
      render(<StorageTab />);

      await waitFor(() => {
        expect(screen.getByText('Additional Providers')).toBeDefined();
      });
    });

    it('renders non-LOCAL provider cards under the additional providers section', async () => {
      mockProviders = [s3Provider];

      const { StorageTab } = await import('./storage.tab');
      render(<StorageTab />);

      await waitFor(() => {
        expect(screen.getByText('Mounted')).toBeDefined();
        expect(screen.getByText('AWS S3 Provider')).toBeDefined();
      });
    });

    it('does not render "Additional Providers" heading when only LOCAL providers exist', async () => {
      mockProviders = [localProvider];

      const { StorageTab } = await import('./storage.tab');
      render(<StorageTab />);

      await waitFor(() => {
        expect(screen.getByText('Base Storage (always on)')).toBeDefined();
      });

      expect(screen.queryByText('Additional Providers')).toBeNull();
    });

    it('shows empty state text when no additional providers exist', async () => {
      mockProviders = [localProvider];

      const { StorageTab } = await import('./storage.tab');
      render(<StorageTab />);

      await waitFor(() => {
        expect(
          screen.getByText('No additional storage providers configured yet.'),
        ).toBeDefined();
      });
    });
  });

  describe('set-default UI', () => {
    it('does not render a "Set Default" button', async () => {
      mockProviders = [localProvider, s3Provider];

      const { StorageTab } = await import('./storage.tab');
      render(<StorageTab />);

      await waitFor(() => {
        expect(screen.getByText('Base Storage (always on)')).toBeDefined();
      });

      expect(screen.queryByText('Set Default')).toBeNull();
    });
  });
});

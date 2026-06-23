import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

let mockSearchParams = 'tab=channels';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

const mockT = vi.fn((_key: string, fallback?: string) => fallback ?? _key);

vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));

vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    id: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    tier: {
      current: 'PRO',
      team_members: true,
      webhooks: true,
      autoPost: true,
      public_api: true,
    },
  }),
  ContextWrapper: ({ children }: any) => children,
}));

vi.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isGeneral: true }),
}));

vi.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: vi.fn(), openModal: vi.fn(), closeCurrent: vi.fn() }),
  ModalWrapper: ({ children }: any) => children,
}));

vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () =>
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ name: '', bio: '', picture: null }),
    }),
}));

vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));

vi.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
  default: { useSWRConfig: () => ({ mutate: vi.fn() }) },
}));

vi.mock('react-hook-form', () => ({
  useForm: () => ({
    watch: vi.fn(() => null),
    register: vi.fn(),
    handleSubmit: (cb: any) => (e: any) => {
      e?.preventDefault?.();
      cb({});
    },
    setValue: vi.fn(),
    formState: { errors: {} },
    control: {},
    getValues: vi.fn(() => ({})),
  }),
  FormProvider: ({ children }: any) => children,
}));

vi.mock('@hookform/resolvers/class-validator', () => ({
  classValidatorResolver: vi.fn(() => vi.fn()),
}));

vi.mock('@gitroom/frontend/components/files/new.uploader', () => ({}));

vi.mock('@gitroom/frontend/components/files/file.component', () => ({
  showFileBox: vi.fn(),
}));

vi.mock('@gitroom/frontend/components/launches/launches.component', () => ({
  SVGLine: () => null,
}));

vi.mock('@gitroom/frontend/components/settings/channels/channels.tab', () => ({
  ChannelsTab: () => null,
}));

vi.mock('@gitroom/frontend/components/settings/roles/roles.tab', () => ({
  RolesTab: () => <div>Roles Tab Content</div>,
}));

let mockPermissions = {
  isLoaded: true,
  isResolved: true,
  role: 'owner' as string | null,
  isSuperAdmin: false,
  isOwner: true,
  isAdmin: true,
  hasPermission: (_resource: string, _action: string) => true,
  refresh: vi.fn(),
};

vi.mock('@gitroom/frontend/components/layout/use-permissions', () => ({
  usePermissions: () => mockPermissions,
}));

import { SettingsPopup } from './settings.component';

describe('SettingsPopup', () => {
  beforeEach(() => {
    mockSearchParams = 'tab=channels';
    mockPermissions = {
      isLoaded: true,
      isResolved: true,
      role: 'owner',
      isSuperAdmin: false,
      isOwner: true,
      isAdmin: true,
      hasPermission: () => true,
      refresh: vi.fn(),
    };
  });

  it('groups tabs into sections', () => {
    render(<SettingsPopup />);

    expect(screen.getByText('Workspace')).toBeDefined();
    expect(screen.getByText('Providers')).toBeDefined();
    expect(screen.getByText('Automation')).toBeDefined();
    expect(screen.getByText('Developer')).toBeDefined();
  });

  it('does not have a Profile tab', () => {
    render(<SettingsPopup />);

    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('defaults to channels tab when no tab param is given', () => {
    mockSearchParams = '';

    render(<SettingsPopup />);

    const channelsButtons = screen.getAllByText('Channels');
    expect(channelsButtons.length).toBeGreaterThan(0);
  });

  it('shows the Roles tab for members who can manage members', () => {
    mockPermissions.hasPermission = (resource, action) =>
      resource === 'settings' || (resource === 'members' && action === 'manage');

    render(<SettingsPopup />);

    expect(screen.getByText('Roles')).toBeDefined();
  });

  it('hides the Roles tab for members without members:manage or settings:update', () => {
    mockPermissions.hasPermission = (resource, action) =>
      resource === 'settings' && action === 'read';

    render(<SettingsPopup />);

    expect(screen.queryByText('Roles')).toBeNull();
  });

  it('renders the Roles tab content when selected', () => {
    mockSearchParams = 'tab=roles';

    render(<SettingsPopup />);

    expect(screen.getByText('Roles Tab Content')).toBeDefined();
  });

  it('R5: renders a no-access state for members without settings:read', () => {
    mockPermissions.hasPermission = () => false;
    mockPermissions.isOwner = false;
    mockPermissions.isAdmin = false;
    mockPermissions.role = 'viewer';

    render(<SettingsPopup />);

    expect(screen.getByText('No access to settings')).toBeDefined();
    expect(screen.queryByText('Channels')).toBeNull();
  });

  it('R5: keeps rendering settings while permissions are loading (no flash)', () => {
    mockPermissions.isResolved = false;
    mockPermissions.isLoaded = false;
    mockPermissions.hasPermission = () => false;

    render(<SettingsPopup />);

    expect(screen.queryByText('No access to settings')).toBeNull();
    expect(screen.getAllByText('Channels').length).toBeGreaterThan(0);
  });

  it('R5: platform super-admin always passes', () => {
    mockPermissions.hasPermission = () => true; // hook returns true for super-admin
    mockPermissions.isSuperAdmin = true;
    mockPermissions.role = null;

    render(<SettingsPopup />);

    expect(screen.queryByText('No access to settings')).toBeNull();
  });
});

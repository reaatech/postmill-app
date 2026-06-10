import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

let mockSearchParams = 'tab=settings';

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

vi.mock('@gitroom/frontend/components/media/new.uploader', () => ({}));

vi.mock('@gitroom/frontend/components/media/media.component', () => ({
  showMediaBox: vi.fn(),
}));

vi.mock('@gitroom/frontend/components/settings/global.settings', () => ({
  GlobalSettings: () => <div>Global Settings</div>,
}));

vi.mock('@gitroom/frontend/components/launches/launches.component', () => ({
  SVGLine: () => null,
}));

import { SettingsPopup } from './settings.component';

describe('SettingsPopup', () => {
  beforeEach(() => {
    mockSearchParams = 'tab=settings';
  });

  it('renders tabs sorted alphabetically with Settings first', () => {
    render(<SettingsPopup />);

    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent!.trim());

    expect(labels[0]).toBe('Settings');

    const rest = labels.slice(1);
    const sortedRest = [...rest].sort((a, b) => a.localeCompare(b));
    expect(rest).toEqual(sortedRest);
  });

  it('does not have a Profile tab', () => {
    render(<SettingsPopup />);

    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('defaults to settings tab when no tab param is given', () => {
    mockSearchParams = '';

    render(<SettingsPopup />);

    expect(screen.getByText('Global Settings')).toBeDefined();
  });
});

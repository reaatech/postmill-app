import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoleItem, PermissionItem, TeamMemberItem } from './hooks/use-roles';

const mockT = vi.fn((_key: string, fallback?: string) => fallback ?? _key);
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));

const mockShow = vi.fn();
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));

const mockFetch = vi.fn();
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));

const mockDeleteDialog = vi.fn();
vi.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => mockDeleteDialog(...args),
}));

let mockRoles: RoleItem[] | undefined;
let mockRolesLoading = false;
let mockRolesError: Error | undefined;
const mockMutateRoles = vi.fn();
let mockCatalog: PermissionItem[] | undefined;
let mockMembers: TeamMemberItem[] | undefined;
const mockMutateMembers = vi.fn();

vi.mock('./hooks/use-roles', () => ({
  useRoles: () => ({
    data: mockRoles,
    isLoading: mockRolesLoading,
    error: mockRolesError,
    mutate: mockMutateRoles,
  }),
  usePermissionsCatalog: () => ({ data: mockCatalog }),
  useTeamMembers: () => ({ data: mockMembers, mutate: mockMutateMembers }),
}));

import { RolesTab } from './roles.tab';

const systemRole: RoleItem = {
  id: 'r-owner',
  key: 'owner',
  name: 'Owner',
  description: 'Full access',
  isSystem: true,
  permissions: [
    { permission: { id: 'p1', resource: 'posts', action: 'manage' } },
  ],
};

const customRole: RoleItem = {
  id: 'r-custom',
  key: 'content-manager',
  name: 'Content Manager',
  description: 'Posts only',
  isSystem: false,
  permissions: [
    { permission: { id: 'p2', resource: 'posts', action: 'create' } },
  ],
};

describe('RolesTab', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockShow.mockReset();
    mockDeleteDialog.mockReset();
    mockMutateRoles.mockReset();
    mockMutateMembers.mockReset();
    mockRoles = [systemRole, customRole];
    mockRolesLoading = false;
    mockRolesError = undefined;
    mockCatalog = [
      { id: 'p1', resource: 'posts', action: 'manage' },
      { id: 'p2', resource: 'posts', action: 'create' },
    ];
    mockMembers = [
      {
        roleId: 'r-owner',
        user: { id: 'u1', email: 'owner@x.com', profile: { name: 'Owner' } },
      },
      {
        roleId: null,
        user: { id: 'u2', email: 'member@x.com', profile: null },
      },
    ];
  });

  it('lists system and custom roles with a System badge on system roles', () => {
    render(<RolesTab />);
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Content Manager').length).toBeGreaterThan(0);
    expect(screen.getAllByText('System').length).toBe(1);
  });

  it('shows a loading state', () => {
    mockRolesLoading = true;
    mockRoles = undefined;
    render(<RolesTab />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('shows an error state', () => {
    mockRolesError = new Error('boom');
    mockRoles = undefined;
    render(<RolesTab />);
    expect(screen.getByText('Failed to load roles')).toBeDefined();
  });

  it('system roles cannot be edited or deleted, custom roles can', () => {
    render(<RolesTab />);
    // one Edit + one Delete (custom role only), two Clone buttons
    expect(screen.getAllByText('Clone').length).toBe(2);
    expect(screen.getAllByText('Edit').length).toBe(1);
    expect(screen.getAllByText('Delete').length).toBe(1);
  });

  it('Create Role opens the editor', () => {
    render(<RolesTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Role' }));
    expect(screen.getByLabelText('Role name')).toBeDefined();
  });

  it('Clone opens the create editor prefilled from the source role', () => {
    render(<RolesTab />);
    fireEvent.click(screen.getAllByText('Clone')[0]);
    const nameInput = screen.getByLabelText('Role name') as HTMLInputElement;
    expect(nameInput.value).toBe('Owner (Copy)');
    const manageBox = screen.getByLabelText(
      'posts:manage'
    ) as HTMLInputElement;
    expect(manageBox.checked).toBe(true);
  });

  it('Edit opens the editor prefilled with the custom role', () => {
    render(<RolesTab />);
    fireEvent.click(screen.getByText('Edit'));
    const nameInput = screen.getByLabelText('Role name') as HTMLInputElement;
    expect(nameInput.value).toBe('Content Manager');
  });

  it('Delete confirms, calls the API and refreshes', async () => {
    mockDeleteDialog.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: true });
    render(<RolesTab />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/settings/roles/r-custom', {
        method: 'DELETE',
      })
    );
    expect(mockMutateRoles).toHaveBeenCalled();
    expect(mockShow).toHaveBeenCalledWith('Role deleted', 'success');
  });

  it('Delete aborts when the confirm dialog is declined', async () => {
    mockDeleteDialog.mockResolvedValue(false);
    render(<RolesTab />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(mockDeleteDialog).toHaveBeenCalled());
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows a warning when deletion fails', async () => {
    mockDeleteDialog.mockResolvedValue(true);
    mockFetch.mockResolvedValue({ ok: false });
    render(<RolesTab />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith('Failed to delete role', 'warning')
    );
    expect(mockMutateRoles).not.toHaveBeenCalled();
  });

  it('lists team members with their current role selected', () => {
    render(<RolesTab />);
    const ownerSelect = screen.getByLabelText(
      'role-owner@x.com'
    ) as HTMLSelectElement;
    expect(ownerSelect.value).toBe('r-owner');
    const memberSelect = screen.getByLabelText(
      'role-member@x.com'
    ) as HTMLSelectElement;
    expect(memberSelect.value).toBe('');
  });

  it('assigning a role PUTs to /settings/roles/team/:userId/role and refreshes', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    render(<RolesTab />);
    fireEvent.change(screen.getByLabelText('role-member@x.com'), {
      target: { value: 'r-custom' },
    });
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/settings/roles/team/u2/role', {
        method: 'PUT',
        body: JSON.stringify({ roleId: 'r-custom' }),
      })
    );
    expect(mockMutateMembers).toHaveBeenCalled();
    expect(mockShow).toHaveBeenCalledWith('Role assigned', 'success');
  });

  it('shows a warning when assignment fails', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    render(<RolesTab />);
    fireEvent.change(screen.getByLabelText('role-member@x.com'), {
      target: { value: 'r-custom' },
    });
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith('Failed to assign role', 'warning')
    );
    expect(mockMutateMembers).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no team members', () => {
    mockMembers = [];
    render(<RolesTab />);
    expect(screen.getByText('No team members yet')).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { RolesService } from './roles.service';

interface MockRolesRepository {
  getRoles: ReturnType<typeof vi.fn>;
  getRole: ReturnType<typeof vi.fn>;
  createRole: ReturnType<typeof vi.fn>;
  updateRole: ReturnType<typeof vi.fn>;
  deleteRole: ReturnType<typeof vi.fn>;
  assignRoleToMember: ReturnType<typeof vi.fn>;
  getPermissions: ReturnType<typeof vi.fn>;
  getMemberEffectivePermissions: ReturnType<typeof vi.fn>;
}

describe('RolesService', () => {
  let repository: MockRolesRepository;
  let service: RolesService;

  beforeEach(() => {
    repository = {
      getRoles: vi.fn(),
      getRole: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
      assignRoleToMember: vi.fn(),
      getPermissions: vi.fn(),
      getMemberEffectivePermissions: vi.fn(),
    };
    service = new RolesService(repository as never);
  });

  describe('getEffectivePermissions', () => {
    it('returns null when the user is not a member', async () => {
      repository.getMemberEffectivePermissions.mockResolvedValue(null);
      expect(await service.getEffectivePermissions('o1', 'u1')).toBeNull();
      expect(repository.getMemberEffectivePermissions).toHaveBeenCalledWith(
        'o1',
        'u1'
      );
    });

    it('returns null when the membership has no role assigned', async () => {
      repository.getMemberEffectivePermissions.mockResolvedValue({
        id: 'uo1',
        roleRef: null,
      });
      expect(await service.getEffectivePermissions('o1', 'u1')).toBeNull();
    });

    it('maps the role key and flattens resource:action permission strings', async () => {
      repository.getMemberEffectivePermissions.mockResolvedValue({
        id: 'uo1',
        roleRef: {
          key: 'editor',
          permissions: [
            { permission: { resource: 'posts', action: 'manage' } },
            { permission: { resource: 'analytics', action: 'read' } },
          ],
        },
      });

      expect(await service.getEffectivePermissions('o1', 'u1')).toEqual({
        role: 'editor',
        permissions: ['posts:manage', 'analytics:read'],
      });
    });
  });

  describe('createRole', () => {
    it('rejects an empty permission set', async () => {
      await expect(
        service.createRole('o1', {
          key: 'k',
          name: 'n',
          permissionIds: [],
        })
      ).rejects.toThrow(HttpException);
    });

    it('rejects unknown permission ids', async () => {
      repository.getPermissions.mockResolvedValue([{ id: 'p1' }]);
      await expect(
        service.createRole('o1', {
          key: 'k',
          name: 'n',
          permissionIds: ['p1', 'bogus'],
        })
      ).rejects.toThrow('Invalid permission IDs: bogus');
    });

    it('creates a role with valid permissions', async () => {
      repository.getPermissions.mockResolvedValue([{ id: 'p1' }]);
      repository.createRole.mockResolvedValue({ id: 'r1' });
      expect(
        await service.createRole('o1', {
          key: 'k',
          name: 'n',
          permissionIds: ['p1'],
        })
      ).toEqual({ id: 'r1' });
    });
  });

  describe('updateRole', () => {
    it('returns null for an unknown role', async () => {
      repository.getRole.mockResolvedValue(null);
      expect(await service.updateRole('o1', 'r1', { name: 'x' })).toBeNull();
    });

    it('refuses to modify system roles', async () => {
      repository.getRole.mockResolvedValue({ id: 'r1', isSystem: true });
      await expect(
        service.updateRole('o1', 'r1', { name: 'x' })
      ).rejects.toThrow('Cannot modify system roles');
    });

    it('rejects clearing all permissions', async () => {
      await expect(
        service.updateRole('o1', 'r1', { permissionIds: [] })
      ).rejects.toThrow(HttpException);
    });

    it('updates a custom role', async () => {
      repository.getPermissions.mockResolvedValue([{ id: 'p1' }]);
      repository.getRole.mockResolvedValue({ id: 'r1', isSystem: false });
      repository.updateRole.mockResolvedValue({ id: 'r1', name: 'x' });
      expect(
        await service.updateRole('o1', 'r1', {
          name: 'x',
          permissionIds: ['p1'],
        })
      ).toEqual({ id: 'r1', name: 'x' });
    });
  });

  describe('deleteRole', () => {
    it('returns null for an unknown role', async () => {
      repository.getRole.mockResolvedValue(null);
      expect(await service.deleteRole('o1', 'r1')).toBeNull();
    });

    it('refuses to delete system roles', async () => {
      repository.getRole.mockResolvedValue({ id: 'r1', isSystem: true });
      await expect(service.deleteRole('o1', 'r1')).rejects.toThrow(
        'Cannot delete system roles'
      );
    });

    it('deletes custom roles', async () => {
      repository.getRole.mockResolvedValue({ id: 'r1', isSystem: false });
      repository.deleteRole.mockResolvedValue({ id: 'r1' });
      expect(await service.deleteRole('o1', 'r1')).toEqual({ id: 'r1' });
    });
  });

  describe('assignRoleToMember', () => {
    it('404s for an unknown role', async () => {
      repository.getRole.mockResolvedValue(null);
      await expect(
        service.assignRoleToMember('o1', 'u1', 'r1')
      ).rejects.toThrow('Role not found');
    });

    it('404s when the member is not part of the org', async () => {
      repository.getRole.mockResolvedValue({ id: 'r1' });
      repository.assignRoleToMember.mockResolvedValue(null);
      await expect(
        service.assignRoleToMember('o1', 'u1', 'r1')
      ).rejects.toThrow('Member not found in organization');
    });

    it('assigns the role', async () => {
      repository.getRole.mockResolvedValue({ id: 'r1' });
      repository.assignRoleToMember.mockResolvedValue({ id: 'uo1' });
      expect(await service.assignRoleToMember('o1', 'u1', 'r1')).toEqual({
        id: 'uo1',
      });
    });
  });
});

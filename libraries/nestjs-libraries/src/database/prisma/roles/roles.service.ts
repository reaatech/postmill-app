import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RolesRepository } from './roles.repository';

@Injectable()
export class RolesService {
  constructor(private _repository: RolesRepository) {}

  getRoles(orgId: string) {
    return this._repository.getRoles(orgId);
  }

  getRole(orgId: string, roleId: string) {
    return this._repository.getRole(orgId, roleId);
  }

  async createRole(
    orgId: string,
    data: { key: string; name: string; description?: string; permissionIds: string[] },
  ) {
    if (!data.permissionIds || data.permissionIds.length === 0) {
      throw new HttpException('At least one permission is required', HttpStatus.BAD_REQUEST);
    }

    const permissions = await this._repository.getPermissions();
    const validIds = new Set(permissions.map((p) => p.id));
    const invalidIds = data.permissionIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new HttpException(
        `Invalid permission IDs: ${invalidIds.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this._repository.createRole(orgId, data);
  }

  async updateRole(
    orgId: string,
    roleId: string,
    data: { name?: string; description?: string; permissionIds?: string[] },
  ) {
    if (data.permissionIds !== undefined) {
      if (data.permissionIds.length === 0) {
        throw new HttpException('At least one permission is required', HttpStatus.BAD_REQUEST);
      }

      const permissions = await this._repository.getPermissions();
      const validIds = new Set(permissions.map((p) => p.id));
      const invalidIds = data.permissionIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new HttpException(
          `Invalid permission IDs: ${invalidIds.join(', ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const role = await this._repository.getRole(orgId, roleId);
    if (!role) return null;
    if (role.isSystem) {
      throw new HttpException('Cannot modify system roles', HttpStatus.FORBIDDEN);
    }

    return this._repository.updateRole(orgId, roleId, data);
  }

  async deleteRole(orgId: string, roleId: string) {
    const role = await this._repository.getRole(orgId, roleId);
    if (!role) return null;
    if (role.isSystem) {
      throw new HttpException('Cannot delete system roles', HttpStatus.FORBIDDEN);
    }

    return this._repository.deleteRole(orgId, roleId);
  }

  async assignRoleToMember(orgId: string, userId: string, roleId: string) {
    const role = await this._repository.getRole(orgId, roleId);
    if (!role) {
      throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
    }

    const result = await this._repository.assignRoleToMember(orgId, userId, roleId);
    if (!result) {
      throw new HttpException('Member not found in organization', HttpStatus.NOT_FOUND);
    }

    return result;
  }

  getPermissions() {
    return this._repository.getPermissions();
  }

  /**
   * Resolves the acting member's effective permission set for an org —
   * the single resolution path shared by `OrgRbacGuard` and `GET /settings/roles/me`.
   * Returns null when the user is not an enabled member or has no role assigned.
   */
  async getEffectivePermissions(
    orgId: string,
    userId: string,
  ): Promise<{ role: string; permissions: string[] } | null> {
    const membership = await this._repository.getMemberEffectivePermissions(
      orgId,
      userId,
    );
    if (!membership || !membership.roleRef) {
      return null;
    }

    return {
      role: membership.roleRef.key,
      permissions: membership.roleRef.permissions.map(
        (rp) => `${rp.permission.resource}:${rp.permission.action}`,
      ),
    };
  }
}

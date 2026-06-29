import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RolesRepository } from './roles.repository';
import { AuditRepository } from '@gitroom/nestjs-libraries/database/prisma/audit/audit.repository';

@Injectable()
export class RolesService {
  private readonly _logger = new Logger(RolesService.name);
  constructor(
    private _repository: RolesRepository,
    private _audit: AuditRepository
  ) {}

  // Best-effort audit (B4): a logging failure must never break the role mutation.
  private async _audited(entry: {
    organizationId: string;
    action: string;
    entity: string;
    entityId?: string;
    entityName?: string;
    details?: string;
  }) {
    try {
      await this._audit.create(entry);
    } catch (err) {
      this._logger.warn(`Failed to audit ${entry.action}: ${(err as any)?.message}`);
    }
  }

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

    const created = await this._repository.createRole(orgId, data);
    await this._audited({
      organizationId: orgId,
      action: 'role.create',
      entity: 'role',
      entityId: created?.id,
      entityName: data.name,
      details: JSON.stringify({ key: data.key, permissionIds: data.permissionIds }),
    });
    return created;
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

    const updated = await this._repository.updateRole(orgId, roleId, data);
    await this._audited({
      organizationId: orgId,
      action: 'role.update',
      entity: 'role',
      entityId: roleId,
      entityName: data.name ?? role.name,
      details: JSON.stringify(data),
    });
    return updated;
  }

  async deleteRole(orgId: string, roleId: string) {
    const role = await this._repository.getRole(orgId, roleId);
    if (!role) return null;
    if (role.isSystem) {
      throw new HttpException('Cannot delete system roles', HttpStatus.FORBIDDEN);
    }

    const deleted = await this._repository.deleteRole(orgId, roleId);
    await this._audited({
      organizationId: orgId,
      action: 'role.delete',
      entity: 'role',
      entityId: roleId,
      entityName: role.name,
    });
    return deleted;
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

    await this._audited({
      organizationId: orgId,
      action: 'member.role.assign',
      entity: 'member',
      entityId: userId,
      entityName: role.name,
      details: JSON.stringify({ memberUserId: userId, roleId }),
    });
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

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesService } from '@gitroom/nestjs-libraries/database/prisma/roles/roles.service';
import { REQUIRE_PERMISSION_KEY, RequirePermissionMetadata } from './require-permission.decorator';

const RBAC_PERMS_CACHE = Symbol('rbacPermsCache');

interface RbacRequest {
  user?: { id?: string; isSuperAdmin?: boolean };
  orgId?: string;
  [RBAC_PERMS_CACHE]?: Map<string, string[] | null>;
}

@Injectable()
export class OrgRbacGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<RequirePermissionMetadata>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RbacRequest>();
    const userId = request?.user?.id;
    const orgId = request?.orgId;

    if (!userId || !orgId) {
      throw new ForbiddenException('Not authenticated');
    }

    if (request?.user?.isSuperAdmin) {
      return true;
    }

    const effectivePermissions = await this._resolvePermissions(request, userId, orgId);

    if (effectivePermissions === null) {
      throw new ForbiddenException('Not a member of this organization');
    }

    if (effectivePermissions.includes(`${metadata.resource}:manage`)) {
      return true;
    }

    if (effectivePermissions.includes(`${metadata.resource}:${metadata.action}`)) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }

  private async _resolvePermissions(
    request: RbacRequest,
    userId: string,
    orgId: string,
  ): Promise<string[] | null> {
    const cacheKey = `${userId}_${orgId}`;
    const cache = (request[RBAC_PERMS_CACHE] ??= new Map<string, string[] | null>());
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const effective = await this.rolesService.getEffectivePermissions(orgId, userId);
    const perms = effective ? effective.permissions : null;
    cache.set(cacheKey, perms);
    return perms;
  }
}

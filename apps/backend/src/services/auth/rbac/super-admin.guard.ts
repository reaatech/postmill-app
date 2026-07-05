import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

interface SuperAdminRequest {
  user?: { isSuperAdmin?: boolean };
}

/**
 * Structural backstop (PROVIDER_REMEDIATION 3.2) for every `/admin/*` platform
 * controller. `permissions.service.ts` grants `Sections.ADMIN` unconditionally, so
 * `@CheckPolicies([Create, ADMIN])` is a no-op super-admin gate — the real gate has
 * to rest on `User.isSuperAdmin` (DB-resolved by AuthMiddleware, not token-trusted).
 * Applied at class level so a future handler can't silently reopen the gap by
 * forgetting the per-handler `_assertSuperAdmin` line (which stays for defense in depth).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SuperAdminRequest>();
    if (!request?.user?.isSuperAdmin) {
      throw new ForbiddenException('Super admin access required');
    }
    return true;
  }
}

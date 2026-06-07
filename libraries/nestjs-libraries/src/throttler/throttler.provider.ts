import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    // 1G: throttle every route by default. The base ThrottlerGuard applies the
    // global default limit unless @SkipThrottle is present, and honors any
    // per-route @Throttle override automatically. (Previously this guard
    // returned true for all non-decorated routes, making the global throttle —
    // and every @Throttle added by 3Q/3AC — inert.)
    return super.canActivate(context);
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const orgId = req.org?.id || req.ip || 'anon';
    return (
      orgId + '_' + (req.url.indexOf('/posts') > -1 ? 'posts' : 'other')
    );
  }
}

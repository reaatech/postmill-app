import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();
    const hasThrottleDecorator = this.throttlers.some(t =>
      this.reflector.getAllAndOverride(
        ('THROTTLER:LIMIT' as string) + t.name, [handler, classRef]
      ) !== undefined
    );

    if (hasThrottleDecorator) {
      return super.canActivate(context);
    }

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
